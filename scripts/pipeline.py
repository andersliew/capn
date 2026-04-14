"""
CAPN Security - Live Email Pipeline
- Uses IMAP with Gmail App Password (no OAuth needed)
- Stores real Gmail UIDs to prevent duplicates
- Inserts into patrol_reports_raw only (clean/dashboard are views)
- Runs 24/7, polling every 5 minutes
"""

import imaplib
import email
import psycopg2
from psycopg2.extras import execute_values
import re
from datetime import datetime, timezone
import time
import logging
import os
import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional, Tuple

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

# Config 
DB_PARAMS = {
    "host":     os.environ.get("DB_HOST",     "ep-green-unit-aajscb9v-pooler.westus3.azure.neon.tech"),
    "port":     int(os.environ.get("DB_PORT", 5432)),
    "database": os.environ.get("DB_NAME",     "neondb"),
    "user":     os.environ.get("DB_USER",     "neondb_owner"),
    "password": os.environ.get("DB_PASSWORD", "npg_CI9XpmMFOe7U"),
    "sslmode":  "require"
}

GMAIL_CREDS = {
    "user":     os.environ.get("GMAIL_USER",     "reports@capnapp.com"),
    "password": os.environ.get("GMAIL_PASSWORD", "tzar siap yccu snbo")
}

POLL_INTERVAL = 300   # 5 minutes
BATCH_SIZE    = 200   # emails per IMAP fetch batch (lower = more stable)
MAX_WORKERS   = 4     # parallel parse threads
CHUNK_SIZE    = 10000 # emails per historical backfill chunk

# Location normalization 
LOCATION_MAP = {
    "bailey":          "Bailey Farm Apartments",
    "mazda tire":      "Mazda Lot",
    "mazda lot":       "Mazda Lot",
    "alister parx":    "Alister Parx",
    "stinson":         "Stinson Apartments",
    "ember":           "Ember Apartments",
    "brio":            "Brio Condominiums",
    "serene village":  "Serene Village Apartments",
    "woodland greens": "Woodland Greens",
    "the m seattle":   "The M Seattle",
    "boardwalk":       "Boardwalk Condominiums",
    "lumen":           "Lumen",
    "northwood":       "Northwood Apartments",
    "shoreside":       "Shoreside Village",
    "lakeside":        "Lakeside Apartments",
    "westmont":        "Westmont Apartments",
    "everett cove":    "Everett Cove Apartments",
    "parkview":        "Parkview Apartments",
    "nova north":      "Nova North Apartments",
    "river":           "River's Landing",
    "family tree":     "Family Tree",
    "bristol":         "Bristol Square",
    "the station":     "The Station at Mill Creek",
    "broadway auto":   "Broadway Auto",
    "jeremy":          "Jeremy's House",
}

# Report type normalization 
REPORT_TYPE_PATTERNS = [
    (r"clock.?out|check.?out",                      "Check-Out Report"),
    (r"clock.?in|check.?in",                        "Check-In Report"),
    (r"trespass",                                    "Trespassing Report"),
    (r"parking",                                     "Parking Report"),
    (r"maintenance",                                 "Maintenance Report"),
    (r"on.?demand|call\s+report",                   "On-Demand Call"),
    (r"conduct",                                     "Conduct Patrol"),
    (r"policy\s+violation",                         "Policy Violation"),
    (r"gym|cabana|lock.?up|amenity|pool|laundry",   "Lock-Up Report"),
    (r"dismounted",                                  "Dismounted Patrol"),
    (r"trespass|crime",                              "Crime"),
    (r"medical",                                     "Medical Emergency"),
    (r"police",                                      "Police"),
    (r"daily.?activity",                             "Daily Activity Report"),
    (r"\d*(st|nd|rd|th)?\s*patrol|patrol",          "Patrol Report"),
]

# Helpers
def normalize_location(raw: str) -> str:
    if not raw:
        return ""
    # Strip HTML
    raw = re.sub(r'<[^>]*>', '', raw).strip()
    # Strip "Time Submitted" bleed-in
    raw = raw.split("Time Submitted")[0].strip()
    lower = raw.lower()
    for key, clean in LOCATION_MAP.items():
        if key in lower:
            return clean
    return raw.title()

def normalize_report_type(raw: str) -> str:
    if not raw:
        return "Other"
    # Strip HTML
    raw = re.sub(r'<[^>]*>', '', raw).strip()
    lower = raw.lower()
    for pattern, clean in REPORT_TYPE_PATTERNS:
        if re.search(pattern, lower):
            return clean
    return "Other"

def decode_header(header: str) -> str:
    if not header:
        return ""
    from email.header import decode_header as _dh
    parts = []
    for part, enc in _dh(header):
        if isinstance(part, bytes):
            part = part.decode(enc or "utf-8", errors="ignore")
        parts.append(str(part))
    return " ".join(parts)

def get_email_body(msg) -> Tuple[str, int]:
    body = ""
    attachments = 0
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            fn = part.get_filename()
            if fn:
                attachments += 1
            elif ct == "text/plain" and not body:
                try:
                    body = part.get_payload(decode=True).decode("utf-8", errors="ignore")[:10000]
                except Exception:
                    pass
        # Fallback to HTML if no plain text
        if not body:
            for part in msg.walk():
                if part.get_content_type() == "text/html" and not body:
                    try:
                        html = part.get_payload(decode=True).decode("utf-8", errors="ignore")
                        body = re.sub(r'<[^>]*>', ' ', html)
                        body = re.sub(r'\s+', ' ', body).strip()[:10000]
                    except Exception:
                        pass
    else:
        try:
            body = msg.get_payload(decode=True).decode("utf-8", errors="ignore")[:10000]
        except Exception:
            pass
    return body, attachments

def extract_field(text: str, *patterns: str) -> str:
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            val = m.group(1).strip()
            # Strip HTML from extracted value
            val = re.sub(r'<[^>]*>', '', val).strip()
            return val
    return ""

# Parser
def parse_email(raw_email: Dict) -> Optional[Dict]:
    try:
        body    = raw_email["body"]
        subject = raw_email["subject"]
        full    = f"{subject}\n{body}"

        location_raw    = extract_field(full, r"(?:property|location|site)\s*[:\-]\s*(.+)")
        officer_raw     = extract_field(full, r"(?:officer|guard|submitted by|name|by)\s*[:\-]\s*(.+)")
        report_type_raw = extract_field(full, r"(?:report type|type)\s*[:\-]\s*(.+)")
        date_str        = extract_field(full, r"(?:^|\n)date\s*[:\-]\s*(.+)")
        time_str        = extract_field(full, r"(?:^|\n)time\s*[:\-]\s*(.+)")
        details         = extract_field(full, r"(?:details|notes|description)\s*[:\-]\s*([\s\S]{10,}?)(?:\n\n|\Z)")

        if not report_type_raw:
            report_type_raw = subject

        received_at = raw_email["received_at"]

        # Parse datetime with multiple format fallbacks
        patrol_dt = received_at
        if date_str:
            for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%B %d, %Y", "%m/%d/%y"):
                try:
                    d = datetime.strptime(date_str.strip()[:10], fmt)
                    if time_str:
                        try:
                            t = datetime.strptime(time_str.strip()[:5], "%H:%M")
                            patrol_dt = d.replace(hour=t.hour, minute=t.minute, tzinfo=timezone.utc)
                        except Exception:
                            patrol_dt = d.replace(tzinfo=timezone.utc)
                    break
                except Exception:
                    continue

        date_fmt     = patrol_dt.strftime("%m/%d/%Y")
        datetime_fmt = patrol_dt.strftime("%m/%d/%Y %H:%M")
        time_fmt     = patrol_dt.strftime("%H:%M")

        has_images = bool(re.search(r"\.(jpg|jpeg|png|gif|webp|bmp)", body, re.I)) \
                     or raw_email["num_attachments"] > 0

        # Clean officer name
        officer_clean = re.sub(r'<[^>]*>', '', officer_raw).strip()[:255]

        return {
            "email_id":         raw_email["email_id"],  # Gmail UID
            "report_type":      normalize_report_type(report_type_raw),
            "date":             date_fmt,
            "time":             time_fmt,
            "datetime":         datetime_fmt,
            "security_officer": officer_clean,
            "location":         normalize_location(location_raw),
            "report_details":   details[:5000],
            "has_images":       str(has_images),
            "num_attachments":  str(raw_email["num_attachments"]),
        }

    except Exception as e:
        logger.error(f"Parse error: {e}")
        return None

# DB helpers
def get_db_conn():
    return psycopg2.connect(**DB_PARAMS)

def get_processed_ids(conn) -> set:
    with conn.cursor() as cur:
        cur.execute("SELECT gmail_message_id FROM patrol_reports_raw WHERE gmail_message_id IS NOT NULL")
        return {str(row[0]) for row in cur.fetchall()}

def bulk_insert(conn, rows: List[Dict]) -> int:
    if not rows:
        return 0
    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO patrol_reports_raw
                (gmail_message_id, report_type, date, time, datetime,
                 security_officer, location, report_details,
                 has_images, num_attachments)
            VALUES %s
            ON CONFLICT (gmail_message_id) DO NOTHING
        """, [(
            r["email_id"],
            r["report_type"], r["date"], r["time"], r["datetime"],
            r["security_officer"], r["location"], r["report_details"],
            r["has_images"], r["num_attachments"],
        ) for r in rows])
    conn.commit()
    return len(rows)

# IMAP fetcher
class IMAPFetcher:
    def __init__(self, user, password):
        self.user     = user
        self.password = password
        self.imap     = None

    def connect(self):
        self.imap = imaplib.IMAP4_SSL("imap.gmail.com")
        self.imap.login(self.user, self.password)
        self.imap.select("INBOX")
        logger.info("Connected to Gmail IMAP")

    def disconnect(self):
        try:
            self.imap.logout()
        except Exception:
            pass

    def fetch_all_ids(self):
        _, msgs = self.imap.search(None, "ALL")
        return msgs[0].split()

    def fetch_since(self, since_dt: datetime):
        date_str = since_dt.strftime("%d-%b-%Y")
        _, msgs = self.imap.search(None, f'SINCE "{date_str}"')
        return msgs[0].split()

    def fetch_emails_by_ids(self, email_ids) -> List[Dict]:
        results = []
        for i in range(0, len(email_ids), BATCH_SIZE):
            batch   = email_ids[i:i + BATCH_SIZE]
            ids_str = ",".join(id.decode() for id in batch)

            # Retry up to 3 times on connection drop
            data = []
            for attempt in range(3):
                try:
                    status, data = self.imap.fetch(ids_str, "(RFC822 UID)")
                    if status == "OK":
                        break
                except Exception as e:
                    logger.warning(f"  IMAP error attempt {attempt+1}: {e} — reconnecting...")
                    time.sleep(2)
                    try:
                        self.connect()
                    except Exception:
                        pass

            for response in data:
                if isinstance(response, tuple):
                    try:
                        uid_match = re.search(rb'UID (\d+)', response[0])
                        gmail_id  = uid_match.group(1).decode() if uid_match \
                                    else hashlib.md5(response[1][:500]).hexdigest()

                        msg         = email.message_from_bytes(response[1])
                        body, atts  = get_email_body(msg)
                        received_at = None
                        date_hdr    = msg.get("Date", "")
                        if date_hdr:
                            try:
                                received_at = email.utils.parsedate_to_datetime(date_hdr)
                            except Exception:
                                pass
                        if not received_at:
                            received_at = datetime.now(tz=timezone.utc)

                        results.append({
                            "email_id":        gmail_id,
                            "subject":         decode_header(msg.get("Subject", "")),
                            "sender":          email.utils.parseaddr(msg.get("From", ""))[1],
                            "received_at":     received_at,
                            "body":            body,
                            "num_attachments": atts,
                        })
                    except Exception as e:
                        logger.error(f"Error reading email: {e}")

            logger.info(f"  Fetched {min(i+BATCH_SIZE, len(email_ids))}/{len(email_ids)} emails")
        return results

# Main processor 
class CAPNEmailProcessor:
    def __init__(self):
        self.fetcher   = IMAPFetcher(GMAIL_CREDS["user"], GMAIL_CREDS["password"])
        self.conn      = None
        self.last_poll = None

    def db_connect(self):
        self.conn = get_db_conn()
        logger.info("Connected to Neon PostgreSQL")

    def _db_ok(self):
        try:
            self.conn.cursor().execute("SELECT 1")
            return True
        except Exception:
            return False

    def process_batch(self, raw_emails: List[Dict], known_ids: set) -> int:
        new_emails = [e for e in raw_emails if e["email_id"] not in known_ids]
        if not new_emails:
            return 0

        total = 0
        SUB_BATCH = 5000
        for i in range(0, len(new_emails), SUB_BATCH):
            sub = new_emails[i:i+SUB_BATCH]
            parsed = []
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
                futures = {ex.submit(parse_email, e): e for e in sub}
                for f in as_completed(futures):
                    r = f.result()
                    if r:
                        parsed.append(r)

            if not self._db_ok():
                logger.info("  Reconnecting to DB...")
                self.db_connect()

            inserted = bulk_insert(self.conn, parsed)
            total += inserted
            known_ids.update(e["email_id"] for e in sub)
            logger.info(f"  Inserted {total} so far...")

        return total

    def run_historical(self, limit=None):
        logger.info("Running historical backfill...")
        self.fetcher.connect()
        self.db_connect()

        known_ids = get_processed_ids(self.conn)
        logger.info(f"  Already processed: {len(known_ids)} emails")

        all_ids = self.fetcher.fetch_all_ids()
        if limit:
            all_ids = all_ids[:limit]
        logger.info(f"  Total in inbox: {len(all_ids)}")

        total = 0
        for i in range(0, len(all_ids), CHUNK_SIZE):
            chunk = all_ids[i:i+CHUNK_SIZE]
            logger.info(f"  Chunk {i//CHUNK_SIZE+1}/{(len(all_ids)-1)//CHUNK_SIZE+1}...")
            raw_emails = self.fetcher.fetch_emails_by_ids(chunk)
            total += self.process_batch(raw_emails, known_ids)

        logger.info(f"Backfill complete — inserted {total} new records")
        self.fetcher.disconnect()

    def run_live(self):
        logger.info("CAPN Live Pipeline starting...")
        self.db_connect()
        self.fetcher.connect()

        known_ids = get_processed_ids(self.conn)
        since_dt  = datetime.now(tz=timezone.utc).replace(day=max(1, datetime.now().day - 7))
        recent_ids = self.fetcher.fetch_since(since_dt)
        logger.info(f"  Startup: checking {len(recent_ids)} recent emails...")
        raw_emails = self.fetcher.fetch_emails_by_ids(recent_ids)
        inserted   = self.process_batch(raw_emails, known_ids)
        logger.info(f"  Startup: inserted {inserted} new records")

        while True:
            try:
                logger.info(f"Sleeping {POLL_INTERVAL//60} minutes...")
                time.sleep(POLL_INTERVAL)
                logger.info("Polling for new emails...")

                try:
                    self.fetcher.imap.noop()
                except Exception:
                    logger.info("  Reconnecting to Gmail...")
                    self.fetcher.connect()

                if not self._db_ok():
                    logger.info("  Reconnecting to DB...")
                    self.db_connect()

                poll_since     = self.last_poll or datetime.now(tz=timezone.utc)
                new_ids        = self.fetcher.fetch_since(poll_since)
                self.last_poll = datetime.now(tz=timezone.utc)

                if not new_ids:
                    logger.info("  No new emails.")
                    continue

                logger.info(f"  Found {len(new_ids)} new emails")
                raw_emails = self.fetcher.fetch_emails_by_ids(new_ids)
                inserted   = self.process_batch(raw_emails, known_ids)
                logger.info(f"Inserted {inserted} new records")

            except KeyboardInterrupt:
                logger.info("Shutting down.")
                self.fetcher.disconnect()
                break
            except Exception as e:
                logger.error(f"Poll error: {e} — retrying next cycle")
