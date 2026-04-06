"""
Remote API — HTTP server for triggering pipeline remotely.
No RDP needed. Control from admin panel, n8n webhook, or Telegram.

Endpoints:
    GET  /status          — Current pipeline status
    POST /scrape          — Start scraping a country: {"country": "colombia"}
    POST /queue           — Add countries to queue: {"countries": ["colombia", "brazil"]}
    GET  /queue           — View current queue
    POST /stop            — Stop current scraping

Runs on port 8899. Protected by API key.

Environment:
    API_KEY=your-secret-key
    QUEUE_FILE=C:\Botsol\queue.json
    STATUS_FILE=C:\Botsol\status.json
"""

import json
import os
import sys
import threading
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("remote_api.log"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("remote_api")

API_KEY = os.environ.get("API_KEY", "spexx-botsol-2026")
QUEUE_FILE = os.environ.get("QUEUE_FILE", r"C:\Botsol\queue.json")
STATUS_FILE = os.environ.get("STATUS_FILE", r"C:\Botsol\status.json")
PORT = int(os.environ.get("PORT", "8899"))

# Track the orchestrator thread
orchestrator_thread = None


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type, x-api-key")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _auth(self):
        key = self.headers.get("X-Api-Key") or self.headers.get("x-api-key")
        if key != API_KEY:
            self._send(401, {"error": "Invalid API key"})
            return False
        return True

    def do_OPTIONS(self):
        self._send(200, {"ok": True})

    def do_GET(self):
        if not self._auth():
            return

        if self.path == "/status":
            status = {}
            if os.path.exists(STATUS_FILE):
                with open(STATUS_FILE, "r") as f:
                    status = json.load(f)
            self._send(200, status)

        elif self.path == "/queue":
            queue = []
            if os.path.exists(QUEUE_FILE):
                with open(QUEUE_FILE, "r") as f:
                    queue = json.load(f)
            self._send(200, {"queue": queue, "length": len(queue)})

        else:
            self._send(404, {"error": "Not found"})

    def do_POST(self):
        if not self._auth():
            return

        body = {}
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 0:
            body = json.loads(self.rfile.read(content_length))

        if self.path == "/scrape":
            country = body.get("country")
            if not country:
                self._send(400, {"error": "Missing 'country' field"})
                return

            # Add to front of queue and start
            queue = []
            if os.path.exists(QUEUE_FILE):
                with open(QUEUE_FILE, "r") as f:
                    queue = json.load(f)

            if country not in queue:
                queue.insert(0, country)
                with open(QUEUE_FILE, "w") as f:
                    json.dump(queue, f)

            # Start orchestrator if not running
            _start_orchestrator()

            self._send(200, {"ok": True, "message": f"Scraping {country}", "queue": queue})

        elif self.path == "/queue":
            countries = body.get("countries", [])
            if not countries:
                self._send(400, {"error": "Missing 'countries' field"})
                return

            queue = []
            if os.path.exists(QUEUE_FILE):
                with open(QUEUE_FILE, "r") as f:
                    queue = json.load(f)

            for c in countries:
                if c not in queue:
                    queue.append(c)

            with open(QUEUE_FILE, "w") as f:
                json.dump(queue, f)

            self._send(200, {"ok": True, "queue": queue, "length": len(queue)})

        elif self.path == "/stop":
            # Clear the queue
            with open(QUEUE_FILE, "w") as f:
                json.dump([], f)
            self._send(200, {"ok": True, "message": "Queue cleared. Current scrape will finish."})

        else:
            self._send(404, {"error": "Not found"})

    def log_message(self, format, *args):
        log.info(f"{self.client_address[0]} - {format % args}")


def _start_orchestrator():
    """Start the orchestrator in a background thread if not already running."""
    global orchestrator_thread
    if orchestrator_thread and orchestrator_thread.is_alive():
        return

    from orchestrator import run_queue
    orchestrator_thread = threading.Thread(target=run_queue, daemon=True)
    orchestrator_thread.start()
    log.info("Orchestrator started in background")


if __name__ == "__main__":
    log.info(f"Starting Remote API on port {PORT}")
    log.info(f"API Key: {API_KEY[:4]}...{API_KEY[-4:]}")
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down")
        server.shutdown()
