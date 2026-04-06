"""
Email Verifier — Batch verify emails via BulkMailChecker (Supabase edge function).
Then push verified leads to CRM via ingest-leads.

Reads email JSON files from the archive folder (produced by csv_processor).
Verifies in batches of 50.
Pushes passed + risky to CRM with project tags.

Environment:
    SUPABASE_URL=https://qbzmsvfphpfgnlztskma.supabase.co
    SUPABASE_SERVICE_KEY=eyJ...
    ARCHIVE_FOLDER=C:\Botsol\archive
"""

import json
import os
import sys
import logging
from pathlib import Path

try:
    import requests
except ImportError:
    os.system(f"{sys.executable} -m pip install requests")
    import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("pipeline.log"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("email_verifier")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://qbzmsvfphpfgnlztskma.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ARCHIVE_FOLDER = os.environ.get("ARCHIVE_FOLDER", r"C:\Botsol\archive")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def verify_emails(email_list):
    """Verify a batch of emails via the verify-email edge function."""
    results = []
    for i in range(0, len(email_list), 50):
        batch = email_list[i : i + 50]
        emails = [e["email"] for e in batch if e.get("email")]
        if not emails:
            continue

        try:
            res = requests.post(
                f"{SUPABASE_URL}/functions/v1/verify-email",
                headers=HEADERS,
                json={"emails": emails},
            )
            if res.status_code == 200:
                data = res.json()
                if data.get("results"):
                    results.extend(data["results"])
                    log.info(f"Verified batch {i // 50 + 1}: {len(data['results'])} results")
            else:
                log.error(f"Verify error: {res.status_code} - {res.text[:200]}")
        except Exception as e:
            log.error(f"Verify exception: {e}")

    return results


def push_to_crm(leads, country_slug):
    """Push verified leads to CRM via ingest-leads edge function."""
    if not leads:
        return

    crm_leads = []
    for lead in leads:
        crm_leads.append({
            "name": lead.get("name", ""),
            "email": lead["email"],
            "tags": [
                "campaign:insider_guide_onboard",
                f"country:{country_slug}",
                "source:botsol-scraper",
            ],
            "category": "business",
            "notes": f"Auto-scraped from Google Maps via Botsol. Country: {country_slug}",
        })

    # Also push to Kollably for UGC potential
    kollably_leads = []
    for lead in leads:
        kollably_leads.append({
            "name": lead.get("name", ""),
            "email": lead["email"],
            "tags": [
                "campaign:kollably_onboard",
                f"country:{country_slug}",
                "source:botsol-scraper",
            ],
            "category": "business",
        })

    # Push to Insider Guide project
    try:
        res = requests.post(
            f"{SUPABASE_URL}/functions/v1/ingest-leads",
            headers=HEADERS,
            json={
                "source": "botsol",
                "project_slug": "insider-guide",
                "leads": crm_leads,
                "auto_enroll": True,
            },
        )
        if res.status_code == 200:
            data = res.json()
            log.info(f"CRM (insider-guide): imported={data.get('imported', 0)}, dupes={data.get('duplicates', 0)}")
        else:
            log.error(f"CRM push error: {res.status_code} - {res.text[:200]}")
    except Exception as e:
        log.error(f"CRM push exception: {e}")

    # Push to Kollably project
    try:
        res = requests.post(
            f"{SUPABASE_URL}/functions/v1/ingest-leads",
            headers=HEADERS,
            json={
                "source": "botsol",
                "project_slug": "kollably",
                "leads": kollably_leads,
                "auto_enroll": False,
            },
        )
        if res.status_code == 200:
            data = res.json()
            log.info(f"CRM (kollably): imported={data.get('imported', 0)}, dupes={data.get('duplicates', 0)}")
    except Exception as e:
        log.error(f"Kollably push exception: {e}")


def process_email_files():
    """Find and process all email JSON files in the archive folder."""
    archive = Path(ARCHIVE_FOLDER)
    email_files = list(archive.glob("emails_*.json"))

    if not email_files:
        log.info("No email files to process.")
        return

    for email_file in email_files:
        log.info(f"Processing: {email_file.name}")

        with open(email_file, "r") as f:
            email_list = json.load(f)

        if not email_list:
            continue

        # Extract country from filename: emails_colombia_20260406_120000.json
        parts = email_file.stem.split("_")
        country_slug = parts[1] if len(parts) > 1 else "unknown"

        log.info(f"Country: {country_slug} | Emails: {len(email_list)}")

        # Verify
        results = verify_emails(email_list)

        # Filter: passed + risky only
        valid = []
        stats = {"passed": 0, "risky": 0, "failed": 0, "unknown": 0}
        for r in results:
            status = r.get("status", "unknown").lower()
            stats[status] = stats.get(status, 0) + 1
            if status in ("passed", "risky", "valid", "ok"):
                # Find the original name
                orig = next((e for e in email_list if e["email"] == r["email"]), {})
                valid.append({"email": r["email"], "name": orig.get("name", "")})

        log.info(f"Verification results: {json.dumps(stats)}")
        log.info(f"Valid emails (passed+risky): {len(valid)}")

        # Push to CRM
        if valid:
            push_to_crm(valid, country_slug)

        # Rename processed file
        done_path = email_file.with_suffix(".done.json")
        email_file.rename(done_path)
        log.info(f"Marked as done: {done_path.name}")


if __name__ == "__main__":
    process_email_files()
