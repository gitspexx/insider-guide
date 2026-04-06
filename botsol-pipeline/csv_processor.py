"""
CSV Processor — Watches Botsol output folder, processes CSVs, uploads to Supabase.

Flow:
1. Watch output folder for new CSV files
2. Parse CSV (Botsol format: 25+ fields)
3. Deduplicate against existing businesses in Supabase
4. Auto-classify category
5. Upload new businesses to Supabase
6. Move processed CSV to archive folder
7. Trigger email verification for entries with emails

Environment:
    SUPABASE_URL=https://qbzmsvfphpfgnlztskma.supabase.co
    SUPABASE_SERVICE_KEY=eyJ...
    WATCH_FOLDER=C:\Botsol\output
    ARCHIVE_FOLDER=C:\Botsol\archive
"""

import csv
import json
import os
import re
import sys
import time
import shutil
import logging
from pathlib import Path
from datetime import datetime

try:
    import requests
except ImportError:
    print("Installing requests...")
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
log = logging.getLogger("csv_processor")

# ─── Config ───
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://qbzmsvfphpfgnlztskma.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
WATCH_FOLDER = os.environ.get("WATCH_FOLDER", r"C:\Botsol\output")
ARCHIVE_FOLDER = os.environ.get("ARCHIVE_FOLDER", r"C:\Botsol\archive")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# ─── Classifier Rules ───
RULES = [
    ("eat", [r"restaurant", r"pizzeria", r"parrilla", r"grill", r"burger", r"sushi", r"ramen", r"taco", r"brunch", r"bistro", r"cocina", r"bbq", r"bakery", r"food", r"steakhouse", r"seafood", r"buffet", r"diner"]),
    ("cafe", [r"\bcaf[eé]\b", r"coffee", r"barista", r"espresso", r"tea house", r"roaster", r"juice bar", r"smoothie"]),
    ("drink", [r"\bbar\b", r"cocktail", r"cerveza", r"brewery", r"pub\b", r"lounge", r"disco", r"club\b", r"nightclub", r"wine bar", r"speakeasy", r"beer garden"]),
    ("stay", [r"hotel", r"hostel", r"resort", r"lodge", r"guest.?house", r"bed and breakfast", r"B&B", r"motel", r"villa", r"glamping", r"pension", r"inn\b"]),
    ("explore", [r"museum", r"gallery", r"park\b", r"beach", r"waterfall", r"temple", r"church", r"cathedral", r"mosque", r"monument", r"castle", r"palace", r"ruins", r"garden", r"landmark", r"heritage", r"viewpoint", r"zoo", r"aquarium"]),
    ("do", [r"tour\b", r"diving", r"surf", r"kayak", r"hiking", r"zip.?line", r"cooking class", r"bike tour", r"adventure", r"rafting", r"snorkel", r"safari", r"excursion"]),
    ("wellness", [r"spa\b", r"massage", r"yoga", r"wellness", r"retreat", r"sauna", r"hammam", r"meditation", r"hot spring"]),
    ("essentials", [r"car rental", r"laundry", r"clinic", r"pharmacy", r"supermarket", r"mall\b", r"exchange", r"coworking", r"gym\b", r"barber", r"dentist"]),
]


def classify(name, category_hint=""):
    """Classify a business by name and optional Google category."""
    text = f"{name} {category_hint}".lower()
    for cat, patterns in RULES:
        for p in patterns:
            if re.search(p, text, re.IGNORECASE):
                return cat
    # Short names without clear category → explore (likely a landmark/place)
    if len(name.split()) <= 3:
        return "explore"
    return "misc"


def get_country_id(country_name):
    """Look up country ID from Supabase."""
    slug = country_name.lower().replace(" ", "-")
    res = requests.get(
        f"{SUPABASE_URL}/rest/v1/countries?select=id,slug&or=(slug.eq.{slug},name.ilike.{country_name})",
        headers=HEADERS,
    )
    data = res.json()
    if data:
        return data[0]["id"]
    return None


def get_existing_businesses(country_id):
    """Fetch existing business names and URLs for dedup."""
    existing_urls = set()
    existing_names = set()
    offset = 0
    while True:
        res = requests.get(
            f"{SUPABASE_URL}/rest/v1/businesses?select=name,google_maps_url&country_id=eq.{country_id}&offset={offset}&limit=1000",
            headers=HEADERS,
        )
        batch = res.json()
        for b in batch:
            if b.get("google_maps_url"):
                existing_urls.add(b["google_maps_url"].lower().strip())
            if b.get("name"):
                existing_names.add(b["name"].lower().strip())
        if len(batch) < 1000:
            break
        offset += 1000
    return existing_urls, existing_names


def parse_botsol_csv(filepath):
    """Parse a Botsol CSV file into structured business records."""
    businesses = []
    with open(filepath, "r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Botsol fields: Name, Address, Phone, Website, Email, Rating, Reviews,
            # Category, City, State, Zip, Country, Latitude, Longitude, Google Maps URL,
            # Facebook, Instagram, Twitter, LinkedIn, YouTube, etc.
            name = (row.get("Name") or row.get("name") or row.get("Business Name") or "").strip()
            if not name or len(name) < 2:
                continue

            biz = {
                "name": name,
                "location": (row.get("Address") or row.get("address") or "").strip(),
                "city": (row.get("City") or row.get("city") or "").strip(),
                "google_maps_url": (row.get("Google Maps URL") or row.get("Google Maps Link") or row.get("url") or "").strip(),
                "website": (row.get("Website") or row.get("website") or "").strip(),
                "email": (row.get("Email") or row.get("email") or row.get("Emails") or "").strip(),
                "instagram_handle": (row.get("Instagram") or row.get("instagram") or "").strip(),
                "whatsapp": (row.get("WhatsApp") or row.get("Phone") or row.get("phone") or "").strip(),
                "description": (row.get("Description") or row.get("About") or "").strip(),
                "_google_category": (row.get("Category") or row.get("Categories") or row.get("category") or "").strip(),
            }
            businesses.append(biz)

    return businesses


def process_csv(filepath, country_slug):
    """Process a single CSV: parse, dedup, classify, upload."""
    log.info(f"Processing: {filepath}")

    # Detect country from filename or argument
    if not country_slug:
        # Try to extract from filename: "keywords_colombia_results.csv"
        fname = Path(filepath).stem.lower()
        for part in fname.replace("-", "_").split("_"):
            country_id = get_country_id(part)
            if country_id:
                country_slug = part
                break

    if not country_slug:
        log.error(f"Cannot determine country for {filepath}. Skipping.")
        return

    country_id = get_country_id(country_slug)
    if not country_id:
        log.error(f"Country '{country_slug}' not found in database. Skipping.")
        return

    log.info(f"Country: {country_slug} (ID: {country_id[:8]}...)")

    # Parse CSV
    businesses = parse_botsol_csv(filepath)
    log.info(f"Parsed {len(businesses)} businesses from CSV")

    if not businesses:
        return

    # Dedup against existing
    existing_urls, existing_names = get_existing_businesses(country_id)
    log.info(f"Existing in DB: {len(existing_names)} names, {len(existing_urls)} URLs")

    new_businesses = []
    for biz in businesses:
        url = (biz.get("google_maps_url") or "").lower().strip()
        name = biz["name"].lower().strip()
        if url and url in existing_urls:
            continue
        if name in existing_names:
            continue
        new_businesses.append(biz)
        # Add to sets to dedup within this batch too
        existing_names.add(name)
        if url:
            existing_urls.add(url)

    log.info(f"New (after dedup): {len(new_businesses)}")

    if not new_businesses:
        log.info("Nothing new to import.")
        return

    # Classify and prepare for insert
    inserts = []
    cat_counts = {}
    for biz in new_businesses:
        google_cat = biz.pop("_google_category", "")
        category = classify(biz["name"], google_cat)
        cat_counts[category] = cat_counts.get(category, 0) + 1

        record = {
            "name": biz["name"],
            "country_id": country_id,
            "category": category,
            "location": biz.get("location", ""),
            "city": biz.get("city", ""),
            "google_maps_url": biz.get("google_maps_url", ""),
            "website": biz.get("website", ""),
            "email": biz.get("email", ""),
            "instagram_handle": biz.get("instagram_handle", ""),
            "tier": "listed",
            "published": True,
        }
        inserts.append(record)

    log.info(f"Categories: {json.dumps(cat_counts)}")

    # Upload in batches of 50
    uploaded = 0
    errors = 0
    for i in range(0, len(inserts), 50):
        batch = inserts[i : i + 50]
        res = requests.post(
            f"{SUPABASE_URL}/rest/v1/businesses",
            headers=HEADERS,
            json=batch,
        )
        if res.status_code == 201:
            uploaded += len(batch)
        else:
            errors += len(batch)
            log.error(f"Insert error: {res.status_code} - {res.text[:200]}")

    log.info(f"Uploaded: {uploaded} | Errors: {errors}")

    # Collect emails for verification
    with_email = [b for b in inserts if b.get("email")]
    if with_email:
        log.info(f"Businesses with email: {len(with_email)} — queued for verification")
        # Save email list for verify step
        email_file = Path(ARCHIVE_FOLDER) / f"emails_{country_slug}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(email_file, "w") as f:
            json.dump([{"email": b["email"], "name": b["name"]} for b in with_email], f)

    return uploaded


def watch_folder():
    """Watch the output folder for new CSV files and process them."""
    os.makedirs(WATCH_FOLDER, exist_ok=True)
    os.makedirs(ARCHIVE_FOLDER, exist_ok=True)

    log.info(f"Watching: {WATCH_FOLDER}")
    log.info(f"Archive: {ARCHIVE_FOLDER}")

    processed = set()

    while True:
        csvs = list(Path(WATCH_FOLDER).glob("*.csv"))
        for csv_path in csvs:
            if str(csv_path) in processed:
                continue

            # Wait for file to finish writing (size stable for 5 seconds)
            size1 = csv_path.stat().st_size
            time.sleep(5)
            if not csv_path.exists():
                continue
            size2 = csv_path.stat().st_size
            if size1 != size2:
                continue  # Still writing

            try:
                # Extract country from filename
                country = None
                fname = csv_path.stem.lower()
                if "keywords_" in fname:
                    country = fname.split("keywords_")[1].split("_")[0].split(".")[0]

                result = process_csv(str(csv_path), country)

                # Move to archive
                archive_path = Path(ARCHIVE_FOLDER) / f"{csv_path.stem}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
                shutil.move(str(csv_path), str(archive_path))
                log.info(f"Archived: {archive_path.name}")

            except Exception as e:
                log.error(f"Error processing {csv_path}: {e}")

            processed.add(str(csv_path))

        time.sleep(10)  # Check every 10 seconds


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "watch":
        watch_folder()
    elif len(sys.argv) > 2:
        # Direct processing: python csv_processor.py <file.csv> <country>
        process_csv(sys.argv[1], sys.argv[2])
    else:
        print("Usage:")
        print("  python csv_processor.py watch              # Watch folder mode")
        print("  python csv_processor.py <file.csv> <country>  # Process single file")
