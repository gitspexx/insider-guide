"""
Slack Notifications for Botsol Pipeline.
Sends status updates to a Slack channel via webhook.

Environment:
    SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
"""

import json
import os
import sys

try:
    import requests
except ImportError:
    os.system(f"{sys.executable} -m pip install requests")
    import requests

SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "")


def notify(message, country=None, status="info", details=None):
    """Send a Slack notification."""
    if not SLACK_WEBHOOK_URL:
        print(f"[slack] No webhook URL configured. Message: {message}")
        return

    emoji = {
        "info": ":information_source:",
        "start": ":rocket:",
        "done": ":white_check_mark:",
        "error": ":x:",
        "warning": ":warning:",
    }.get(status, ":robot_face:")

    blocks = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"{emoji} *Botsol Pipeline* — {message}",
            },
        },
    ]

    if country or details:
        fields = []
        if country:
            fields.append({"type": "mrkdwn", "text": f"*Country:* {country}"})
        if details:
            if isinstance(details, dict):
                for k, v in details.items():
                    fields.append({"type": "mrkdwn", "text": f"*{k}:* {v}"})
            else:
                fields.append({"type": "mrkdwn", "text": f"*Details:* {details}"})
        blocks.append({"type": "section", "fields": fields})

    try:
        requests.post(
            SLACK_WEBHOOK_URL,
            json={"blocks": blocks},
            timeout=10,
        )
    except Exception as e:
        print(f"[slack] Error sending notification: {e}")


def scrape_started(country, keyword_count):
    notify(
        f"Started scraping *{country}*",
        country=country,
        status="start",
        details={"Keywords": str(keyword_count), "Mode": "Deep scrape (Botsol)"},
    )


def scrape_done(country, places_found, new_imported, emails_found=0):
    notify(
        f"Finished scraping *{country}*",
        country=country,
        status="done",
        details={
            "Places found": str(places_found),
            "New imported": str(new_imported),
            "Emails found": str(emails_found),
        },
    )


def scrape_error(country, error):
    notify(
        f"Error scraping *{country}*",
        country=country,
        status="error",
        details=str(error),
    )


def emails_verified(country, passed, risky, failed):
    notify(
        f"Email verification done for *{country}*",
        country=country,
        status="done",
        details={
            "Passed": str(passed),
            "Risky": str(risky),
            "Failed": str(failed),
            "Pushed to CRM": str(passed + risky),
        },
    )


def queue_update(queue):
    if queue:
        notify(
            f"Queue updated: {len(queue)} countries",
            status="info",
            details=", ".join(queue[:10]) + ("..." if len(queue) > 10 else ""),
        )
    else:
        notify("Queue is empty. Pipeline idle.", status="info")


if __name__ == "__main__":
    # Test
    notify("Pipeline test notification", status="info", details="If you see this, Slack is connected.")
