# Quote0 USB EPD Buddy

This repository contains a custom-firmware path for using a MindReset Quote/0 as
a USB-driven e-paper display, intended for Raspberry Pi or desktop agents.

The stock Quote/0 firmware exposes a USB serial command shell but does not expose
a USB image upload path. The custom firmware in `firmware/quote0-usb-epd` replaces
the application with a tiny USB framebuffer receiver and UC8251D e-paper driver.

## Current Hardware Findings

Target device:

- MCU: ESP32-C3
- USB: native USB Serial/JTAG, VID/PID `303a:1001`
- Display controller: UC8251D / UC8151 compatible
- Physical display buffer: `152 x 296`, 1 bit per pixel, `5624` bytes

Observed Quote/0 pin map:

| Signal | GPIO | Notes |
| --- | ---: | --- |
| EPD SCLK | 10 | GPIO matrix output `FSPICLK` |
| EPD MOSI / DIN | 7 | GPIO matrix output `FSPID` |
| EPD CS | 6 | GPIO matrix output `FSPICS0` |
| EPD BUSY | 3 | toggles during full refresh |
| EPD RST | 4 | toggles high-low-high at refresh start |
| EPD DC | 5 | command/data select |
| EPD POWER_EN | 20 | held high while display is active |

Full stock flash backup from the connected unit:

```sh
/tmp/quote0-stock-2.0.8-fullflash.bin
sha256 da3ca8d8b1e3b29ff13a509dd3d4722308b06b33dbb8838bd5dae94e228293ed
```

The tested unit had Secure Boot and Flash Encryption disabled.

## USB Image Protocol

The first firmware protocol is deliberately small:

```text
Q0IMG1 152 296 1BPP 5624 <crc32-hex>\n
<5624 raw framebuffer bytes>
```

Frame buffer layout is native controller layout: 152 pixels wide, 296 rows,
MSB-first, `0` means black and `1` means white.

The firmware replies:

```text
OK\n
ERR <reason>\n
```

## Send A Test Pattern

The sender can auto-detect the USB serial port on macOS or Linux:

```sh
python3 tools/quote0_send.py --list-ports
python3 tools/quote0_send.py --test checker
```

```sh
python3 tools/quote0_send.py --port /dev/ttyACM0 --test checker
```

On macOS with the device attached directly:

```sh
python3 tools/quote0_send.py --port /dev/cu.usbmodem1101 --test text
```

Useful diagnostics:

```sh
python3 tools/quote0_send.py --test corners --layout landscape-right
python3 tools/quote0_send.py --text "Claude is waiting for approval" --title "Claude Buddy"
```

`--layout` controls how logical content is rotated into the display controller's
native `152x296` buffer:

- `native`
- `native-180`
- `landscape-left`
- `landscape-right`

Use `--image path.png` to send a rendered image. Image/text rendering needs
Pillow installed on the sending machine:

```sh
python3 -m pip install Pillow
python3 tools/quote0_send.py --image path.png --layout landscape-right
```

## Raspberry Pi HTTP Bridge

Run this on a Raspberry Pi with Quote0 attached over USB:

```sh
python3 -m pip install Pillow
python3 tools/quote0_server.py --host 0.0.0.0 --http-port 8787
```

Push text:

```sh
curl -X POST http://127.0.0.1:8787/display/text \
  -H 'Content-Type: application/json' \
  --data '{"title":"Claude Buddy","body":"Waiting for permission","footer":"quote0"}'
```

Push a test pattern:

```sh
curl -X POST http://127.0.0.1:8787/display/test \
  -H 'Content-Type: application/json' \
  --data '{"pattern":"corners","layout":"landscape-right"}'
```

## Restore Stock Firmware

```sh
PYTHONPATH=/tmp/quote_tools python3 -m esptool \
  --chip esp32c3 -p /dev/cu.usbmodem1101 \
  write-flash 0x0 /tmp/quote0-stock-2.0.8-fullflash.bin
```
