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
- Display controller: UC8251D (confirmed by the stock firmware boot log and by
  a working custom-firmware full refresh of ~1.8 s)
- Physical display buffer: `152 x 296`, 1 bit per pixel, `5624` bytes

Observed Quote/0 pin map:

| Signal | GPIO | Notes |
| --- | ---: | --- |
| EPD SCLK | 10 | GPIO matrix output `FSPICLK` |
| EPD MOSI / DIN | 7 | GPIO matrix output `FSPID` |
| EPD CS | 6 | GPIO matrix output `FSPICS0` |
| EPD BUSY | 3 | LOW while busy, HIGH when idle; needs **MCU internal pull-up** (no external pull on the PCB) |
| EPD RST | 4 | toggles high-low-high at refresh start |
| EPD DC | 5 | command/data select |
| EPD POWER_EN | 20 | held high while display is active |

If you bring up a different Quote/0 unit and the panel stays white, read
[docs/firmware/white-screen-debug-journey.md](docs/firmware/white-screen-debug-journey.md)
before touching the pin map — on the tested unit, the pin map above was
already correct, and the BUSY-pull misconfiguration masqueraded as a
pin-map problem for a long time.

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
- `portrait` (alias of `native`)
- `portrait-180` (alias of `native-180`)
- `landscape-left`
- `landscape-right`

Use `--image path.png` to send a rendered image. Image/text rendering needs
Pillow installed on the sending machine:

```sh
python3 -m pip install Pillow
python3 tools/quote0_send.py --image path.png --layout landscape-right
```

Use `--compose spec.json` to send a mixed layout with arbitrary text, images,
and simple drawing primitives:

```json
{
  "layout": "landscape-right",
  "background": "white",
  "border": true,
  "elements": [
    {"type": "text", "x": 12, "y": 12, "w": 150, "h": 28, "text": "Claude Buddy", "font_size": 22},
    {"type": "text", "x": 12, "y": 50, "w": 170, "h": 74, "text": "Waiting for permission. USB middleware can now mix text and images.", "font_size": 15},
    {"type": "image", "x": 192, "y": 16, "w": 88, "h": 88, "path": "./avatar.png", "fit": "contain"},
    {"type": "line", "x1": 12, "y1": 132, "x2": 282, "y2": 132, "width": 1},
    {"type": "text", "x": 12, "y": 136, "w": 270, "h": 12, "text": "quote0 middleware", "font_size": 11}
  ]
}
```

```sh
python3 tools/quote0_send.py --compose spec.json
```

On the tested Quote0 unit in this repository, the panel currently needs
framebuffer inversion. Use `--invert` if the screen turns fully white:

```sh
python3 tools/quote0_send.py --text "Hello Quote0" --title "USB" --invert
python3 tools/quote0_send.py --compose spec.json --invert
```

## Raspberry Pi HTTP Middleware

Run this on a Raspberry Pi or desktop machine with Quote0 attached over USB:

```sh
python3 -m pip install Pillow
python3 tools/quote0_server.py --host 0.0.0.0 --http-port 8787
```

Inspect middleware capabilities:

```sh
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/capabilities
```

Push text:

```sh
curl -X POST http://127.0.0.1:8787/display/text \
  -H 'Content-Type: application/json' \
  --data '{"title":"Claude Buddy","body":"Waiting for permission","footer":"quote0"}'
```

Push an image:

```sh
curl -X POST http://127.0.0.1:8787/display/image \
  -H 'Content-Type: application/json' \
  --data '{"path":"./avatar.png","layout":"landscape-right"}'
```

Push a composed layout with text, image, and simple vector elements:

```sh
curl -X POST http://127.0.0.1:8787/display/compose \
  -H 'Content-Type: application/json' \
  --data '{
    "layout":"landscape-right",
    "background":"white",
    "border":true,
    "elements":[
      {"type":"text","x":12,"y":12,"w":150,"h":28,"text":"Claude Buddy","font_size":22},
      {"type":"text","x":12,"y":50,"w":170,"h":74,"text":"Waiting for approval. Compose mode supports mixed content.","font_size":15},
      {"type":"image","x":192,"y":16,"w":88,"h":88,"path":"./avatar.png","fit":"contain"},
      {"type":"line","x1":12,"y1":132,"x2":282,"y2":132,"width":1},
      {"type":"text","x":12,"y":136,"w":270,"h":12,"text":"quote0 middleware","font_size":11}
    ]
  }'
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
