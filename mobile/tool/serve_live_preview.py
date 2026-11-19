#!/usr/bin/env python3
"""Serve the Flutter preview and proxy its public API to production."""

import os
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

UPSTREAM = "https://casa-di-fratelli-api.onrender.com"
GUEST_UPSTREAM = os.environ.get("SEATMAP_GUEST_API_UPSTREAM", UPSTREAM).rstrip("/")
parsed_guest = urlsplit(GUEST_UPSTREAM)
if parsed_guest.scheme not in ("http", "https") or not parsed_guest.netloc or parsed_guest.path or parsed_guest.query or parsed_guest.fragment or parsed_guest.username:
    raise SystemExit("Guest upstream must be an HTTP(S) origin.")
BUILD = Path(__file__).resolve().parents[1] / "build" / "web"


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BUILD), **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.proxy_api()
        else:
            super().do_GET()

    def do_POST(self):
        self.proxy_api()

    def do_PUT(self):
        self.proxy_api()

    def do_DELETE(self):
        self.proxy_api()

    def proxy_api(self):
        path = urlsplit(self.path).path
        root = "/api/v1/restaurants"
        guest_routes = {
            "register": {"POST"}, "login": {"POST"}, "me": {"GET", "PUT", "DELETE"},
            "logout": {"POST"}, "password": {"POST"},
            "email/code": {"POST"}, "email/verify": {"POST"},
            "password/forgot": {"POST"}, "password/reset": {"POST"},
        }
        guest_path = path.removeprefix("/api/v1/guest/")
        is_guest = path.startswith("/api/v1/guest/") and guest_path in guest_routes
        is_restaurant = path == root or path.startswith(root + "/")
        is_context = path == "/api/v1/platform/context"
        if not (is_guest or is_restaurant or is_context):
            self.send_error(404)
            return
        segments = path.strip("/").split("/")
        allowed = guest_routes[guest_path] if is_guest else ({"GET", "POST"} if len(segments) == 5 and segments[-1] == "reservations" else {"GET"})
        is_booking_access = is_restaurant and len(segments) == 7 and segments[4] == 'reservations' and segments[5].isdigit() and segments[6] in ('guest', 'cancel')
        is_preorder = is_restaurant and len(segments) >= 7 and segments[4] == 'reservations' and segments[5].isdigit() and segments[6] == 'preorders'
        if is_preorder:
            allowed = {'GET', 'POST'} if len(segments) == 7 else ({'POST'} if (len(segments) == 8 and segments[7] == 'quote') or (len(segments) == 9 and segments[8] == 'checkout') else set())
        if is_booking_access:
            allowed = {'GET'} if segments[6] == 'guest' else {'POST'}
        if self.command not in allowed:
            self.send_error(405)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(400)
            return
        if length < 0 or length > 65536:
            self.send_error(413)
            return
        body = self.rfile.read(length) if self.command in ("POST", "PUT", "DELETE") else None
        request = Request(
            (GUEST_UPSTREAM if is_guest else UPSTREAM) + self.path,
            data=body,
            method=self.command,
            headers={"Accept": "application/json", "Content-Type": "application/json",
                     **({"X-Reservation-Token": self.headers["X-Reservation-Token"]} if (is_booking_access or is_preorder) and self.headers.get("X-Reservation-Token") else {}),
                     **({"Authorization": self.headers["Authorization"]} if is_guest and self.headers.get("Authorization") else {})},
        )
        try:
            response = urlopen(request, timeout=30)
        except HTTPError as error:
            response = error
        except (URLError, TimeoutError):
            self.send_error(502, "API unavailable")
            return
        with response:
            payload = response.read()
            self.send_response(response.status)
            self.send_header("Content-Type", response.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)


if __name__ == "__main__":
    if not (BUILD / "index.html").is_file():
        raise SystemExit("Build the Flutter web release first; see README.md.")
    parser = argparse.ArgumentParser(description="Flutter preview with the live restaurant and guest API")
    parser.add_argument("--host", choices=["127.0.0.1", "0.0.0.0"], default="127.0.0.1", help="Use 0.0.0.0 for testing on an iPhone on your local Wi-Fi")
    args = parser.parse_args()
    print(f"Guest accounts upstream: {GUEST_UPSTREAM}", flush=True)
    print("Live API preview: http://127.0.0.1:5188", flush=True)
    ThreadingHTTPServer((args.host, 5188), PreviewHandler).serve_forever()
