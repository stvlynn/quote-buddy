# Quote0 Buddy Roadmap

## Purpose

This document turns the current hardware findings into an implementation sequence. The main constraint is clear: **deliver a useful Buddy quickly without overcommitting to unverified local hardware.**

## Phase 0: lock the working assumptions

Before writing more code, keep these assumptions explicit:

- the panel path works over USB today
- the board supports Wi-Fi at the platform level
- LED is likely available on the live unit, but not yet tied to a known GPIO in this repository
- NFC may exist, but is not yet proven as an event source
- approval must work even if NFC never lands

## Phase 1: USB display-first Buddy

### Goal

Ship a reliable Buddy that can show Claude state on the e-paper display.

### Work items

- define a host-side Buddy state model
- render Quote0-friendly state cards
- drive the existing USB framebuffer path from a daemon
- add approval overlays for pending prompts
- keep all approval input outside the device for now

### Output

At the end of phase 1, the system should be able to:

- show `sleep`, `idle`, `busy`, `attention`, and `celebrate`
- show tool approval prompts
- confirm approval and denial visually
- operate without any device-local input hardware

## Phase 2: LED attention cues

### Goal

Add urgent attention signaling without changing the main display architecture.

### Work items

- identify the live LED GPIO
- extend device firmware with LED control commands
- define a small host API for LED patterns
- map Buddy states to LED behavior

### Output

At the end of phase 2, urgent prompts should be visible even when the user is not looking directly at the display.

## Phase 3: external input hardening

### Goal

Make approvals convenient and robust before adding NFC complexity.

### Work items

- add host hotkeys or a tiny local web UI
- expose current prompt state to that UI
- validate prompt IDs before sending approve or deny
- add a minimal command-line fallback

### Output

At the end of phase 3, approvals should feel complete even if the device remains display-only.

## Phase 4: NFC research and integration

### Goal

Use NFC only if it proves useful and stable on the live board.

### Work items

- confirm the NFC hardware path on the physical board
- determine whether the device can read tags, emulate tags, or both
- define an event format from device to host
- map a small set of NFC actions to Buddy controls
- keep host-side prompt validation in place

### Output

At the end of phase 4, NFC should behave as an optional convenience input, not as the only approval path.

## Phase 5: Wi-Fi support in the Buddy stack

### Goal

Use Wi-Fi for resilience and maintenance, not as a premature replacement for USB.

### Good Wi-Fi deliverables

- OTA update mechanism for the Buddy firmware
- local config or diagnostics page
- device health reporting
- optional fallback transport when USB is absent
- optional local network API for monitoring or management

### What to avoid too early

- rebuilding the original cloud product model first
- pushing the framebuffer over Wi-Fi before the USB loop is stable
- making Buddy behavior depend on internet availability

### Output

At the end of phase 5, the project should still be USB-first in normal use, but Wi-Fi should add operational value.

## Phase 6: optional network fallback mode

### Goal

Allow Quote0 to keep functioning when USB is unavailable.

### Possible approaches

- host daemon publishes state over local Wi-Fi to the device
- device exposes a local HTTP endpoint for frame or state updates
- device polls a small local server for state cards

### Caution

This phase should begin only after the USB Buddy path is stable, because it introduces provisioning, reconnection, and security complexity.

## Firmware extension priorities

If firmware work starts now, build features in this order:

1. LED control commands
2. a minimal status command
3. local event reporting hooks
4. NFC event reporting, if hardware is real
5. Wi-Fi configuration and OTA support
6. optional network fallback transport

## Host-side software priorities

If host-side software starts now, build features in this order:

1. state derivation
2. e-paper card rendering
3. USB frame push orchestration
4. approval UI and hotkeys
5. LED command integration
6. NFC event handling
7. Wi-Fi diagnostics and management

## Decision rule

When trade-offs appear, follow this rule:

> Prefer the smallest change that improves the local Buddy loop today. Use Wi-Fi to extend the system, not to complicate the first working version.

## Current recommendation

The next concrete engineering step should be:

1. create a host-side Buddy daemon on top of the existing USB display path
2. define a small LED command extension for the device firmware
3. keep approvals external at first
4. investigate NFC in parallel
5. reserve Wi-Fi for OTA, diagnostics, and later fallback mode
