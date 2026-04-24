# Quote/0 Desktop

An Electron app that talks to a Quote/0 over its USB text protocol. It
does four things:

1. Flash firmware — either the stock `2.0.8_merged_*.bin` or the custom
   app produced by `firmware/quote0-usb-epd/build/`.
2. Configure an **image** and push it to the panel.
3. Configure **text** (title + body + footer, sizes, border) and push it.
4. Configure a **compose** layout (visual editor: text / image / rect /
   line elements) and push it.

The renderer is a **Next.js 15 + TypeScript + Tailwind** app statically
exported at build time, then loaded inside Electron via a custom
`app://` protocol.  All framebuffer rendering happens in a browser
Canvas in the renderer process; the final 1-bpp framebuffer is packed
client-side and sent via the `Q0IMG1` protocol from the main process
over a standard serial port.

## Prerequisites

- macOS or Linux (Windows should work but is not tested)
- Node.js 18+
- The custom firmware already built at least once so
  `firmware/quote0-usb-epd/build/` contains the three bin files.  This
  is what `firmware/flash_and_diag.sh` produces automatically.
- Flashing uses the repo-bundled `esptool.py` from
  `.deps/espressif-tools/python_env/idf5.5_py3.9_env/bin/`.  No separate
  Python install is required.

## Install and run

```sh
cd desktop
npm install
npm run dev        # Next.js dev server + Electron with live reload
```

Or, for a production build:

```sh
npm start          # next build (static export) + electron
```

The first `npm install` pulls Electron (~200 MB), the SerialPort native
module, Next.js, React, Tailwind, and Lucide icons.  Subsequent starts
are fast.

## Scripts

| Script                    | What it does                                      |
| ------------------------- | ------------------------------------------------- |
| `npm run dev`             | Next dev server + Electron with hot reload        |
| `npm run build`           | Static export to `desktop/out/`                   |
| `npm start`               | `build` then launch Electron against the export   |
| `npm run typecheck`       | `tsc --noEmit` over `renderer/`                   |
| `npm run package:mac-arm64` | Build + electron-packager for macOS arm64       |
| `npm run package:mac-x64`   | Build + electron-packager for macOS x64         |
| `npm run package:linux`     | Build + electron-packager for Linux x64         |

## Keyboard shortcuts

- `⌘R` / `Ctrl+R` — rescan serial ports
- `⌘↵` / `Ctrl+Enter` — send the current frame
- Click the framebuffer hash chip below the preview to copy it

## Using it

### Pick the device

The top toolbar has a port dropdown.  Press the refresh icon to re-scan.
Only serial ports whose name or vendor ID looks like a Quote/0 are
listed:

- macOS: `/dev/cu.usbmodemNNN`
- Linux: `/dev/ttyACM*` / `/dev/ttyUSB*`
- VID `303a` (Espressif native USB)

The pill next to the port dropdown shows the live connection state:
`No device` / `Ready` / `Sending` / `Flashing` / `… failed`.

### Flash firmware

- **Flash stock…** opens a file picker (defaults to `.workspace/`) and
  flashes a merged `.bin` at offset `0x0`.  This restores the original
  Quote/0 behaviour for that unit.
- **Flash custom** writes the three binaries from
  `firmware/quote0-usb-epd/build/` at `0x0 / 0x8000 / 0x10000`.  The NVS
  partition is untouched, so panel ID and calibration survive.

Both flash paths stream esptool's stdout/stderr into the activity log on
the right.  Don't disconnect the device until "custom firmware flashed"
or "stock firmware flashed" appears.

### Push an image

1. Go to the **Image** tab.
2. Click *Choose file…* and pick any PNG/JPEG/etc.
3. Adjust **Fit** (contain / cover / stretch), **Threshold**, and
   optional **Floyd-Steinberg dither**.
4. The preview updates live.
5. *Send to Quote/0* (or press `⌘↵`).

### Configure text

1. Switch to the **Text** tab.
2. Type a title, a body (newlines preserved), and an optional footer.
3. Tune title / body font size and whether to draw a border.
4. *Send to Quote/0*.

### Compose (visual layout editor)

1. Switch to the **Compose** tab.
2. The elements list shows every draw operation as a collapsible card.
   Press the **＋** button to add a `Text`, `Rectangle`, `Line`, or
   `Image` element.
3. Each card exposes the relevant fields (coordinates, size, font,
   alignment, color, fit, threshold, …) — no JSON editing required.
4. Use the icon actions on each card to move it up / down, duplicate
   it, or delete it.
5. The two top-level switches control the canvas background and outer
   border.
6. For images, first pick a source file in the **Image** tab — the
   compose `Image` element reuses that source.
7. **Load sample** populates the list with a working example.  The
   collapsed **Show JSON** panel at the bottom lets advanced users
   import / export / copy the raw spec.
8. *Send to Quote/0* (or `⌘↵`) uploads the composed frame.

A compose spec is a JSON object — the visual editor produces exactly
this shape, and the **Show JSON** panel can import or export it:

```json
{
  "background": "white",
  "border": true,
  "elements": [
    { "type": "text",  "x": 12, "y": 12, "w": 200, "h": 28,
      "text": "Hello", "font_size": 22,
      "align": "left", "valign": "top", "padding": 2, "line_spacing": 4 },
    { "type": "rect",  "x": 0, "y": 148, "w": 296, "h": 4, "fill": "black" },
    { "type": "line",  "x1": 0, "y1": 30, "x2": 296, "y2": 30, "width": 1 }
  ]
}
```

Image elements in compose JSON reuse the currently-loaded source image
from the **Image** tab.  Arbitrary file-path images are not loaded from
a compose spec because the renderer can't read the filesystem directly;
pick them through the Image tab and the compose `Image` element will
use them automatically.

### Layout rotations

The **Layout** select controls how logical content is rotated into the
panel's native 152 × 296 portrait orientation.

- `native` — draw in 152 × 296 portrait, upload as-is.
- `native-180` — 180° rotation.
- `landscape-right` — draw in 296 × 152 landscape (default), rotated
  90° clockwise on the panel.  Matches `tools/quote0_send.py`'s
  default.
- `landscape-left` — opposite 90° rotation.

### Invert

On the tested Quote/0 unit the framebuffer must be inverted before
upload (see `docs/firmware/white-screen-debug-journey.md`).  The
checkbox is on by default.  Turn it off for the rare panel that doesn't
need inversion.

## Source layout

```
desktop/
├── main.js              Electron main process: window, IPC, serial IO, esptool.
├── preload.js           contextBridge → window.api.
├── package.json         npm scripts: dev / build / package:*
├── renderer/            Next.js App Router project
│   ├── next.config.mjs  output: 'export', distDir: '../out'
│   ├── tailwind.config.mjs
│   ├── tsconfig.json
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              main window
│   │   └── globals.css           Tailwind + design tokens
│   ├── components/
│   │   ├── Toolbar.tsx
│   │   ├── Tabs.tsx
│   │   ├── PreviewPanel.tsx
│   │   ├── StatusPanel.tsx
│   │   ├── tabs/{Image,Text,Compose}Tab.tsx
│   │   ├── compose/              element cards + editors
│   │   └── ui/                   Button, IconButton, Segmented, StatePill, fields
│   ├── hooks/{useDevice,useLog}.ts
│   └── lib/{types,api,canvas,compose}.ts
└── out/                 Next.js static export (loaded by Electron via app://).
```

All icons come from [Lucide](https://lucide.dev) via `lucide-react` —
no hard-coded inline SVGs.

## Troubleshooting

- **"No Quote/0 detected"** — the vendor/path filter hides noise.  Pull
  the device, re-insert, hit refresh.  If it still doesn't appear,
  remove the filter in `main.js` (`serial:list` handler) and re-scan.
- **"custom firmware not built"** — run
  `firmware/flash_and_diag.sh --skip-flash` once to produce the three
  `build/*.bin` files.
- **Send returns `ERR epd-timeout …`** — the panel never reported BUSY
  idle.  This is almost always a wiring / pin-map issue; see
  `docs/firmware/white-screen-debug-journey.md` and
  `docs/methodology/epd-hardware-bringup-playbook.md`.
