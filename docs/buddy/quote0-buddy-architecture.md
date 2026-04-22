# Quote0 Buddy Architecture

## Goal

Build a **Quote0 Buddy** around these constraints:

- **USB** is the primary display transport.
- **LED** provides simple attention cues.
- **External input** handles approval and denial first.
- **NFC** is optional until the live board proves it can generate useful events.
- **Wi-Fi support must remain part of the design**, even if USB is the first implementation path.

The right mental model is not "copy `claude-desktop-buddy` onto new hardware." The right model is "preserve the Buddy experience on top of Quote0's actual strengths."

## Design summary

The best-fit architecture is **USB-first, Wi-Fi-enabled, input-decoupled**.

That means:

1. a host-side daemon derives Buddy state from Claude or another local automation source
2. the host renders a low-refresh e-paper frame
3. the host pushes the frame to Quote0 over USB
4. the host or device drives a simple LED pattern for urgent states
5. approval input comes from external controls first, with NFC as an optional extension
6. Wi-Fi remains available for OTA, configuration, telemetry, and possible future fallback transport

## Why USB should be first

USB is already working in this repository.

The current project can:

- detect the device serial port automatically
- render text or images to a `152 x 296` 1-bit frame
- push the frame over native USB Serial/JTAG
- receive success or failure feedback from the device

That path is simple, deterministic, and local. It is also easier to debug than BLE or a full Wi-Fi data plane.

## Why Wi-Fi still matters

The stock firmware shows that the original product already had:

- Wi-Fi provisioning
- MQTT-backed content delivery
- OTA support
- sleep and wake behavior tied to online workflows

So even in a USB-first Buddy, Wi-Fi should not be treated as irrelevant. It gives the platform room to grow.

## Proposed system layers

## 1. Host-side Buddy daemon

The host daemon is the control plane.

It should be responsible for:

- collecting Claude session state
- tracking Buddy state transitions
- rendering e-paper frames
- pushing frames over USB
- driving external approval UI or hotkeys
- optionally listening for NFC-originated events from the device
- optionally exposing a local HTTP API for diagnostics and control

The current `tools/quote0_server.py` is already a useful starting point for the display-push layer.

## 2. Device-side Quote0 firmware

The device firmware should stay focused.

Its first responsibilities should be:

- receive frames over USB
- refresh the e-paper display
- expose a small LED control surface
- report simple local events if and when NFC or other input becomes real

Its later responsibilities may include:

- Wi-Fi provisioning
- OTA update checks
- health telemetry
- local config storage
- a network fallback path if USB is absent

## 3. External input adapter

Approvals should not depend on onboard buttons.

The input adapter can start with:

- keyboard hotkeys
- a small local web UI
- a command-line helper
- GPIO buttons on a host like a Raspberry Pi

If NFC becomes available, it can join this input layer rather than replace it.

## State model

Quote0 should use a small, durable Buddy state set:

- `sleep`
- `idle`
- `busy`
- `attention`
- `celebrate`
- optional one-shot `approved`
- optional one-shot `denied`

These states fit e-paper well because they do not require high frame rates.

## Display policy

The display path should optimize for clarity and panel life, not animation.

Recommended rules:

- refresh on state changes
- refresh on approval arrival
- refresh on approval resolution
- refresh periodically only when needed, such as a slow approval timer or Wi-Fi status change
- avoid high-frequency animation loops

The visual language should rely on:

- strong state labels
- one-line summary text
- tool name and hint for approvals
- sparse iconography
- high contrast

## LED policy

The LED can carry urgency even if it only supports on or off.

Suggested mapping:

- `sleep`: off
- `idle`: off
- `busy`: optional slow pulse
- `attention`: fast blink
- `approved`: two short flashes
- `denied`: three short flashes
- `error`: repeating warning pattern

The LED should not try to carry rich semantics. It should only answer one question well: **does the user need to look now?**

## Input model

## External input first

The safest approval path is still external.

For example:

- host hotkey: approve or deny current prompt
- local web UI: show current prompt and actions
- CLI tool: `buddy approve` or `buddy deny`

This works even if NFC turns out to be unavailable or inconvenient.

## NFC as an extension

If NFC is confirmed later, treat it as an event source.

Good mappings would be:

- `approve` tag or card
- `deny` tag or card
- optional `more info` tag

The device should not make approval decisions on its own. It should emit an event, and the host daemon should validate that event against the current prompt state.

## Protocol extension options

The current USB firmware only understands:

- `PING`
- `Q0IMG1 ...` plus raw frame bytes

A Buddy-oriented firmware should add a small control plane.

Two reasonable options exist.

### Option A: keep the raw frame path and add simple line commands

Examples:

```text
PING
LED OFF
LED ON
LED BLINK_SLOW
LED BLINK_FAST
STATUS
```

Possible event lines back from device:

```text
NFC <uid>
BTN <name>
EVENT <json>
```

This option is easy to debug and keeps the framebuffer path unchanged.

### Option B: add a separate JSON control channel

Examples:

```json
{"cmd":"led","mode":"attention"}
{"cmd":"status"}
{"evt":"nfc","uid":"04A1..."}
```

This is more extensible, but it adds parser complexity on the device.

### Recommended choice

Start with **Option A**. It is enough for LED control and basic device-to-host events. Keep JSON for a later stage if the control surface grows.

## Where Wi-Fi fits in a USB-first design

Wi-Fi should support the system without replacing USB too early.

## Good Wi-Fi roles in phase 1 and phase 2

- OTA update transport
- local configuration UI
- health telemetry
- remote diagnostics
- clock or time sync
- optional local network API for the Buddy daemon

## Wi-Fi roles that should wait

- making Wi-Fi the main framebuffer transport
- moving all approval state to a cloud dependency
- re-creating the stock MQTT product model before the local Buddy loop is stable

In other words, Wi-Fi is an accelerator and a fallback, not the first thing to rebuild.

## Recommended architecture statement

Use this as the project rule of thumb:

> Build Quote0 Buddy as a USB-first display appliance with a tiny device control plane, host-managed approvals, simple LED urgency cues, and Wi-Fi reserved for OTA, configuration, telemetry, and future fallback transport.
