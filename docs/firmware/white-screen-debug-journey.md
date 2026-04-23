# Quote/0 white-screen debug journey

This document is a post-mortem of a multi-session debugging effort that ended
with the custom USB firmware driving the panel correctly.  It is written so
that **anyone picking up a new Quote/0 unit with white-screen symptoms can
reproduce the diagnosis in under 30 minutes**, instead of re-deriving it.

## TL;DR

- The stock firmware was always fine.  The custom firmware had one real bug.
- The e-paper BUSY line (GPIO 3) has **no external pull-up** on the PCB.  With
  `GPIO_PULLUP_DISABLE` the `INPUT` floats, reads `1`, and every `wait_idle`
  loop returns immediately.  The UC8251D init code appeared to succeed in
  ~620 ms while a real full refresh takes ~1.8 s, so the refresh never
  actually happened electrically.
- Fix is a one-liner:
  ```c
  /* epd_init_bus() — BUSY configuration */
  .pull_up_en  = GPIO_PULLUP_ENABLE,   // was GPIO_PULLUP_DISABLE
  ```
- Everything else in the repo pin map was already correct.

## Confirmed live-unit facts (after debugging)

| Thing | Value | How confirmed |
| --- | --- | --- |
| MCU | ESP32-C3 v0.4, MAC `9c:9e:6e:38:56:d8` | esptool handshake |
| Native USB Serial/JTAG | `VID:PID 303a:1001` | lsusb / macOS `/dev/cu.usbmodem101` |
| Display controller | **UC8251D**, revision `0x0A` | Stock firmware boot log: `EPD_DETECT: IC型号: UC8251D, Revision: 0x0A (缓存)` |
| Panel resolution | 152 × 296, 1 bpp (5624 B frame) | Stock log + working custom refresh |
| Border register | `0x97` (white border) | Stock log: `border_reg=0x97`, matches `0x50 0x97` in our init |
| Full refresh timing | ~1.8 s total (~1.16 s is `wait_busy`) | Stock log + 1.83 s measured on custom firmware |
| BUSY polarity | **LOW while busy, HIGH when idle** | Matches both UC8251D datasheet and stock `wait_busy: 等待 1160 ms` |
| BUSY external pull | **None** — MCU internal pull-up is required | Fix-it bisection (see below) |
| PWR pin (GPIO 20) polarity | Active-high (drives panel power rail) | Stock `UC8251D: Power On 完成` appears after PWR asserted |
| Framebuffer polarity | Host sends `1=white`; driver inverts before SPI | `README.md` note; verified with black/white/checker |

### Pin map (unchanged from repo README)

```
SCLK=10   MOSI=7   CS=6   DC=5   RST=4   BUSY=3   PWR=20
```

All four output pins (`PWR/RST/DC/CS`) are declared `GPIO_MODE_INPUT_OUTPUT`
on purpose: that keeps the input buffer enabled so `gpio_get_level()` reports
the *real* output state, which powers the `STATUS` / `GPIO SNAP` commands.
Using `GPIO_MODE_OUTPUT` makes every readback return `0` regardless of the
driven level and was an early red herring in this investigation.

## The symptoms

- Flashing the custom firmware produced a **completely white panel**.
- Host-side `quote0_send.py` reported `OK` for every frame.
- Toggling the host-side `--invert` flag changed nothing.
- Sweeping 4 combinations of `{invert, pwr_active_high}` at boot changed
  nothing.
- The panel never flashed, never greyed, never showed a single pixel change.
- Unplug / replug: charge LED blinks (so USB power path works), screen still
  white.

## What blocked progress

Two different dead ends ate most of the debugging time:

1. **`ESP_LOGx` was disabled globally** by `sdkconfig.defaults`:
   ```
   CONFIG_LOG_DEFAULT_LEVEL_NONE=y
   CONFIG_ESP_CONSOLE_NONE=y
   ```
   Nothing the firmware logged was visible.  Every "stage X passed"
   signal had to be invented from scratch.
2. **`GPIO_MODE_OUTPUT` readbacks always read 0** on ESP32-C3 because the
   input buffer is disabled in that mode.  This made it look like none of
   the control pins worked, which led to a pin-map witch hunt.  Switching
   to `GPIO_MODE_INPUT_OUTPUT` made the readbacks match reality and
   eliminated that entire branch.

## Diagnostic infrastructure added along the way (kept)

These were essential to crack the problem and should be kept, not reverted:

- **`rev=diag3` banner** in `Q0READY 152 296 1BPP rev=diag3` — proves what
  firmware the device is actually running, independent of any flash log.
- **`s_last_diag` string inside `epd_uc8251d.c`** — every important stage
  in `epd_refresh()` writes `stage=<name> mode=full busy=<lvl> err=<code>`
  so a single USB text read can tell you where a refresh gave up.
- **Protocol commands over USB text line**:
  - `PING` → `PONG` (transport sanity)
  - `STATUS` / `DIAG` → `OK stage=... mode=... busy=... err=... bus=1 pins=busy:1,pwr:1,rst:1,dc:0,cs:1`
  - `GPIO SNAP` → live read of the five EPD pins without touching them
  - `GPIO PWR|RST|DC|CS 0|1` → drive one line and snapshot state
- **`firmware/flash_and_diag.sh`** — one command to build, flash, and run
  the canonical sanity sequence.

## The decisive experiments (in order)

Each of these took under a minute and eliminated a large hypothesis.

### 1. USB path is alive

```
$ PING
PONG
$ STATUS
OK stage=done mode=... busy=1 err=0 bus=1 pins=...
```

Confirms: protocol task runs, EPD driver got initialised, no crash.  Eliminates
"firmware didn't boot" and "USB Serial/JTAG is broken".

### 2. Every control pin is really controllable

```
$ GPIO PWR 1 ; STATUS
... pins=busy:1,pwr:1,rst:1,dc:0,cs:1
$ GPIO PWR 0 ; STATUS
... pins=busy:0,pwr:0,...
$ GPIO RST 0 ; STATUS
... pins=...,rst:0,...
(etc. for DC, CS)
```

Every pin toggles as commanded once the output pins are declared
`GPIO_MODE_INPUT_OUTPUT`.  Eliminates "wrong GPIO numbers" for PWR/RST/DC/CS.

### 3. Timing gap exposes fake BUSY

Measure wall-clock time of one EPDTEST refresh:

```
>> EPDTEST checker-8251-ah-raw
OK stage=done ...
elapsed: 0.623 s
```

Datasheet / stock log says UC8251D 152×296 full refresh is physically ~1.8 s.
Our driver finished in 623 ms → the driver never actually waited for the
panel.  Combined with `busy=1` in `STATUS` regardless of whether the refresh
"happened", this localises the problem to the BUSY line being misread.

### 4. Stock firmware baseline

Re-flash the full stock `2.0.8_merged_...bin` (kept in `.workspace/` for
exactly this purpose).  Panel boots to the welcome screen with Wi-Fi icon.
Serial log shows:

```
I (215) EPD_DETECT: IC型号: UC8251D, Revision: 0x0A (缓存)
I (265) UC8251D: 初始化UC8251D (152x296), border_reg=0x97
I (265) SPI: 初始化GPIO和SPI (4线模式)...
I (275) SPI: 初始化完成 (4线SPI, 速度=15000000Hz)
I (415) UC8251D: Power On 完成
I (585) UC8251D: Power On 完成
I (585) UC8251D: 初始化完成
...
I (2145) UC8251D: wait_busy: 等待 1160 ms
I (2145) UC8251D: 刷新完成
```

Conclusions from this single log:

- **Hardware is 100% fine** — panel, ribbon, VCOM, battery, all good.
- **Controller is UC8251D**, not UC8151.
- **Real `wait_busy` is 1160 ms** — our 623 ms reading must be fake.
- The panel ID is stored in NVS (`ns=01 ic_type=2 ic_rev=10`) — our custom
  firmware preserves that NVS region because its partition table uses the
  same `0x9000 / 0x6000` layout as stock.

### 5. One-line fix

Add the internal pull-up:

```diff
 gpio_config_t busy = {
     .pin_bit_mask = (1ULL << Q0_EPD_PIN_BUSY),
     .mode = GPIO_MODE_INPUT,
-    .pull_up_en = GPIO_PULLUP_DISABLE,
+    .pull_up_en = GPIO_PULLUP_ENABLE,
     ...
 };
```

Re-flash, re-measure:

```
>> EPDTEST checker-8251-ah-raw
elapsed: 1.825 s    ← now matches physical timing
```

Panel visibly flashes (black → pattern → black → pattern ...) as expected.

## Reproducing the diagnosis on a new unit

If the custom firmware ships and then refuses to draw on some other Quote/0,
run exactly this sequence:

```sh
# Compile + flash + canonical sanity commands
firmware/flash_and_diag.sh --port /dev/cu.usbmodemXXXX
```

Expected output on a healthy unit:

```
Q0READY 152 296 1BPP rev=diag3
PONG
OK stage=done mode=full busy=1 err=0 bus=1 pins=busy:1,pwr:1,rst:1,dc:0,cs:1
```

If `elapsed` on a framebuffer upload is significantly below ~1.6 s, BUSY is
not being waited on — first check `epd_init_bus()`'s BUSY pull configuration,
then the physical BUSY GPIO number.

If `STATUS` never comes back, fall back to **flashing the stock image** from
`.workspace/2.0.8_merged_...bin` to confirm the hardware is alive:

```sh
python3 .deps/espressif-tools/python_env/idf5.5_py3.9_env/bin/esptool.py \
    --chip esp32c3 --port /dev/cu.usbmodemXXXX --baud 460800 \
    write_flash 0x0 .workspace/2.0.8_merged_3a6e3f3a31dc64da2a0359667af8b566c360b4c589854c7248f793c1370a7718.bin
```

If stock boots and shows the welcome screen, the hardware is fine and the
problem is entirely in the custom firmware.
