#!/usr/bin/env python3
"""Send a 152x296 1bpp framebuffer to Quote0 custom USB firmware."""

from __future__ import annotations

import argparse
import glob
import os
import select
import sys
import termios
import time
import zlib
from pathlib import Path

WIDTH = 152
HEIGHT = 296
FRAME_BYTES = WIDTH * HEIGHT // 8

LAYOUTS = ("native", "native-180", "landscape-left", "landscape-right")


def list_ports() -> list[str]:
    patterns = (
        "/dev/cu.usbmodem*",
        "/dev/ttyACM*",
        "/dev/ttyUSB*",
        "/dev/serial/by-id/*Espressif*",
        "/dev/serial/by-id/*USB_JTAG*",
    )
    ports: list[str] = []
    for pattern in patterns:
        ports.extend(glob.glob(pattern))
    return sorted(dict.fromkeys(ports))


def default_port() -> str:
    ports = list_ports()
    if not ports:
        raise SystemExit("No Quote0 USB serial port found; pass --port explicitly")
    return ports[0]


def open_serial(path: str, baud: int) -> int:
    fd = os.open(path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    attrs = termios.tcgetattr(fd)
    attrs[0] = 0
    attrs[1] = 0
    attrs[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
    attrs[3] = 0
    speed = getattr(termios, f"B{baud}", termios.B115200)
    attrs[4] = speed
    attrs[5] = speed
    attrs[6][termios.VMIN] = 0
    attrs[6][termios.VTIME] = 0
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    return fd


def write_all(fd: int, data: bytes) -> None:
    pos = 0
    while pos < len(data):
        _, writable, _ = select.select([], [fd], [], 2.0)
        if not writable:
            raise TimeoutError("serial write timed out")
        pos += os.write(fd, data[pos:])


def read_available(fd: int, timeout: float = 2.0) -> bytes:
    end = time.time() + timeout
    chunks: list[bytes] = []
    while time.time() < end:
        readable, _, _ = select.select([fd], [], [], 0.05)
        if readable:
            chunk = os.read(fd, 4096)
            chunks.append(chunk)
            if b"\n" in chunk:
                break
    return b"".join(chunks)


def pack_pixels(bits: list[int]) -> bytes:
    if len(bits) != WIDTH * HEIGHT:
        raise ValueError("wrong pixel count")
    out = bytearray(FRAME_BYTES)
    for i, bit in enumerate(bits):
        if bit:
            out[i // 8] |= 0x80 >> (i % 8)
    return bytes(out)


def require_pillow():
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as exc:
        raise SystemExit("Pillow is required: python3 -m pip install Pillow") from exc
    return Image, ImageDraw, ImageFont


def logical_size(layout: str) -> tuple[int, int]:
    if layout in ("landscape-left", "landscape-right"):
        return HEIGHT, WIDTH
    return WIDTH, HEIGHT


def to_native_image(img, layout: str):
    if layout == "native":
        return img
    if layout == "native-180":
        return img.rotate(180)
    if layout == "landscape-left":
        return img.rotate(90, expand=True)
    if layout == "landscape-right":
        return img.rotate(270, expand=True)
    raise ValueError(f"unsupported layout: {layout}")


def frame_from_image(img, threshold: int = 160) -> bytes:
    img = img.convert("L")
    if img.size != (WIDTH, HEIGHT):
        raise ValueError(f"native image must be {WIDTH}x{HEIGHT}, got {img.size}")
    bits = [1 if px >= threshold else 0 for px in img.getdata()]
    return pack_pixels(bits)


def load_font(ImageFont, size: int):
    candidates = (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    )
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def text_width(draw, text: str, font) -> int:
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0]


def text_height(draw, text: str, font) -> int:
    box = draw.textbbox((0, 0), text, font=font)
    return box[3] - box[1]


def wrap_text(draw, text: str, font, max_width: int) -> list[str]:
    lines: list[str] = []
    for raw_line in text.splitlines() or [""]:
        words = raw_line.split()
        if not words:
            lines.append("")
            continue
        line = words[0]
        for word in words[1:]:
            candidate = f"{line} {word}"
            if text_width(draw, candidate, font) <= max_width:
                line = candidate
            else:
                lines.append(line)
                line = word
        lines.append(line)
    return lines


def render_text_frame(
    title: str,
    body: str,
    footer: str = "",
    *,
    layout: str = "landscape-right",
    threshold: int = 160,
) -> bytes:
    Image, ImageDraw, ImageFont = require_pillow()
    size = logical_size(layout)
    img = Image.new("L", size, 255)
    draw = ImageDraw.Draw(img)

    title_font = load_font(ImageFont, 18 if size[0] > size[1] else 16)
    body_font = load_font(ImageFont, 14 if size[0] > size[1] else 13)
    footer_font = load_font(ImageFont, 11)

    margin = 10
    draw.rectangle((0, 0, size[0] - 1, size[1] - 1), outline=0, width=2)
    y = margin

    if title:
        title_lines = wrap_text(draw, title, title_font, size[0] - margin * 2)
        for line in title_lines[:2]:
            draw.text((margin, y), line, fill=0, font=title_font)
            y += text_height(draw, line or "A", title_font) + 4
        draw.line((margin, y + 1, size[0] - margin, y + 1), fill=0, width=1)
        y += 8

    footer_height = text_height(draw, footer or "A", footer_font) + 8 if footer else 0
    max_body_y = size[1] - margin - footer_height
    for line in wrap_text(draw, body, body_font, size[0] - margin * 2):
        line_h = text_height(draw, line or "A", body_font) + 4
        if y + line_h > max_body_y:
            draw.text((margin, max_body_y - line_h), "...", fill=0, font=body_font)
            break
        draw.text((margin, y), line, fill=0, font=body_font)
        y += line_h

    if footer:
        fy = size[1] - margin - text_height(draw, footer, footer_font)
        draw.line((margin, fy - 5, size[0] - margin, fy - 5), fill=0, width=1)
        draw.text((margin, fy), footer, fill=0, font=footer_font)

    return frame_from_image(to_native_image(img, layout), threshold)


def make_test_frame(kind: str, *, layout: str = "native", threshold: int = 160) -> bytes:
    try:
        Image, ImageDraw, ImageFont = require_pillow()
    except SystemExit:
        if layout != "native":
            raise
        return make_native_test_frame(kind)

    size = logical_size(layout)
    img = Image.new("L", size, 255)
    draw = ImageDraw.Draw(img)

    if kind == "black":
        draw.rectangle((0, 0, size[0], size[1]), fill=0)
    elif kind == "checker":
        step = 8
        for y in range(0, size[1], step):
            for x in range(0, size[0], step):
                if ((x // step) + (y // step)) % 2 == 0:
                    draw.rectangle((x, y, x + step - 1, y + step - 1), fill=0)
    elif kind == "bars":
        step = max(8, size[0] // 8)
        for x in range(0, size[0], step * 2):
            draw.rectangle((x, 0, x + step - 1, size[1]), fill=0)
    elif kind == "corners":
        font = load_font(ImageFont, 14)
        draw.rectangle((0, 0, size[0] - 1, size[1] - 1), outline=0, width=2)
        marks = [
            (4, 4, "TL"),
            (size[0] - 28, 4, "TR"),
            (4, size[1] - 22, "BL"),
            (size[0] - 28, size[1] - 22, "BR"),
        ]
        for x, y, label in marks:
            draw.rectangle((x, y, x + 16, y + 16), fill=0)
            draw.text((x + 20 if x < size[0] // 2 else x - 22, y), label, fill=0, font=font)
        draw.line((0, 0, size[0] - 1, size[1] - 1), fill=0, width=1)
    elif kind == "white":
        pass
    else:
        font = load_font(ImageFont, 18)
        body = "QUOTE0 USB\n152x296 1bpp\nOK"
        draw.rectangle((0, 0, size[0] - 1, size[1] - 1), outline=0, width=2)
        draw.line((0, 0, size[0] - 1, size[1] - 1), fill=0, width=2)
        y = 20
        for line in body.splitlines():
            w = text_width(draw, line, font)
            draw.text(((size[0] - w) // 2, y), line, fill=0, font=font)
            y += text_height(draw, line, font) + 8

    return frame_from_image(to_native_image(img, layout), threshold)


def make_native_test_frame(kind: str) -> bytes:
    bits: list[int] = []
    for y in range(HEIGHT):
        for x in range(WIDTH):
            white = 1
            if kind == "black":
                white = 0
            elif kind == "checker":
                white = 0 if ((x // 8) + (y // 8)) % 2 == 0 else 1
            elif kind == "bars":
                white = 0 if (x // 19) % 2 == 0 else 1
            else:
                border = x < 3 or x >= WIDTH - 3 or y < 3 or y >= HEIGHT - 3
                diag = abs((x * HEIGHT // WIDTH) - y) < 2
                title = 24 < y < 54 and 16 < x < WIDTH - 16 and ((x + y) % 7) < 3
                white = 0 if border or diag or title else 1
            bits.append(white)
    return pack_pixels(bits)


def image_frame(path: str, threshold: int, *, layout: str = "landscape-right") -> bytes:
    Image, _, _ = require_pillow()
    img = Image.open(path).convert("L")
    size = logical_size(layout)
    img.thumbnail(size)
    canvas = Image.new("L", size, 255)
    canvas.paste(img, ((size[0] - img.width) // 2, (size[1] - img.height) // 2))
    return frame_from_image(to_native_image(canvas, layout), threshold)


def send_frame(port: str, baud: int, frame: bytes, *, timeout: float = 25.0) -> bytes:
    if len(frame) != FRAME_BYTES:
        raise ValueError(f"frame must be {FRAME_BYTES} bytes")
    crc = zlib.crc32(frame) & 0xFFFFFFFF
    header = f"Q0IMG1 {WIDTH} {HEIGHT} 1BPP {len(frame)} {crc:08x}\n".encode()
    fd = open_serial(port, baud)
    try:
        read_available(fd, 0.2)
        write_all(fd, header)
        write_all(fd, frame)
        return read_available(fd, timeout)
    finally:
        os.close(fd)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", help="USB serial port; auto-detected if omitted")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--list-ports", action="store_true")
    parser.add_argument("--image")
    parser.add_argument("--text", help="Render text instead of using --image or --test")
    parser.add_argument("--title", default="Quote0")
    parser.add_argument("--footer", default="")
    parser.add_argument("--threshold", type=int, default=160)
    parser.add_argument("--layout", choices=LAYOUTS, default="landscape-right")
    parser.add_argument(
        "--test",
        choices=["text", "checker", "bars", "black", "white", "corners"],
        default="text",
    )
    args = parser.parse_args()

    if args.list_ports:
        for port in list_ports():
            print(port)
        return 0

    port = args.port or default_port()
    if args.image:
        frame = image_frame(args.image, args.threshold, layout=args.layout)
    elif args.text is not None:
        frame = render_text_frame(args.title, args.text, args.footer, layout=args.layout, threshold=args.threshold)
    else:
        frame = make_test_frame(args.test, layout=args.layout, threshold=args.threshold)

    response = send_frame(port, args.baud, frame)
    sys.stdout.buffer.write(response)
    return 0 if b"OK" in response else 1


if __name__ == "__main__":
    raise SystemExit(main())
