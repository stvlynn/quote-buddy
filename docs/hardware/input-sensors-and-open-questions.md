# Input, Sensors, and Open Questions

## Why this document exists

The connected device is easy to classify as an ESP32-C3 e-paper endpoint. It is much harder to classify its local input hardware. This document separates what we know from what we merely suspect.

## Physical buttons

### Current conclusion

**No physical buttons are currently assumed.**

### Why

- The current project notes already describe Quote0 as a device with no physical buttons.
- Stock-firmware strings did not reveal a strong, user-facing button UI model.
- The stock system appears to be driven mostly by remote content and power-state changes.

### Confidence

**Moderate.** This is operationally consistent, but we do not yet have a schematic or a board-level visual inspection logged here.

## IMU or motion sensor

### Current conclusion

**No IMU is confirmed.**

### Why

We did not find strong driver strings or common chip markers for an onboard motion sensor. In particular, the stock image did not show convincing traces of the sensor families we would expect in a motion-driven UI.

### Confidence

**Moderate to high** that there is no IMU in active use by the stock firmware.

## NFC

### Current conclusion

**NFC remains an open question.**

### Why

- The stock image contains one generic NDEF-related error string.
- We did **not** find obvious chip-family strings such as `PN532`, `ST25`, `RC522`, `NTAG`, or `FM11`.
- The user reports that the current device has NFC.

### Best interpretation today

There are several possible explanations:

1. NFC hardware exists, but the stock application barely uses it.
2. NFC hardware exists, but the implementation sits behind a library that leaves few identifying strings.
3. NFC belongs to a board revision or accessory path that is not visible from the current stock image.

### Confidence

**Low** as a stock-firmware claim. **Higher** as a working assumption for the current physical unit, because the user reported it directly.

## LED

### Current conclusion

**An LED is user-reported, but not stock-firmware-confirmed.**

### Why

The user reports a simple indicator LED that can only be on or off. So far, the stock firmware analysis has not tied that LED to a named subsystem or visible GPIO string.

### Confidence

**Moderate** for the live unit, **low** as a claim about the stock image.

## What we can claim safely

We can state these points without overstating the evidence:

- The device does not show strong evidence of a rich local-input design.
- The stock firmware behaves like a remote-driven display endpoint.
- Buttons and IMU are not part of the current working model.
- NFC and LED may exist on the live board, but they still need direct validation.

## Best next probes

The following checks would reduce uncertainty without requiring a full hardware teardown:

- restore the stock firmware and capture the boot log
- probe the stock `COMMON.*` command surface over USB
- inspect the PCB for any NFC front-end or antenna routing
- scan for active GPIO changes during visible LED behavior
- test whether NFC events can be observed from a live firmware build

Until those checks happen, treat NFC and LED as live-board capabilities, not as proven stock-firmware features.
