"""
Gmail → Neon sync for patrol_reports_raw.

Run from repository root:
  python scripts/sync_gmail_to_neon.py
  python scripts/sync_gmail_to_neon.py --full   # re-list entire GMAIL_QUERY window (slower)

Incremental by default: stores max Gmail `internalDate` in `gmail_sync_state` and narrows
`messages.list` with `after:YYYY/MM/DD` so routine runs only fetch new mail since the last
sync (plus a 2-day buffer). Use `--full` or `GMAIL_SYNC_FULL=1` periodically if you need to
reconcile label edits or delayed messages.

Requires credentials.json / token.json at repo root (or GOOGLE_* env on CI).
"""
import base64
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build


SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

# Rolling retention: keep only the last 6 months of patrol reports.
# Align `GMAIL_QUERY` (e.g. newer_than:30d) with the same window.

# When narrowing with `after:`, subtract this many calendar days from the last seen
# internalDate so same-day and timezone edge messages are not skipped.
_AFTER_DATE_BUFFER_DAYS = 2

# Repo root (parent of scripts/) — stable paths regardless of cwd
_ROOT = Path(__file__).resolve().parent.parent

load_dotenv(_ROOT / ".env")


def _path(name: str) -> str:
    return str(_ROOT / name)


def _write_credentials_from_env_if_needed():
    """CI: create credentials.json from GOOGLE_CREDENTIALS_JSON if file is absent."""
    raw = os.getenv("GOOGLE_CREDENTIALS_JSON")
    cred_path = _ROOT / "credentials.json"
    if not raw or cred_path.exists():
        return
    cred_path.write_text(raw, encoding="utf-8")


def _write_token_from_env_if_needed():
    """CI: create token.json from GOOGLE_TOKEN_JSON if file is absent."""
    raw = os.getenv("GOOGLE_TOKEN_JSON")
    token_path = _ROOT / "token.json"
    if not raw or token_path.exists():
        return
    token_path.write_text(raw, encoding="utf-8")


def get_gmail_service():
    creds = None
    token_path = _path("token.json")

    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                _path("credentials.json"), SCOPES
            )
            creds = flow.run_local_server(port=0)

        with open(token_path, "w", encoding="utf-8") as token:
            token.write(creds.to_json())

    return build("gmail", "v1", credentials=creds)


def get_header(headers, name):
    for h in headers:
        if h["name"].lower() == name.lower():
            return h["value"]
    return None


def parse_subject(subject):
    report_type = None
    report_date = None
    report_time = None
    report_datetime = None

    if subject:
        type_match = re.search(r"CAPN Security:\s*(.+?)\s+Report", subject)
        if type_match:
            report_type = type_match.group(1).strip()

        dt_match = re.search(r"(\d{2}/\d{2}/\d{4})\s+(\d{1,2}:\d{2})", subject)
        if dt_match:
            report_date = dt_match.group(1)
            report_time = dt_match.group(2)

            try:
                report_datetime = datetime.strptime(
                    f"{report_date} {report_time}",
                    "%m/%d/%Y %H:%M"
                )
            except ValueError:
                report_datetime = None

    return report_type, report_date, report_time, report_datetime


def _collapse_ws(s):
    return re.sub(r"\s+", " ", (s or "").strip())


# Emails often flatten the body into one line: "Location: … Time Submitted: … Report details: …"
# Without stopping at the next label, `location` becomes an entire report and the dashboard
# dropdown lists one "location" per message.
_CAPN_NEXT_FIELD = re.compile(
    r"\s+(?:Time\s+Submitted|Report\s+details|Type|Security\s+Officer)\s*:",
    re.IGNORECASE,
)


def _value_after_capn_label(tail):
    """`tail` is text immediately after a `Something:` label; trim to the next CAPN field."""
    if not tail:
        return None
    m = _CAPN_NEXT_FIELD.search(tail)
    if m:
        tail = tail[: m.start()]
    first_line = tail.split("\n", 1)[0]
    out = _collapse_ws(first_line)
    return out if out else None


def extract_body_text(payload):
    """Decode text/plain from MIME payload; if missing, strip tags from first text/html."""
    plain_chunks = []
    html_fallback = None

    def decode_b64(data):
        if not data:
            return ""
        return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")

    def walk(part):
        nonlocal html_fallback
        mime = (part.get("mimeType") or "").lower()
        body = part.get("body") or {}
        data = body.get("data")
        if data:
            chunk = decode_b64(data)
            if mime == "text/plain":
                plain_chunks.append(chunk)
            elif mime == "text/html" and html_fallback is None:
                stripped = re.sub(r"<[^>]+>", " ", chunk)
                html_fallback = _collapse_ws(stripped)
        for child in part.get("parts") or []:
            walk(child)

    walk(payload)
    if plain_chunks:
        return "\n".join(plain_chunks)
    return html_fallback or ""


def parse_officer_location_from_text(text):
    """Parse Security Officer and Location from full email body (CAPN patrol layout)."""
    officer = None
    location = None
    if not text:
        return officer, location
    t = text.replace("\r\n", "\n")

    for line in t.split("\n"):
        m = re.match(r"^\s*Security\s+Officer:\s*(.+)$", line, re.IGNORECASE)
        if m:
            officer = _collapse_ws(m.group(1))
            break
    if not officer:
        om = re.search(
            r"Security\s+Officer:\s*([^\n]+?)(?=\s*(?:\n\s*Type:|\n\s*Location:|\n\s*Report|$))",
            t,
            re.IGNORECASE | re.DOTALL,
        )
        if om:
            officer = _collapse_ws(om.group(1))

    loc_m = re.search(r"Location\s*:", t, re.IGNORECASE)
    if loc_m:
        location = _value_after_capn_label(t[loc_m.end() :])

    return officer, location


def parse_snippet(snippet):
    """Fallback when body is empty — Gmail snippets are short and often omit or garble Location."""
    officer = None
    location = None
    if snippet:
        officer_match = re.search(
            r"Security Officer:\s*(.*?)(?:\s+Type:|\s+Location:|$)",
            snippet,
            re.IGNORECASE,
        )
        if officer_match:
            officer = _collapse_ws(officer_match.group(1))

        loc_m = re.search(r"Location\s*:", snippet, re.IGNORECASE)
        if loc_m:
            location = _value_after_capn_label(snippet[loc_m.end() :])

    return officer, location


def ensure_gmail_sync_state(cursor):
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS gmail_sync_state (
            id smallint PRIMARY KEY DEFAULT 1,
            last_internal_ms bigint NOT NULL DEFAULT 0,
            updated_at timestamptz NOT NULL DEFAULT NOW(),
            CONSTRAINT gmail_sync_state_singleton CHECK (id = 1)
        )
        """
    )
    cursor.execute(
        """
        INSERT INTO gmail_sync_state (id, last_internal_ms)
        VALUES (1, 0)
        ON CONFLICT (id) DO NOTHING
        """
    )


def get_last_internal_ms(cursor):
    cursor.execute("SELECT last_internal_ms FROM gmail_sync_state WHERE id = 1")
    row = cursor.fetchone()
    return int(row[0]) if row and row[0] is not None else 0


def bump_last_internal_ms(cursor, max_internal_ms):
    if max_internal_ms <= 0:
        return
    cursor.execute(
        """
        UPDATE gmail_sync_state
        SET last_internal_ms = GREATEST(last_internal_ms, %s),
            updated_at = NOW()
        WHERE id = 1
        """,
        (max_internal_ms,),
    )


def build_messages_list_query(gmail_query, last_internal_ms, force_full):
    """Combine user `GMAIL_QUERY` with an optional Gmail `after:` bound for incremental sync."""
    base = (gmail_query or "").strip()
    if not base:
        return base
    if force_full or last_internal_ms <= 0:
        return base
    dt = datetime.fromtimestamp(last_internal_ms / 1000.0, tz=timezone.utc)
    day = dt.date() - timedelta(days=_AFTER_DATE_BUFFER_DAYS)
    after = day.strftime("%Y/%m/%d")
    return f"({base}) after:{after}"


def get_attachment_info(payload):
    """Count Gmail MIME parts that expose attachmentId (fetchable attachments).

    Gmail often omits `filename` on inline images; requiring both filename and
    attachmentId undercounted and produced 0 for typical patrol image emails.
    """
    count = 0

    def walk_parts(part):
        nonlocal count
        body = part.get("body", {})
        if body.get("attachmentId"):
            count += 1

        for child in part.get("parts", []) or []:
            walk_parts(child)

    walk_parts(payload)
    return count


def main():
    _write_credentials_from_env_if_needed()
    _write_token_from_env_if_needed()

    database_url = os.getenv("DATABASE_URL")
    gmail_query = os.getenv("GMAIL_QUERY")
    force_full = "--full" in sys.argv or os.getenv("GMAIL_SYNC_FULL", "").lower() in (
        "1",
        "true",
        "yes",
    )

    if not database_url:
        raise ValueError(
            "DATABASE_URL is missing. Set it in the environment or in a .env file."
        )

    if not gmail_query:
        raise ValueError(
            "GMAIL_QUERY is missing. Set it in the environment or in a .env file."
        )

    service = get_gmail_service()

    conn = psycopg2.connect(database_url)
    cursor = conn.cursor()

    ensure_gmail_sync_state(cursor)
    last_internal_ms = get_last_internal_ms(cursor)
    list_query = build_messages_list_query(gmail_query, last_internal_ms, force_full)
    if force_full or last_internal_ms <= 0:
        print("Gmail list: full window (no after: bound or --full).")
    else:
        print(
            f"Gmail list: incremental after last_internal_ms={last_internal_ms} "
            f"(query tail: … after:{list_query.rsplit(':', 1)[-1]})"
        )

    cursor.execute(
        """
        DELETE FROM patrol_reports_raw r
        WHERE (
            CASE
                WHEN r.datetime IS NULL OR btrim(r.datetime::text) = '' THEN NULL
                WHEN btrim(r.datetime::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
                    THEN r.datetime::timestamptz
                WHEN btrim(r.datetime::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]'
                    THEN r.datetime::timestamptz
                WHEN btrim(r.datetime::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    THEN (btrim(r.datetime::text)::date)::timestamptz
                WHEN btrim(r.datetime::text) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}'
                    THEN to_timestamp(r.datetime, 'MM/DD/YYYY HH24:MI')::timestamptz
                ELSE NULL
            END
        ) < NOW() - INTERVAL '6 months'
        """
    )
    print(f"Deleted {cursor.rowcount} row(s) older than 6 months")

    all_messages = []
    next_page_token = None

    while True:
        results = service.users().messages().list(
            userId="me",
            q=list_query,
            maxResults=500,
            pageToken=next_page_token,
        ).execute()

        messages = results.get("messages", [])
        all_messages.extend(messages)

        next_page_token = results.get("nextPageToken")
        if not next_page_token:
            break

    print(f"Found {len(all_messages)} matching messages to process")

    max_internal_seen = 0

    for msg in all_messages:
        gmail_message_id = msg["id"]

        try:
            full_msg = service.users().messages().get(
                userId="me",
                id=gmail_message_id,
                format="full",
            ).execute()

            raw_internal = full_msg.get("internalDate")
            if raw_internal is not None:
                try:
                    internal_i = int(raw_internal)
                    if internal_i > max_internal_seen:
                        max_internal_seen = internal_i
                except (TypeError, ValueError):
                    pass

            payload = full_msg.get("payload", {})
            headers = payload.get("headers", [])
            subject = get_header(headers, "Subject") or ""
            snippet = full_msg.get("snippet", "")

            report_type, report_date, report_time, report_datetime = parse_subject(subject)
            body_text = extract_body_text(payload)
            officer, location = parse_officer_location_from_text(body_text)
            if not officer and not location:
                officer, location = parse_snippet(snippet)
            elif not officer or not location:
                off2, loc2 = parse_snippet(snippet)
                officer = officer or off2
                location = location or loc2
            num_attachments = get_attachment_info(payload)
            has_images = "true" if num_attachments > 0 else "false"

            cursor.execute("""
                INSERT INTO patrol_reports_raw (
                    email_id,
                    report_type,
                    date,
                    time,
                    datetime,
                    security_officer,
                    location,
                    report_details,
                    has_images,
                    num_attachments,
                    gmail_message_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (gmail_message_id) DO NOTHING
            """, (
                gmail_message_id,
                report_type,
                report_date,
                report_time,
                (
                    report_datetime.strftime("%m/%d/%Y %H:%M")
                    if report_datetime
                    else None
                ),
                officer,
                location,
                snippet,
                has_images,
                str(num_attachments),
                gmail_message_id
            ))

            print(f"Inserted or skipped: {subject}")

        except Exception as e:
            print(f"Error processing message {gmail_message_id}: {e}")

    bump_last_internal_ms(cursor, max_internal_seen)
    if max_internal_seen > 0:
        print(f"Updated gmail_sync_state.last_internal_ms to >= {max_internal_seen}")

    # Marks last successful sync run (even when no new messages), so the dashboard
    # can show when GitHub Actions / cron last finished — not only when the watermark moved.
    cursor.execute(
        """
        UPDATE gmail_sync_state
        SET updated_at = NOW()
        WHERE id = 1
        """
    )

    conn.commit()
    cursor.close()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
