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

## Custom USB Text Protocol

The custom firmware currently exposes:

```
Q0READY 152 296 1BPP rev=diag3                  # greeting, printed once at boot
PING                              -> PONG
STATUS | DIAG                     -> OK <diag string>
GPIO SNAP                         -> OK <diag string>
GPIO PWR|RST|DC|CS 0|1            -> OK <diag string>
Q0IMG1 152 296 1BPP 5624 <crc32>  -> OK|ERR <diag string>
<5624 raw framebuffer bytes>
```

The `<diag string>` has the stable shape:

```
stage=<last-stage> mode=<last-mode> busy=<level> err=<errno> [ms=<wait-ms>] bus=<0|1> pins=busy:N,pwr:N,rst:N,dc:N,cs:N
```

`ms=` is currently added for the final refresh wait path (`stage=done`,
`timeout-refresh-start`, `timeout-refresh-release`) so host-side debugging can
see whether the controller never entered BUSY or entered BUSY but never
released it.

`ERR` prefixes:

- `ERR bad-header` — no newline / junk on the wire
- `ERR unsupported-header` — recognised the framing but it is not a command
- `ERR short-frame` — fewer than 5624 bytes arrived
- `ERR crc` — payload CRC32 mismatch
- `ERR invalid-arg` / `ERR invalid-gpio` — argument validation
- `ERR epd-timeout <diag>` / `ERR epd <diag>` — hardware-level failure

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

On the tested unit, running the current custom firmware (`rev=diag3`):

- USB flashing works through native ESP32-C3 USB Serial/JTAG.
- On boot the firmware writes `Q0READY 152 296 1BPP rev=diag3\n` once.
- `PING` replies `PONG\n`.
- `STATUS` / `DIAG` replies with a single line containing the last EPD stage,
  last EPD result, and the live electrical level of every control pin, e.g.:

  ```
  OK stage=done mode=full busy=1 err=0 ms=1830 bus=1 pins=busy:1,pwr:1,rst:1,dc:0,cs:1
  ```

- `GPIO SNAP` re-reads the five EPD pins without driving them.
- `GPIO PWR|RST|DC|CS 0|1` drives one control line and returns an updated
  `STATUS` line.
- A full refresh completes in **~1.8 s** wall-clock (matches the stock
  firmware's `UC8251D: wait_busy: 等待 1160 ms` + power-on time).
- EPD `BUSY` polarity is low-while-busy, high-when-idle.  The Quote/0 panel
  does not externally pull BUSY; the driver configures the internal pull-up
  (`GPIO_PULLUP_ENABLE`) to get a reliable idle level.  See
  [white-screen-debug-journey.md](white-screen-debug-journey.md) for why this
  matters.
- Full refresh works through the custom UC8251D path with a white-border
  register of `0x97` (same as stock).
- `DTM1` (OLD data) must currently be sent as all-`0x00`. Using all-`0xFF`
  keeps the panel in a black/white oscillation and `BUSY` never releases,
  leading to `stage=timeout-refresh-release` after the physical flicker starts.

## Claude Desktop Buddy Role

Quote0 has no physical buttons. Treat it as display-only:

- Claude/desktop agent sends state to a Raspberry Pi daemon.
- Pi renders a 152x296 monochrome framebuffer.
- Pi pushes the framebuffer over USB.
- Approval/deny input lives on Pi GPIO buttons, keyboard hotkeys, or a local web UI.

The included middleware is `tools/quote0_server.py`. It exposes:

- `GET /health`
- `GET /capabilities`
- `POST /display/test`
- `POST /display/text`
- `POST /display/image`
- `POST /display/compose`

`/display/compose` is the new general-purpose endpoint. It accepts a JSON object
with optional `background`, `border`, `layout`, `threshold`, and an `elements[]`
array. Supported element types are:

- `text`
- `image`
- `rect`
- `line`

Example:

```sh
python3 tools/quote0_server.py --host 0.0.0.0 --http-port 8787 --invert
curl -X POST http://127.0.0.1:8787/display/compose \
  -H 'Content-Type: application/json' \
  --data '{
    "layout":"landscape-right",
    "background":"white",
    "border":true,
    "elements":[
      {"type":"text","x":12,"y":12,"w":150,"h":28,"text":"Claude Buddy","font_size":22},
      {"type":"text","x":12,"y":50,"w":170,"h":74,"text":"Waiting for permission.","font_size":15},
      {"type":"image","x":192,"y":16,"w":88,"h":88,"path":"./avatar.png","fit":"contain"}
    ]
  }'
```
