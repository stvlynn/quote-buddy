# Quote/0 Desktop

An Electron app that talks to a Quote/0 over its USB text protocol.  It does
four things:

1. Flash firmware — either the stock `2.0.8_merged_*.bin` or the custom
   app produced by `firmware/quote0-usb-epd/build/`.
2. Configure an **image** and push it to the panel.
3. Configure **text** (title + body + footer, sizes, border) and push it.
4. Configure a **compose** layout (JSON: text / image / rect / line) and
   push it.

All rendering happens in a browser Canvas in the renderer process; the
final 1-bpp framebuffer is packed client-side and sent via the `Q0IMG1`
protocol from the main process over a standard serial port.

## Prerequisites

- macOS or Linux (Windows should work but is not tested)
- Node.js 18+
- The custom firmware already built at least once so
  `firmware/quote0-usb-epd/build/` contains the three bin files.  This is
  what `firmware/flash_and_diag.sh` produces automatically.
- Flashing uses the repo-bundled `esptool.py` from
  `.deps/espressif-tools/python_env/idf5.5_py3.9_env/bin/`.  No separate
  Python install is required.

## Install and run

```sh
cd desktop
npm install
npm start
```

The first `npm install` downloads Electron (~200 MB) and the SerialPort
native module.  Subsequent starts are instant.

## Using it

### Pick the device

The top toolbar has a port dropdown.  Press `↻` to re-scan.  The app only
lists serial ports whose name or vendor ID looks like a Quote/0:

- macOS: `/dev/cu.usbmodemNNN`
- Linux: `/dev/ttyACM*` / `/dev/ttyUSB*`
- VID `303a` (Espressif native USB)

### Flash firmware

- **Flash stock…** opens a file picker (defaults to `.workspace/`) and
  flashes a merged `.bin` at offset `0x0`.  This restores the original
  Quote/0 behaviour for that unit.
- **Flash custom** writes the three binaries from
  `firmware/quote0-usb-epd/build/` at `0x0 / 0x8000 / 0x10000`.  The NVS
  partition is untouched, so panel ID and calibration survive.

Both flash paths stream esptool's stdout/stderr into the activity log on
the right.  Don't disconnect the device until "custom firmware flashed" or
"stock firmware flashed" appears.

### Push an image

1. Go to the **Image** tab.
2. Click *Choose file…* and pick any PNG/JPEG/etc.
3. Adjust **Fit** (contain / cover / stretch), **Threshold**, and optional
   **Floyd-Steinberg dither**.
4. The preview updates live.
5. *Send to Quote/0.*

### Configure text

1. Switch to the **Text** tab.
2. Type a title, a body (newlines preserved), and an optional footer.
3. Tune title / body font size and whether to draw a border.
4. *Send to Quote/0.*

### Compose (power-user mode)

1. Switch to the **Compose** tab.
2. *Load sample* for a starter layout, or paste your own JSON.
3. *Validate* parses the spec and reports the error if any.
4. Any valid edit redraws the preview automatically.
5. *Send to Quote/0.*

A compose spec is a JSON object:

```json
{
  "background": "white",          // "white" or "black"
  "border": true,                 // true/false or { inset, width }
  "elements": [
    { "type": "text",  "x": 12, "y": 12, "w": 200, "h": 28,
      "text": "Hello", "font_size": 22,
      "align": "left", "valign": "top", "padding": 2, "line_spacing": 4 },
    { "type": "rect",  "x": 0, "y": 148, "w": 296, "h": 4, "fill": "black" },
    { "type": "line",  "x1": 0, "y1": 30, "x2": 296, "y2": 30, "width": 1 }
  ]
}
```

Note: image elements in compose JSON are only rendered when they already
have an `imageEl` set (from a data URL loaded earlier in the renderer).
Arbitrary file-path images are not loaded from a compose spec because the
renderer can't read the filesystem directly; pick them through the Image
tab and send that instead.

### Layout rotations

The **Layout** select controls how logical content is rotated into the
panel's native 152 × 296 portrait orientation.

- `native` — draw in 152 × 296 portrait, upload as-is.
- `native-180` — 180° rotation.
- `landscape-right` — draw in 296 × 152 landscape (default), rotated 90°
  clockwise on the panel.  Matches `tools/quote0_send.py`'s default.
- `landscape-left` — opposite 90° rotation.

### Invert

On the tested Quote/0 unit the framebuffer must be inverted before upload
(see `docs/firmware/white-screen-debug-journey.md`).  The checkbox is on
by default.  Turn it off for the rare panel that doesn't need inversion.

## Where the files live

```
desktop/
├── package.json
├── main.js                Main process: window, IPC, serial IO, esptool.
├── preload.js             contextBridge → window.api.
└── src/
    ├── index.html
    ├── styles.css
    ├── canvas.js          Canvas rendering + 1-bit framebuffer packing.
    └── renderer.js        UI state, tabs, device calls.
```

No build step, no bundler.  All source is the source that runs.

## Troubleshooting

- **"No Quote/0 detected"** — the vendor/path filter hides noise.  Pull
  the device, re-insert, hit `↻`.  If it still doesn't appear, remove the
  filter in `main.js` (`serial:list` handler) and re-scan.
- **"custom firmware not built"** — run
  `firmware/flash_and_diag.sh --skip-flash` once to produce the three
  `build/*.bin` files.
- **Send returns `ERR epd-timeout …`** — the panel never reported BUSY
  idle.  This is almost always a wiring / pin-map issue; see
  `docs/firmware/white-screen-debug-journey.md` and
  `docs/methodology/epd-hardware-bringup-playbook.md`.
