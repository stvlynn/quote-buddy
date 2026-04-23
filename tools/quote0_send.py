#!/usr/bin/env python3
"""Send a 152x296 1bpp framebuffer to Quote0 custom USB firmware."""

from __future__ import annotations

import argparse
import base64
import glob
import io
import json
import os
import select
import sys
import termios
import time
import zlib
from pathlib import Path
from typing import Any

WIDTH = 152
HEIGHT = 296
FRAME_BYTES = WIDTH * HEIGHT // 8

LAYOUTS = (
    "native",
    "native-180",
    "portrait",
    "portrait-180",
    "landscape-left",
    "landscape-right",
)
ELEMENT_TYPES = ("text", "image", "rect", "line")
IMAGE_FIT_MODES = ("contain", "cover", "stretch")


def normalize_layout(layout: str) -> str:
    aliases = {
        "portrait": "native",
        "portrait-180": "native-180",
    }
    normalized = aliases.get(layout, layout)
    if normalized not in {"native", "native-180", "landscape-left", "landscape-right"}:
        raise ValueError(f"unsupported layout: {layout}")
    return normalized


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
    normalized = normalize_layout(layout)
    if normalized in ("landscape-left", "landscape-right"):
        return HEIGHT, WIDTH
    return WIDTH, HEIGHT


def to_native_image(img, layout: str):
    normalized = normalize_layout(layout)
    if normalized == "native":
        return img
    if normalized == "native-180":
        return img.rotate(180)
    if normalized == "landscape-left":
        return img.rotate(90, expand=True)
    if normalized == "landscape-right":
        return img.rotate(270, expand=True)
    raise ValueError(f"unsupported layout: {layout}")


def frame_from_image(img, threshold: int = 160) -> bytes:
    img = img.convert("L")
    if img.size != (WIDTH, HEIGHT):
        raise ValueError(f"native image must be {WIDTH}x{HEIGHT}, got {img.size}")
    bits = [1 if px >= threshold else 0 for px in img.getdata()]
    return pack_pixels(bits)


def invert_frame(frame: bytes) -> bytes:
    return bytes((~byte) & 0xFF for byte in frame)


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
    if max_width <= 0:
        return [""]

    lines: list[str] = []
    for raw_line in text.splitlines() or [""]:
        if not raw_line:
            lines.append("")
            continue

        current = ""
        for ch in raw_line:
            candidate = f"{current}{ch}"
            if current and text_width(draw, candidate, font) > max_width:
                lines.append(current.rstrip())
                current = ch.lstrip() if ch.isspace() else ch
            else:
                current = candidate
        lines.append(current.rstrip())
    return lines


def normalize_color(value: Any, *, default: int = 255) -> int:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return max(0, min(255, int(value)))

    text = str(value).strip().lower()
    if text in {"white", "#fff", "#ffffff", "255", "light"}:
        return 255
    if text in {"black", "#000", "#000000", "0", "dark"}:
        return 0
    raise ValueError(f"unsupported color: {value}")


def parse_padding(value: Any) -> tuple[int, int, int, int]:
    if value is None:
        return (0, 0, 0, 0)
    if isinstance(value, (int, float)):
        n = int(value)
        return (n, n, n, n)
    if isinstance(value, (list, tuple)):
        values = [int(v) for v in value]
        if len(values) == 2:
            return (values[0], values[1], values[0], values[1])
        if len(values) == 4:
            return (values[0], values[1], values[2], values[3])
    raise ValueError("padding must be a number, [vertical, horizontal], or [top, right, bottom, left]")


def resolve_box(spec: dict[str, Any], canvas_size: tuple[int, int]) -> tuple[int, int, int, int]:
    if "rect" in spec:
        rect = spec["rect"]
        if not isinstance(rect, (list, tuple)) or len(rect) != 4:
            raise ValueError("rect must be [x, y, width, height]")
        x, y, w, h = (int(rect[0]), int(rect[1]), int(rect[2]), int(rect[3]))
    else:
        x = int(spec.get("x", 0))
        y = int(spec.get("y", 0))
        w = int(spec.get("w", spec.get("width", canvas_size[0] - x)))
        h = int(spec.get("h", spec.get("height", canvas_size[1] - y)))

    if w <= 0 or h <= 0:
        raise ValueError(f"invalid box size: {(x, y, w, h)}")
    return (x, y, w, h)


def inner_box(box: tuple[int, int, int, int], padding: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    x, y, w, h = box
    top, right, bottom, left = padding
    inner_w = max(1, w - left - right)
    inner_h = max(1, h - top - bottom)
    return (x + left, y + top, inner_w, inner_h)


def align_x(x: int, width: int, content_width: int, align: str) -> int:
    if align == "center":
        return x + max(0, (width - content_width) // 2)
    if align == "right":
        return x + max(0, width - content_width)
    return x


def align_y(y: int, height: int, content_height: int, valign: str) -> int:
    if valign in {"middle", "center"}:
        return y + max(0, (height - content_height) // 2)
    if valign == "bottom":
        return y + max(0, height - content_height)
    return y


def ellipsize_text(draw, text: str, font, max_width: int) -> str:
    if text_width(draw, text, font) <= max_width:
        return text

    ellipsis = "..."
    if text_width(draw, ellipsis, font) > max_width:
        return ""

    current = text
    while current and text_width(draw, f"{current.rstrip()}{ellipsis}", font) > max_width:
        current = current[:-1]
    return f"{current.rstrip()}{ellipsis}"


def fit_text_lines(draw, lines: list[str], font, max_width: int, max_height: int, line_spacing: int) -> list[str]:
    line_h = text_height(draw, "Ag", font)
    stride = line_h + line_spacing
    max_lines = max(1, (max_height + line_spacing) // max(1, stride))
    if len(lines) <= max_lines:
        return lines

    trimmed = lines[:max_lines]
    trimmed[-1] = ellipsize_text(draw, trimmed[-1], font, max_width)
    return trimmed


def draw_text_element(draw, spec: dict[str, Any], canvas_size: tuple[int, int], ImageFont) -> None:
    box = resolve_box(spec, canvas_size)
    pad = parse_padding(spec.get("padding", 0))
    inner = inner_box(box, pad)
    ix, iy, iw, ih = inner
    font_size = int(spec.get("font_size", 16))
    font = load_font(ImageFont, font_size)
    fill = normalize_color(spec.get("fill"), default=0)
    align = str(spec.get("align", "left")).lower()
    valign = str(spec.get("valign", "top")).lower()
    line_spacing = int(spec.get("line_spacing", 4))
    text = str(spec.get("text", ""))

    lines = wrap_text(draw, text, font, iw)
    lines = fit_text_lines(draw, lines, font, iw, ih, line_spacing)
    line_h = text_height(draw, "Ag", font)
    block_height = len(lines) * line_h + max(0, len(lines) - 1) * line_spacing
    y = align_y(iy, ih, block_height, valign)

    for line in lines:
        x = align_x(ix, iw, text_width(draw, line, font), align)
        draw.text((x, y), line, fill=fill, font=font)
        y += line_h + line_spacing


def parse_image_bytes(value: str) -> bytes:
    payload = value.strip()
    if payload.startswith("data:"):
        _, _, payload = payload.partition(",")
    return base64.b64decode(payload, validate=True)


def image_resample_filter(Image):
    if hasattr(Image, "Resampling"):
        return Image.Resampling.LANCZOS
    return Image.LANCZOS


def floyd_steinberg_dither(Image):
    if hasattr(Image, "Dither"):
        return Image.Dither.FLOYDSTEINBERG
    return Image.FLOYDSTEINBERG


def enhance_photo_image(img, *, autocontrast: bool = True, contrast: float = 1.18, sharpen: float = 1.0):
    try:
        from PIL import ImageEnhance, ImageFilter, ImageOps
    except ImportError as exc:
        raise SystemExit("Pillow is required: python3 -m pip install Pillow") from exc

    out = img.convert("L")
    if autocontrast:
        out = ImageOps.autocontrast(out, cutoff=1)
    if contrast != 1.0:
        out = ImageEnhance.Contrast(out).enhance(contrast)
    if sharpen > 0:
        percent = max(0, int(round(140 * sharpen)))
        out = out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=percent, threshold=2))
    return out


def render_processed_image(img, size: tuple[int, int], fit: str, Image, *, photo: bool = False, dither: bool = False):
    rendered = resize_image(img.convert("L"), size, fit, Image)
    if photo:
        rendered = enhance_photo_image(rendered)
    if dither or photo:
        rendered = rendered.convert("1", dither=floyd_steinberg_dither(Image)).convert("L")
    return rendered


def open_image_source(spec: dict[str, Any], Image):
    if "path" in spec:
        return Image.open(str(spec["path"]))
    if "base64" in spec:
        return Image.open(io.BytesIO(parse_image_bytes(str(spec["base64"]))))
    raise ValueError("image element requires path or base64")


def resize_image(img, size: tuple[int, int], fit: str, Image):
    target_w, target_h = size
    if target_w <= 0 or target_h <= 0:
        raise ValueError("image target size must be positive")

    resample = image_resample_filter(Image)
    if fit == "stretch":
        return img.resize((target_w, target_h), resample)

    src_w, src_h = img.size
    if src_w <= 0 or src_h <= 0:
        raise ValueError("source image has invalid size")

    if fit == "cover":
        scale = max(target_w / src_w, target_h / src_h)
        scaled = img.resize((max(1, int(round(src_w * scale))), max(1, int(round(src_h * scale)))), resample)
        left = max(0, (scaled.width - target_w) // 2)
        top = max(0, (scaled.height - target_h) // 2)
        return scaled.crop((left, top, left + target_w, top + target_h))

    scale = min(target_w / src_w, target_h / src_h)
    scaled = img.resize((max(1, int(round(src_w * scale))), max(1, int(round(src_h * scale)))), resample)
    canvas = Image.new("L", (target_w, target_h), 255)
    left = max(0, (target_w - scaled.width) // 2)
    top = max(0, (target_h - scaled.height) // 2)
    canvas.paste(scaled, (left, top))
    return canvas


def draw_image_element(canvas, spec: dict[str, Any], canvas_size: tuple[int, int], Image) -> None:
    box = resolve_box(spec, canvas_size)
    x, y, w, h = box
    fit = str(spec.get("fit", "contain")).lower()
    if fit not in IMAGE_FIT_MODES:
        raise ValueError(f"unsupported image fit: {fit}")

    photo = bool(spec.get("photo", False))
    dither = bool(spec.get("dither", False))

    with open_image_source(spec, Image) as src:
        rendered = render_processed_image(src, (w, h), fit, Image, photo=photo, dither=dither)
    canvas.paste(rendered, (x, y))


def draw_rect_element(draw, spec: dict[str, Any], canvas_size: tuple[int, int]) -> None:
    x, y, w, h = resolve_box(spec, canvas_size)
    fill = spec.get("fill")
    outline = spec.get("outline")
    width = int(spec.get("width", 1))
    draw.rectangle(
        (x, y, x + w - 1, y + h - 1),
        fill=normalize_color(fill) if fill is not None else None,
        outline=normalize_color(outline, default=0) if outline is not None else None,
        width=width,
    )


def draw_line_element(draw, spec: dict[str, Any]) -> None:
    if "points" in spec:
        points = spec["points"]
        if not isinstance(points, list) or len(points) < 2:
            raise ValueError("line points must contain at least two [x, y] pairs")
        flat: list[int] = []
        for point in points:
            if not isinstance(point, (list, tuple)) or len(point) != 2:
                raise ValueError("each point must be [x, y]")
            flat.extend((int(point[0]), int(point[1])))
    else:
        flat = [
            int(spec.get("x1", 0)),
            int(spec.get("y1", 0)),
            int(spec.get("x2", 0)),
            int(spec.get("y2", 0)),
        ]
    draw.line(flat, fill=normalize_color(spec.get("fill"), default=0), width=int(spec.get("width", 1)))


def compose_canvas(spec: dict[str, Any], *, layout: str = "landscape-right"):
    Image, ImageDraw, ImageFont = require_pillow()
    resolved_layout = str(spec.get("layout", layout))
    if resolved_layout not in LAYOUTS:
        raise ValueError(f"unsupported layout: {resolved_layout}")

    size = logical_size(resolved_layout)
    canvas = Image.new("L", size, normalize_color(spec.get("background"), default=255))
    draw = ImageDraw.Draw(canvas)

    border = spec.get("border")
    if border:
        if isinstance(border, dict):
            inset = int(border.get("inset", 0))
            border_width = int(border.get("width", 1))
            color = normalize_color(border.get("color"), default=0)
        else:
            inset = 0
            border_width = 1
            color = 0
        draw.rectangle((inset, inset, size[0] - 1 - inset, size[1] - 1 - inset), outline=color, width=border_width)

    elements = spec.get("elements", [])
    if not isinstance(elements, list):
        raise ValueError("elements must be a list")

    for index, element in enumerate(elements):
        if not isinstance(element, dict):
            raise ValueError(f"element {index} must be an object")
        kind = str(element.get("type", "")).lower()
        if kind not in ELEMENT_TYPES:
            raise ValueError(f"unsupported element type: {kind}")

        if kind == "text":
            draw_text_element(draw, element, size, ImageFont)
        elif kind == "image":
            draw_image_element(canvas, element, size, Image)
        elif kind == "rect":
            draw_rect_element(draw, element, size)
        elif kind == "line":
            draw_line_element(draw, element)

    return canvas, resolved_layout


def compose_frame(spec: dict[str, Any], *, layout: str = "landscape-right", threshold: int = 160) -> bytes:
    canvas, resolved_layout = compose_canvas(spec, layout=layout)
    resolved_threshold = int(spec.get("threshold", threshold))
    return frame_from_image(to_native_image(canvas, resolved_layout), resolved_threshold)


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


def image_frame(
    path: str,
    threshold: int,
    *,
    layout: str = "landscape-right",
    fit: str = "contain",
    photo: bool = False,
    dither: bool = False,
) -> bytes:
    Image, _, _ = require_pillow()
    if fit not in IMAGE_FIT_MODES:
        raise ValueError(f"unsupported image fit: {fit}")
    size = logical_size(layout)
    with Image.open(path) as src:
        rendered = render_processed_image(src, size, fit, Image, photo=photo, dither=dither)
    return frame_from_image(to_native_image(rendered, layout), threshold)


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


def load_compose_spec(path: str) -> dict[str, Any]:
    raw = sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("compose spec must be a JSON object")
    return data


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", help="USB serial port; auto-detected if omitted")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--list-ports", action="store_true")
    parser.add_argument("--image")
    parser.add_argument("--image-fit", choices=IMAGE_FIT_MODES, default="contain", help="How --image is placed into the target canvas")
    parser.add_argument("--photo", action="store_true", help="Enable photo-friendly processing: autocontrast, sharpen, and dithering")
    parser.add_argument("--dither", action="store_true", help="Apply Floyd-Steinberg dithering to image content")
    parser.add_argument("--compose", help="JSON file with a composed layout spec; use - to read stdin")
    parser.add_argument("--text", help="Render text instead of using --image or --test")
    parser.add_argument("--title", default="Quote0")
    parser.add_argument("--footer", default="")
    parser.add_argument("--threshold", type=int, default=160)
    parser.set_defaults(invert=True)
    parser.add_argument("--invert", dest="invert", action="store_true", help="Invert all framebuffer bits before USB upload (default: enabled)")
    parser.add_argument("--no-invert", dest="invert", action="store_false", help="Disable framebuffer inversion before USB upload")
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
    if args.compose:
        frame = compose_frame(load_compose_spec(args.compose), layout=args.layout, threshold=args.threshold)
    elif args.image:
        frame = image_frame(
            args.image,
            args.threshold,
            layout=args.layout,
            fit=args.image_fit,
            photo=args.photo,
            dither=args.dither,
        )
    elif args.text is not None:
        frame = render_text_frame(args.title, args.text, args.footer, layout=args.layout, threshold=args.threshold)
    else:
        frame = make_test_frame(args.test, layout=args.layout, threshold=args.threshold)

    if args.invert:
        frame = invert_frame(frame)

    response = send_frame(port, args.baud, frame)
    sys.stdout.buffer.write(response)
    return 0 if b"OK" in response else 1


if __name__ == "__main__":
    raise SystemExit(main())
