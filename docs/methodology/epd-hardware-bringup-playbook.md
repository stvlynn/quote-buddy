# EPD hardware bring-up playbook

A general recipe for debugging an e-paper display that stays white even though
the firmware "succeeds".  Extracted from the Quote/0 white-screen debug, but
written so it applies to any ESP-IDF + UC8xxx / SSD16xx bring-up where:

- `ESP_LOGx` is either disabled or unreachable,
- the panel, ribbon and board are closed (no scope / LA on the EPD pins),
- you control both the firmware and a host-side USB tool.

See [`../firmware/white-screen-debug-journey.md`](../firmware/white-screen-debug-journey.md)
for the concrete case study these rules come from.

## The one meta-rule

> **A refresh that finishes faster than its physical minimum is not a refresh.**

For UC8251D / UC8151 on a 152×296 panel, the physical minimum for a full
refresh is ~1.5 s.  If your driver says `done` in 200 ms, the driver is lying
to itself — usually because `wait_idle` thinks the BUSY line is already HIGH.

Every other rule in this document is a way of either (a) forcing the driver
to stop lying, or (b) collecting enough side-channel data that you can catch
the lie.

## Principle 1 — Make the firmware reveal its state without relying on logs

On ESP32-C3 projects that keep USB Serial/JTAG as the host link, it is common
to set:

```
CONFIG_LOG_DEFAULT_LEVEL_NONE=y
CONFIG_ESP_CONSOLE_NONE=y
```

to save flash and stop `printf` from spamming the USB endpoint that the
application owns.  The consequence is that **none of your `ESP_LOGI` calls
are visible**, including the ones you added 30 seconds ago to debug.

Do not fight this by re-enabling logs (that often breaks the USB endpoint
you actually need).  Instead:

1. **Keep a `s_last_diag` string inside the driver** of the form
   `stage=<name> mode=<variant> busy=<level> err=<errno>`.  Update it at every
   interesting point — `power-cycle`, `wait-before-init`, `write-old`,
   `write-new`, `refresh`, `timeout-refresh`, `done`.
2. **Expose it over the USB protocol** as part of every reply, not as a
   separate debug channel.  On this project that means `OK <diag>` / `ERR
   epd-timeout <diag>`.
3. **Add a `STATUS` / `DIAG` text command** that replies with the same diag
   string plus live pin levels.  This turns "what is the device doing?" into
   a one-line host-side query.
4. **Put a revision tag in the greeting banner**, e.g.
   `Q0READY 152 296 1BPP rev=diag3`.  Without this you cannot tell whether
   your last flash actually took effect.

None of these require a working display.  All four were possible on the
Quote/0 from the very first boot.

## Principle 2 — `GPIO_MODE_OUTPUT` readbacks lie; use `GPIO_MODE_INPUT_OUTPUT`

On ESP32-C3 (and most Espressif parts), `GPIO_MODE_OUTPUT` disables the input
buffer.  `gpio_get_level()` on such a pin always reads `0` no matter what the
pad is actually driving.

If you are building a diagnostic surface that reports pin levels back to the
host, use **`GPIO_MODE_INPUT_OUTPUT`** for any pin you want to be able to
read back.  On Quote/0, skipping this step produced a 30-minute detour
convinced that PWR/RST/DC/CS were "all dead".

```c
gpio_config_t outputs = {
    .pin_bit_mask = /* ... */,
    .mode = GPIO_MODE_INPUT_OUTPUT,   // not GPIO_MODE_OUTPUT
    .pull_up_en  = GPIO_PULLUP_DISABLE,
    .pull_down_en = GPIO_PULLDOWN_DISABLE,
    .intr_type   = GPIO_INTR_DISABLE,
};
```

## Principle 3 — Suspect the BUSY line first

The BUSY line is the single point where "driver lies to itself" becomes
indistinguishable from "panel is dead".  Every EPD full-refresh driver
ultimately looks like:

```
send commands → send frame data → issue 0x12 → wait for BUSY edge → done
```

If the BUSY edge never happens electrically but the wait loop *returns
`true` anyway*, the driver reports `done err=0` and the host happily sends
the next frame.  The user sees a white screen.

The Quote/0 PCB does not externally pull the BUSY line.  Without an internal
pull-up, the floating input reads `1` (idle), so `wait_idle_level()` returns
on the first iteration.  The fix is a single line:

```c
gpio_config_t busy = {
    .pin_bit_mask = (1ULL << PIN_BUSY),
    .mode         = GPIO_MODE_INPUT,
    .pull_up_en   = GPIO_PULLUP_ENABLE,    // was DISABLE
    .pull_down_en = GPIO_PULLDOWN_DISABLE,
    .intr_type    = GPIO_INTR_DISABLE,
};
```

Routine checks for any new EPD bring-up:

- Does the BUSY GPIO have an external pull on the schematic? If not, enable
  the MCU internal pull-up.
- Does a "successful" refresh take at least the datasheet's minimum time?
  If your elapsed time is ≥ 5× faster than the datasheet, BUSY is wrong.
- Does BUSY change state during a refresh? Sample it from the host with
  `STATUS` right before, during (mid-refresh from a second task), and after.

## Principle 4 — Sanity-check pin drivability before panel commands

Before trusting a new pin map, prove every output pin is actually drivable.
Do this *before* any EPD init code runs.

On Quote/0 the proof was a sequence of protocol commands:

```
$ PING
PONG
$ GPIO PWR 1 ; STATUS
... pins=busy:1,pwr:1,rst:1,dc:0,cs:1
$ GPIO PWR 0 ; STATUS
... pins=busy:0,pwr:0,...
$ GPIO RST 0 ; STATUS    $ GPIO RST 1 ; STATUS
$ GPIO DC 1  ; STATUS    $ GPIO DC 0  ; STATUS
$ GPIO CS 0  ; STATUS    $ GPIO CS 1  ; STATUS
```

If any pin's readback does not follow the command, either the pin number is
wrong, the pin is strapping/reserved on this chip, or (as Principle 2 warns)
you are using `GPIO_MODE_OUTPUT` and reading your own mode bug.

For ESP32-C3, avoid driving GPIO 2, 8, 9 (strapping), 12–17 (flash),
18, 19 (USB D-/D+).  A `safe_pin()` helper that refuses these is cheap
insurance.

## Principle 5 — Measure wall-clock refresh time, not just the reply

Host-side measurement is the single most load-bearing diagnostic:

```python
t0 = time.time()
send_frame(port, frame)
reply = read_line(port, timeout=60.0)
dt = time.time() - t0
```

Record `dt` alongside the firmware's `OK/ERR <diag>`.

Interpretation:

| Observed `dt` | Panel datasheet min | Diagnosis |
| --- | --- | --- |
| ≥ 1.5 s | ~1.5 s | BUSY is real; pixels should move |
| 300 ms – 1 s | ~1.5 s | BUSY never went LOW; wait is fake |
| 0 – 100 ms | anything | You are not reaching `refresh` at all; watch `stage=` to locate the exit |

The Quote/0 debugging split the case into two halves exactly on this number:
0.6 s ⇒ fake BUSY; 1.8 s ⇒ real refresh.

## Principle 6 — Keep the stock image as a known-good baseline

If the panel even *might* be at fault, you need a second firmware that is
known to work on the same hardware.  Keep the vendor's merged image archived
somewhere (in this repo it is `.workspace/2.0.8_merged_*.bin`).

When stuck:

1. Flash the stock image.
2. Capture 15–30 s of serial output on boot.
3. Read the stock firmware's own log for ground-truth values: controller
   model, resolution, border register, BUSY wait time.
4. Only now decide whether the custom firmware disagrees with the panel or
   with itself.

Stock-image reverse engineering has its own playbook in
[`stock-image-reverse-engineering-playbook.md`](stock-image-reverse-engineering-playbook.md).

## Principle 7 — Keep the diagnostic surface after shipping

It is tempting to delete `STATUS` / `GPIO SNAP` / revision banners once the
product works.  Do not.

The diagnostic surface is the only thing that turns the next white-screen
bug report into a 30-minute fix instead of a one-week dive.  Cost on
Quote/0: ~100 lines of C, ~5 KiB of flash.

Keep in the final firmware:

- a revision tag in the greeting banner;
- a `STATUS` text command that returns `stage/mode/busy/err/pins` in one
  line;
- per-stage `epd_set_diag()` calls throughout the refresh path;
- `GPIO PIN 0|1` + `GPIO SNAP` for reading/writing each EPD control line;
- a one-shot host script (`firmware/flash_and_diag.sh`) that performs the
  full sanity loop.

## Quick-reference decision tree

```
Screen stays white
│
├── Does STATUS reply at all?
│   └── No → USB/protocol path is broken, not EPD.
│
├── Does a refresh take ≥ ~1.5 s wall-clock?
│   ├── Yes → BUSY is real.
│   │   ├── Did any pixels move? → framebuffer polarity or init sequence
│   │   └── No pixels → suspect panel cable / power rail / battery
│   └── No → BUSY is fake.
│       ├── Is the BUSY GPIO pulled? add PULLUP_ENABLE.
│       ├── Is the pin number right? cross-check with stock log.
│       └── Is the refresh even reaching `0x12`? check stage= values.
│
├── Are GPIO pins actually drivable (GPIO PIN 0|1 + GPIO SNAP)?
│   ├── No → either wrong pin or GPIO_MODE_OUTPUT (use INPUT_OUTPUT).
│   └── Yes → pin map is plausible.
│
└── When in doubt → flash stock, capture boot log, read ground-truth values.
```
