"""
Orchestrator — Main controller for the Botsol scraping pipeline.

Manages the full lifecycle:
1. Read country queue
2. Generate keywords for next country
3. Copy keywords.txt to Botsol input folder
4. Launch Botsol (it reads keywords.txt and scrapes automatically)
5. Wait for completion (watch output folder)
6. Process CSV → Supabase
7. Verify emails → CRM
8. Mark country as done
9. Move to next country

Runs as a Windows service or Task Scheduler job.

Environment:
    SUPABASE_URL=https://qbzmsvfphpfgnlztskma.supabase.co
    SUPABASE_SERVICE_KEY=eyJ...
    BOTSOL_PATH=C:\Program Files\Botsol\GoogleBusinessProfileScraper.exe
    BOTSOL_INPUT=C:\Botsol\input
    BOTSOL_OUTPUT=C:\Botsol\output
    ARCHIVE_FOLDER=C:\Botsol\archive
    QUEUE_FILE=C:\Botsol\queue.json
"""

import json
import os
import sys
import time
import shutil
import subprocess
import logging
from pathlib import Path
from datetime import datetime

# Add pipeline dir to path
sys.path.insert(0, os.path.dirname(__file__))
from keyword_generator import generate_keywords
from csv_processor import process_csv
from email_verifier import process_email_files

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("orchestrator.log"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("orchestrator")

# ─── Config ───
BOTSOL_PATH = os.environ.get("BOTSOL_PATH", r"C:\Program Files\Botsol\GoogleBusinessProfileScraper.exe")
BOTSOL_INPUT = os.environ.get("BOTSOL_INPUT", r"C:\Botsol\input")
BOTSOL_OUTPUT = os.environ.get("BOTSOL_OUTPUT", r"C:\Botsol\output")
ARCHIVE_FOLDER = os.environ.get("ARCHIVE_FOLDER", r"C:\Botsol\archive")
QUEUE_FILE = os.environ.get("QUEUE_FILE", r"C:\Botsol\queue.json")
STATUS_FILE = os.environ.get("STATUS_FILE", r"C:\Botsol\status.json")


def load_queue():
    """Load country queue from JSON file."""
    if not os.path.exists(QUEUE_FILE):
        return []
    with open(QUEUE_FILE, "r") as f:
        return json.load(f)


def save_queue(queue):
    """Save country queue to JSON file."""
    with open(QUEUE_FILE, "w") as f:
        json.dump(queue, f, indent=2)


def update_status(country, state, details=None):
    """Update status file for monitoring."""
    status = {}
    if os.path.exists(STATUS_FILE):
        with open(STATUS_FILE, "r") as f:
            status = json.load(f)

    status["current"] = country
    status["state"] = state
    status["updated"] = datetime.now().isoformat()
    if details:
        status["details"] = details

    if "history" not in status:
        status["history"] = []
    if state in ("done", "error"):
        status["history"].append({
            "country": country,
            "state": state,
            "time": datetime.now().isoformat(),
            "details": details,
        })

    with open(STATUS_FILE, "w") as f:
        json.dump(status, f, indent=2)


def wait_for_botsol_output(timeout_hours=6):
    """Wait for Botsol to produce a CSV in the output folder."""
    start = time.time()
    max_wait = timeout_hours * 3600
    initial_files = set(Path(BOTSOL_OUTPUT).glob("*.csv"))

    log.info(f"Waiting for Botsol output (timeout: {timeout_hours}h)...")

    while time.time() - start < max_wait:
        current_files = set(Path(BOTSOL_OUTPUT).glob("*.csv"))
        new_files = current_files - initial_files

        if new_files:
            # Wait for file to finish writing
            for f in new_files:
                size1 = f.stat().st_size
                time.sleep(10)
                if f.exists() and f.stat().st_size == size1 and size1 > 0:
                    log.info(f"New CSV detected: {f.name} ({size1:,} bytes)")
                    return f

        time.sleep(30)

    log.warning("Timeout waiting for Botsol output")
    return None


def process_country(country_slug):
    """Full pipeline for a single country."""
    log.info(f"═══ Starting: {country_slug} ═══")
    update_status(country_slug, "generating_keywords")

    # 1. Generate keywords
    os.makedirs(BOTSOL_INPUT, exist_ok=True)
    os.makedirs(BOTSOL_OUTPUT, exist_ok=True)
    os.makedirs(ARCHIVE_FOLDER, exist_ok=True)

    keywords_path = os.path.join(BOTSOL_INPUT, "keywords.txt")
    keywords = generate_keywords(country_slug, keywords_path)
    if not keywords:
        log.error(f"Failed to generate keywords for {country_slug}")
        update_status(country_slug, "error", "keyword generation failed")
        return False

    log.info(f"Generated {len(keywords)} keywords → {keywords_path}")
    update_status(country_slug, "scraping", f"{len(keywords)} keywords")

    # 2. Launch Botsol
    # Note: Botsol PRO reads keywords.txt automatically when configured
    # The user needs to configure Botsol to read from BOTSOL_INPUT/keywords.txt
    # and output to BOTSOL_OUTPUT/
    if os.path.exists(BOTSOL_PATH):
        log.info(f"Launching Botsol: {BOTSOL_PATH}")
        try:
            proc = subprocess.Popen([BOTSOL_PATH])
            log.info(f"Botsol PID: {proc.pid}")
        except Exception as e:
            log.error(f"Failed to launch Botsol: {e}")
            update_status(country_slug, "error", f"launch failed: {e}")
            return False
    else:
        log.warning(f"Botsol not found at {BOTSOL_PATH}. Waiting for manual start or existing output...")

    # 3. Wait for CSV output
    csv_file = wait_for_botsol_output(timeout_hours=8)
    if not csv_file:
        update_status(country_slug, "error", "timeout waiting for output")
        return False

    update_status(country_slug, "processing_csv")

    # 4. Process CSV → Supabase
    try:
        uploaded = process_csv(str(csv_file), country_slug)
        log.info(f"Uploaded {uploaded} businesses")
    except Exception as e:
        log.error(f"CSV processing error: {e}")
        update_status(country_slug, "error", f"csv processing: {e}")
        return False

    # 5. Move CSV to archive
    archive_name = f"{country_slug}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    shutil.move(str(csv_file), os.path.join(ARCHIVE_FOLDER, archive_name))

    update_status(country_slug, "verifying_emails")

    # 6. Verify emails + push to CRM
    try:
        process_email_files()
    except Exception as e:
        log.warning(f"Email verification error (non-fatal): {e}")

    update_status(country_slug, "done", f"uploaded {uploaded} businesses")
    log.info(f"═══ Done: {country_slug} ═══")
    return True


def run_queue():
    """Process all countries in the queue sequentially."""
    queue = load_queue()
    if not queue:
        log.info("Queue is empty. Add countries to queue.json")
        return

    log.info(f"Queue: {len(queue)} countries")

    while queue:
        country = queue[0]
        success = process_country(country)

        if success:
            queue.pop(0)
            save_queue(queue)
            log.info(f"Remaining in queue: {len(queue)}")
        else:
            log.error(f"Failed: {country}. Keeping in queue. Waiting 30min before retry.")
            time.sleep(1800)

    log.info("Queue complete!")
    update_status("idle", "queue_complete")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Process a single country
        country = sys.argv[1]
        if country == "queue":
            run_queue()
        else:
            process_country(country)
    else:
        print("Usage:")
        print("  python orchestrator.py <country>   # Process single country")
        print("  python orchestrator.py queue        # Process entire queue")
        print("")
        print("Queue file:", QUEUE_FILE)
        print("Create it with: [\"colombia\", \"brazil\", \"guatemala\"]")
