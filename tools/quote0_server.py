#!/usr/bin/env python3
"""Small HTTP bridge for pushing frames to Quote0 over USB.

Designed for Raspberry Pi use. It intentionally has no web UI; other local
agents can push JSON with curl or HTTP libraries.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from quote0_send import (
    LAYOUTS,
    default_port,
    image_frame,
    list_ports,
    make_test_frame,
    render_text_frame,
    send_frame,
)


class Quote0State:
    def __init__(self, port: str, baud: int, layout: str) -> None:
        self.port = port
        self.baud = baud
        self.layout = layout
        self.lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    state: Quote0State

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"{self.address_string()} - {fmt % args}")

    def send_json(self, code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 5 * 1024 * 1024:
            raise ValueError("request too large")
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8")) if raw else {}

    def push(self, frame: bytes) -> bytes:
        with self.state.lock:
            return send_frame(self.state.port, self.state.baud, frame)

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(200, {"ok": True, "port": self.state.port, "ports": list_ports()})
            return
        self.send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        try:
            data = self.read_json()
            layout = data.get("layout", self.state.layout)
            if layout not in LAYOUTS:
                raise ValueError(f"unsupported layout: {layout}")
            threshold = int(data.get("threshold", 160))

            if self.path == "/display/test":
                frame = make_test_frame(data.get("pattern", "text"), layout=layout, threshold=threshold)
            elif self.path == "/display/text":
                frame = render_text_frame(
                    str(data.get("title", "Quote0")),
                    str(data.get("body", "")),
                    str(data.get("footer", "")),
                    layout=layout,
                    threshold=threshold,
                )
            elif self.path == "/display/image":
                if "path" in data:
                    frame = image_frame(str(data["path"]), threshold, layout=layout)
                elif "base64" in data:
                    image_bytes = base64.b64decode(str(data["base64"]), validate=True)
                    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
                        tmp.write(image_bytes)
                        tmp_path = tmp.name
                    try:
                        frame = image_frame(tmp_path, threshold, layout=layout)
                    finally:
                        os.unlink(tmp_path)
                else:
                    raise ValueError("provide image path or base64")
            else:
                self.send_json(404, {"ok": False, "error": "not found"})
                return

            response = self.push(frame)
            self.send_json(200, {"ok": b"OK" in response, "device": response.decode("utf-8", "replace").strip()})
        except Exception as exc:
            self.send_json(400, {"ok": False, "error": str(exc)})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--http-port", type=int, default=8787)
    parser.add_argument("--device", default=None, help="USB serial port; auto-detected if omitted")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--layout", choices=LAYOUTS, default="landscape-right")
    args = parser.parse_args()

    state = Quote0State(args.device or default_port(), args.baud, args.layout)
    Handler.state = state
    server = ThreadingHTTPServer((args.host, args.http_port), Handler)
    print(f"Quote0 HTTP bridge on http://{args.host}:{args.http_port}, device={state.port}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
