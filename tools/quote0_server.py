#!/usr/bin/env python3
"""Small HTTP bridge for pushing frames to Quote0 over USB.

Designed for Raspberry Pi use. It intentionally has no web UI; other local
agents can push JSON with curl or HTTP libraries.
"""

from __future__ import annotations

import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, ClassVar

if __package__:
    from .quote0_send import (
        ELEMENT_TYPES,
        HEIGHT,
        IMAGE_FIT_MODES,
        LAYOUTS,
        WIDTH,
        compose_frame,
        default_port,
        image_frame,
        invert_frame,
        list_ports,
        logical_size,
        make_test_frame,
        render_text_frame,
        send_frame,
    )
else:
    from quote0_send import (
        ELEMENT_TYPES,
        HEIGHT,
        IMAGE_FIT_MODES,
        LAYOUTS,
        WIDTH,
        compose_frame,
        default_port,
        image_frame,
        invert_frame,
        list_ports,
        logical_size,
        make_test_frame,
        render_text_frame,
        send_frame,
    )

MAX_REQUEST_BYTES = 12 * 1024 * 1024


def parse_boolish(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)

    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"invalid boolean value: {value}")


class Quote0State:
    def __init__(self, port: str, baud: int, layout: str, invert: bool) -> None:
        self.port = port
        self.baud = baud
        self.layout = layout
        self.invert = invert
        self.lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    state: ClassVar[Quote0State]

    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} - {format % args}")

    def send_json(self, code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_REQUEST_BYTES:
            raise ValueError("request too large")
        raw = self.rfile.read(length)
        data = json.loads(raw.decode("utf-8")) if raw else {}
        if not isinstance(data, dict):
            raise ValueError("request body must be a JSON object")
        return data

    def push(self, frame: bytes) -> bytes:
        with self.state.lock:
            return send_frame(self.state.port, self.state.baud, frame)

    def resolve_display_options(self, data: dict[str, Any]) -> tuple[str, int, bool]:
        layout = str(data.get("layout", self.state.layout))
        if layout not in LAYOUTS:
            raise ValueError(f"unsupported layout: {layout}")
        threshold = int(data.get("threshold", 160))
        invert = parse_boolish(data.get("invert"), default=self.state.invert)
        return layout, threshold, invert

    def build_frame(self, path: str, data: dict[str, Any]) -> bytes:
        layout, threshold, invert = self.resolve_display_options(data)

        if path == "/display/test":
            frame = make_test_frame(str(data.get("pattern", "text")), layout=layout, threshold=threshold)
        elif path == "/display/text":
            frame = render_text_frame(
                str(data.get("title", "Quote0")),
                str(data.get("body", "")),
                str(data.get("footer", "")),
                layout=layout,
                threshold=threshold,
            )
        elif path == "/display/image":
            image_fit = str(data.get("fit", data.get("image_fit", "contain")))
            photo = parse_boolish(data.get("photo"), default=False)
            dither = parse_boolish(data.get("dither"), default=False)
            if "path" in data:
                frame = image_frame(
                    str(data["path"]),
                    threshold,
                    layout=layout,
                    fit=image_fit,
                    photo=photo,
                    dither=dither,
                )
            elif "base64" in data:
                canvas_w, canvas_h = logical_size(layout)
                frame = compose_frame(
                    {
                        "elements": [
                            {
                                "type": "image",
                                "base64": str(data["base64"]),
                                "x": 0,
                                "y": 0,
                                "w": canvas_w,
                                "h": canvas_h,
                                "fit": image_fit,
                                "photo": photo,
                                "dither": dither,
                            }
                        ]
                    },
                    layout=layout,
                    threshold=threshold,
                )
            else:
                raise ValueError("provide image path or base64")
        elif path == "/display/compose":
            frame = compose_frame(data, layout=layout, threshold=threshold)
        else:
            raise ValueError("not found")

        return invert_frame(frame) if invert else frame

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(
                200,
                {
                    "ok": True,
                    "port": self.state.port,
                    "ports": list_ports(),
                    "display": {
                        "width": WIDTH,
                        "height": HEIGHT,
                        "layouts": list(LAYOUTS),
                        "format": "1BPP",
                        "invert_default": self.state.invert,
                    },
                },
            )
            return

        if self.path == "/capabilities":
            self.send_json(
                200,
                {
                    "ok": True,
                    "endpoints": ["/display/test", "/display/text", "/display/image", "/display/compose"],
                    "compose": {
                        "element_types": list(ELEMENT_TYPES),
                        "image_fit_modes": list(IMAGE_FIT_MODES),
                        "notes": [
                            "The compose endpoint accepts a JSON object with optional background, border, layout, threshold, and elements[].",
                            "Supported elements: text, image, rect, line.",
                            "Text elements support x/y/w/h, font_size, fill, align, valign, padding, and line_spacing.",
                            "Image elements support path or base64 plus x/y/w/h and fit=contain|cover|stretch.",
                            "Image endpoints also accept photo=true and dither=true for photo-friendly processing.",
                            "All POST endpoints also accept invert=true or invert=false to override the server default.",
                        ],
                    },
                },
            )
            return

        self.send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        try:
            data = self.read_json()
            frame = self.build_frame(self.path, data)
            response = self.push(frame)
            self.send_json(200, {"ok": b"OK" in response, "device": response.decode("utf-8", "replace").strip()})
        except ValueError as exc:
            code = 404 if str(exc) == "not found" else 400
            self.send_json(code, {"ok": False, "error": str(exc)})
        except Exception as exc:
            self.send_json(400, {"ok": False, "error": str(exc)})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--http-port", type=int, default=8787)
    parser.add_argument("--device", default=None, help="USB serial port; auto-detected if omitted")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--layout", choices=LAYOUTS, default="landscape-right")
    parser.set_defaults(invert=True)
    parser.add_argument("--invert", dest="invert", action="store_true", help="Invert all framebuffers by default before USB upload (default: enabled)")
    parser.add_argument("--no-invert", dest="invert", action="store_false", help="Disable default framebuffer inversion before USB upload")
    args = parser.parse_args()

    state = Quote0State(args.device or default_port(), args.baud, args.layout, args.invert)
    Handler.state = state
    server = ThreadingHTTPServer((args.host, args.http_port), Handler)
    print(f"Quote0 HTTP bridge on http://{args.host}:{args.http_port}, device={state.port}, invert={state.invert}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
