"""
Gmail → Neon sync for patrol_reports_raw.

Run from repository root:
  python scripts/sync_gmail_to_neon.py

Requires credentials.json / token.json at repo root (or GOOGLE_* env on CI).
"""
import os
import re
from datetime import datetime
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build


SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

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


def parse_snippet(snippet):
    officer = None
    location = None

    if snippet:
        officer_match = re.search(r"Security Officer:\s*(.*?)(?:\s+Type:|$)", snippet, re.IGNORECASE)
        if officer_match:
            officer = officer_match.group(1).strip()

        location_match = re.search(r"Location:\s*(.*?)(?:\s{2,}|$)", snippet, re.IGNORECASE)
        if location_match:
            location = location_match.group(1).strip()

    return officer, location


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

    all_messages = []
    next_page_token = None

    while True:
        results = service.users().messages().list(
            userId="me",
            q=gmail_query,
            maxResults=500,
            pageToken=next_page_token,
        ).execute()

        messages = results.get("messages", [])
        all_messages.extend(messages)

        next_page_token = results.get("nextPageToken")
        if not next_page_token:
            break

    print(f"Found {len(all_messages)} matching messages")

    for msg in all_messages:
        gmail_message_id = msg["id"]

        try:
            full_msg = service.users().messages().get(
                userId="me",
                id=gmail_message_id
            ).execute()

            payload = full_msg.get("payload", {})
            headers = payload.get("headers", [])
            subject = get_header(headers, "Subject") or ""
            snippet = full_msg.get("snippet", "")

            report_type, report_date, report_time, report_datetime = parse_subject(subject)
            officer, location = parse_snippet(snippet)
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
                ON CONFLICT (gmail_message_id) DO UPDATE SET
                    has_images = EXCLUDED.has_images,
                    num_attachments = EXCLUDED.num_attachments
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

    conn.commit()
    cursor.close()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
