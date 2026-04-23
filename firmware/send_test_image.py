#!/usr/bin/env python3
"""
Send diagnostic commands or test framebuffers to the Quote/0 USB firmware.

Examples
--------
    # Default: cycle through white / checker / gradient / black
    python3 firmware/send_test_image.py /dev/cu.usbmodem101

    # Just query state
    python3 firmware/send_test_image.py /dev/cu.usbmodem101 --status
    python3 firmware/send_test_image.py /dev/cu.usbmodem101 --ping
    python3 firmware/send_test_image.py /dev/cu.usbmodem101 --gpio-snap

    # Manually toggle one control line (PWR/RST/DC/CS)
    python3 firmware/send_test_image.py /dev/cu.usbmodem101 --gpio-set PWR=1

The firmware reply format after a refresh is:

    OK stage=done mode=full busy=1 err=0 bus=1 pins=busy:1,pwr:1,rst:1,dc:0,cs:1
"""

from __future__ import annotations

import argparse
import sys
import time

import serial

WIDTH = 152
HEIGHT = 296
VALID_GPIO_PINS = {"PWR", "RST", "DC", "CS"}


def crc32_update(crc: int, data: bytes) -> int:
    """CRC-32 matching the ESP32-side implementation in protocol.c."""
    crc = (crc ^ 0xFFFFFFFF) & 0xFFFFFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xEDB88320
            else:
                crc >>= 1
            crc &= 0xFFFFFFFF
    return (crc ^ 0xFFFFFFFF) & 0xFFFFFFFF


def read_line(port: serial.Serial, timeout: float = 5.0) -> str:
    start = time.time()
    buf = bytearray()
    while time.time() - start < timeout:
        if port.in_waiting:
            buf.extend(port.read(port.in_waiting))
            if b"\n" in buf:
                break
        time.sleep(0.01)
    return buf.decode("ascii", errors="replace").strip()


def wait_for_ready(port: serial.Serial, timeout: float = 10.0) -> bool:
    start = time.time()
    while time.time() - start < timeout:
        if port.in_waiting:
            chunk = port.read(port.in_waiting)
            if b"Q0READY" in chunk:
                print(f"device ready: {chunk.decode('ascii', errors='replace').strip()}")
                return True
        time.sleep(0.01)
    return False


# --- Framebuffer generators ------------------------------------------------

def create_white(width: int, height: int) -> bytes:
    bytes_per_row = (width + 7) // 8
    return bytes([0xFF] * (bytes_per_row * height))


def create_black(width: int, height: int) -> bytes:
    bytes_per_row = (width + 7) // 8
    return bytes([0x00] * (bytes_per_row * height))


def create_checkerboard(width: int, height: int, square_size: int = 16) -> bytes:
    bytes_per_row = (width + 7) // 8
    frame = bytearray(bytes_per_row * height)
    for y in range(height):
        row_offset = y * bytes_per_row
        for x in range(width):
            if ((x // square_size) + (y // square_size)) % 2 == 0:
                frame[row_offset + (x // 8)] |= 1 << (7 - (x % 8))
    return bytes(frame)


def create_gradient(width: int, height: int) -> bytes:
    bytes_per_row = (width + 7) // 8
    frame = bytearray(bytes_per_row * height)
    for y in range(height):
        row_offset = y * bytes_per_row
        value = (y * 255) // height
        for x in range(width):
            pixel = value if (x * 255) // width > (255 - value) else 0
            if pixel > 127:
                frame[row_offset + (x // 8)] |= 1 << (7 - (x % 8))
    return bytes(frame)


PATTERN_BUILDERS = {
    "white": create_white,
    "black": create_black,
    "checker": lambda w, h: create_checkerboard(w, h, 16),
    "gradient": create_gradient,
}


# --- Commands --------------------------------------------------------------

def parse_gpio_assignment(value: str) -> tuple[str, int]:
    pin, sep, level = value.partition("=")
    pin = pin.strip().upper()
    if sep != "=" or pin not in VALID_GPIO_PINS or level not in {"0", "1"}:
        raise argparse.ArgumentTypeError(
            "GPIO assignment must be PIN=0 or PIN=1, where PIN is one of PWR,RST,DC,CS"
        )
    return pin, int(level)


def send_command(port: serial.Serial, command: str, timeout: float = 5.0) -> str:
    print(f">>> {command}")
    port.write((command + "\n").encode("ascii"))
    reply = read_line(port, timeout=timeout)
    print(f"<<< {reply}")
    return reply


def send_image(port: serial.Serial, name: str, frame: bytes) -> bool:
    assert len(frame) == (WIDTH * HEIGHT) // 8
    crc = crc32_update(0, frame)
    header = f"Q0IMG1 {WIDTH} {HEIGHT} 1BPP {len(frame)} {crc:x}"
    print(f"\n=== sending {name} ({len(frame)} bytes) ===")
    print(f"header: {header}")
    port.write((header + "\n").encode("ascii"))
    port.write(frame)
    reply = read_line(port, timeout=60.0)
    print(f"reply:  {reply}")
    return reply.startswith("OK")


# --- Entrypoint ------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("port", nargs="?", default="/dev/cu.usbmodem101")
    parser.add_argument("--no-reset", action="store_true",
                        help="Skip DTR/RTS toggle; use when the device is already running")
    parser.add_argument("--ping", action="store_true")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--gpio-snap", action="store_true",
                        help="Read back BUSY/PWR/RST/DC/CS levels")
    parser.add_argument("--gpio-set", action="append", default=[],
                        type=parse_gpio_assignment, metavar="PIN=LEVEL",
                        help="Drive one output pin; may be repeated")
    parser.add_argument("--pattern", choices=["all", *PATTERN_BUILDERS.keys()],
                        default="all",
                        help="Framebuffer upload demo when no command flags are set")
    return parser.parse_args()


def open_port(path: str) -> serial.Serial:
    print(f"opening {path}...")
    return serial.Serial(path, 115200, timeout=1.0)


def reset_device(port: serial.Serial) -> None:
    port.dtr = False
    port.rts = True
    time.sleep(0.1)
    port.dtr = True
    port.rts = False
    time.sleep(0.5)


def run_commands(port: serial.Serial, args: argparse.Namespace) -> bool:
    ok = True
    if args.ping:
        ok = send_command(port, "PING").startswith("PONG") and ok
    if args.status:
        ok = send_command(port, "STATUS").startswith("OK") and ok
    if args.gpio_snap:
        ok = send_command(port, "GPIO SNAP").startswith("OK") and ok
    for pin, level in args.gpio_set:
        ok = send_command(port, f"GPIO {pin} {level}").startswith("OK") and ok
    return ok


def run_patterns(port: serial.Serial, pattern: str) -> bool:
    names = list(PATTERN_BUILDERS) if pattern == "all" else [pattern]
    ok = True
    for i, name in enumerate(names):
        ok = send_image(port, name, PATTERN_BUILDERS[name](WIDTH, HEIGHT)) and ok
        if i + 1 < len(names):
            time.sleep(2)
    return ok


def main() -> int:
    args = parse_args()
    port = open_port(args.port)
    try:
        if not args.no_reset:
            reset_device(port)
            if not wait_for_ready(port, timeout=15.0):
                print("warning: no Q0READY banner; trying commands anyway")

        command_mode = (
            args.ping or args.status or args.gpio_snap or bool(args.gpio_set)
        )
        if command_mode:
            return 0 if run_commands(port, args) else 1
        return 0 if run_patterns(port, args.pattern) else 1
    finally:
        port.close()


if __name__ == "__main__":
    sys.exit(main())
