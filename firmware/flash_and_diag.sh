#!/usr/bin/env bash
#
# One-shot rebuild + flash + sanity check for the Quote/0 USB-EPD firmware.
#
# Usage:
#   firmware/flash_and_diag.sh                  # auto-detect port; build + flash + sanity
#   firmware/flash_and_diag.sh --skip-build
#   firmware/flash_and_diag.sh --skip-flash     # just run host-side diagnostics
#   firmware/flash_and_diag.sh --port /dev/cu.usbmodemXXXX
#
# Expected output on a working unit:
#   - Q0READY banner
#   - PONG
#   - STATUS line with stage=done, busy=1, pins=busy:1,pwr:1,rst:1,dc:0,cs:1
#   - a full-refresh cycle that finishes in ~1.8 s per frame

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FW_DIR="$REPO_ROOT/firmware/quote0-usb-epd"
TOOLS_BIN="$REPO_ROOT/.deps/espressif-tools/python_env/idf5.5_py3.9_env/bin"
BUILD_DIR="$FW_DIR/build"

SKIP_BUILD=0
SKIP_FLASH=0
PORT=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-build) SKIP_BUILD=1; shift ;;
        --skip-flash) SKIP_FLASH=1; shift ;;
        --port)       PORT="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,15p' "$0"
            exit 0
            ;;
        *)
            echo "unknown arg: $1" >&2
            exit 2
            ;;
    esac
done

if [[ -z "$PORT" ]]; then
    for candidate in /dev/cu.usbmodem* /dev/cu.usbserial* /dev/ttyACM* /dev/ttyUSB*; do
        if [[ -e "$candidate" ]]; then
            PORT="$candidate"
            break
        fi
    done
fi

if [[ -z "$PORT" ]]; then
    echo "ERROR: no serial port detected; plug the Quote/0 in and retry, or pass --port" >&2
    exit 1
fi

echo "Using port: $PORT"
export PATH="$TOOLS_BIN:$PATH"

if [[ "$SKIP_BUILD" -ne 1 ]]; then
    echo "=== Building firmware ==="
    cmake --build "$BUILD_DIR"
fi

if [[ "$SKIP_FLASH" -ne 1 ]]; then
    echo "=== Flashing firmware ==="
    python3 "$TOOLS_BIN/esptool.py" \
        --chip esp32c3 \
        --port "$PORT" \
        --baud 460800 \
        --before default_reset \
        --after hard_reset \
        write_flash \
        --flash_mode dio --flash_freq 80m --flash_size 4MB \
        0x0     "$BUILD_DIR/bootloader/bootloader.bin" \
        0x8000  "$BUILD_DIR/partition_table/partition-table.bin" \
        0x10000 "$BUILD_DIR/quote0_usb_epd.bin"
    echo "Waiting 2s for USB re-enumeration..."
    sleep 2
fi

PY="$TOOLS_BIN/python"
SEND="$REPO_ROOT/firmware/send_test_image.py"

echo "=== PING / STATUS / GPIO SNAP ==="
"$PY" "$SEND" "$PORT" --no-reset --ping --status --gpio-snap
echo
echo "=== Full refresh: checkerboard pattern ==="
"$PY" "$SEND" "$PORT" --no-reset --pattern checker
echo
echo "Done. Inspect the output above."
