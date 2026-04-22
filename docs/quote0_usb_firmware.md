# Quote0 USB Firmware Notes

## What The Stock Firmware Provides

USB serial commands confirmed on firmware `2.0.8`:

- `COMMON.GET_STATUS`
- `COMMON.CHECK_POINT`
- `COMMON.FETCH_CONTENT`
- `COMMON.SHOW_MAC_QRCODE`
- `COMMON.LOCAL_IMAGE_ON/OFF`
- `COMMON.BLE_IMAGE_ON/OFF`

`COMMON.SET_WINDOW` exists in the binary, but it is not accepted by the UART
command dispatcher. Enabling `LOCAL_IMAGE_ON` does not make UART accept image
payloads. For USB push, a custom application firmware is cleaner than patching
the stock dispatcher.

## Flash Layout From The Update Image

The `2.0.8_merged_...bin` image is an ESP32-C3 merged image:

- bootloader at `0x0000`
- partition table at `0x8000`
- `nvs` at `0x9000`, size `0x4000`
- `otadata` at `0xd000`, size `0x2000`
- `phy_init` at `0xf000`, size `0x1000`
- `ota_0` at `0x10000`, size `0x1f0000`
- `ota_1` at `0x200000`, size `0x1f0000`

## Build Strategy

The firmware here is a replacement app, not a binary patch. The practical flow is:

1. Keep the full 4MB stock backup.
2. Build the custom app with ESP-IDF for `esp32c3`.
3. Flash the custom app or full image.
4. If it fails, restore the full backup.

The first version uses full refresh only. Partial update should wait until the
full path is verified on the actual panel.

## Verified Runtime Behavior

On the tested unit:

- USB flashing works through native ESP32-C3 USB Serial/JTAG.
- The custom protocol replies to `PING` with `PONG`.
- Test framebuffer upload returns `OK`.
- EPD `BUSY` polarity is low-while-busy, high-when-idle.
- Full refresh works through the custom UC8251D path.

## Claude Desktop Buddy Role

Quote0 has no physical buttons. Treat it as display-only:

- Claude/desktop agent sends state to a Raspberry Pi daemon.
- Pi renders a 152x296 monochrome framebuffer.
- Pi pushes the framebuffer over USB.
- Approval/deny input lives on Pi GPIO buttons, keyboard hotkeys, or a local web UI.

The included bridge is `tools/quote0_server.py`. It exposes:

- `GET /health`
- `POST /display/test`
- `POST /display/text`
- `POST /display/image`

Example:

```sh
python3 tools/quote0_server.py --host 0.0.0.0 --http-port 8787
curl -X POST http://127.0.0.1:8787/display/text \
  -H 'Content-Type: application/json' \
  --data '{"title":"Claude Buddy","body":"Waiting for permission"}'
```
