# Quote0 Hardware Documentation

This directory collects the hardware conclusions, reverse-engineering notes, and Buddy design implications we derived from two sources:

- static analysis of the stock `2.0.8` merged firmware image
- live USB inspection of the connected device

## Evidence levels

- **Confirmed**: backed by live USB behavior, repeated firmware strings, or both
- **Inferred**: strongly suggested by the firmware or the board behavior, but not proven directly
- **Open question**: plausible, reported, or partially hinted, but not confirmed yet

## Directory layout

- [`hardware/`](hardware)
  - Core hardware findings and subsystem-level notes.
- [`reverse-engineering/`](reverse-engineering)
  - Findings extracted from the stock firmware image and protocol surface.
- [`buddy/`](buddy)
  - Claude Buddy adaptation notes, architecture, and implementation roadmap.
- [`firmware/`](firmware)
  - Notes specific to the custom USB firmware path used in this repository.

## Document index

### `hardware/`

- [`hardware/hardware-overview.md`](hardware/hardware-overview.md)
  - Executive summary of the device platform, with confidence levels.
- [`hardware/usb-findings.md`](hardware/usb-findings.md)
  - What the live unit exposes over USB, and what that tells us about the MCU and firmware path.
- [`hardware/display-and-power-subsystems.md`](hardware/display-and-power-subsystems.md)
  - E-paper, power, battery, VBUS, sleep, and thermal-management notes.
- [`hardware/input-sensors-and-open-questions.md`](hardware/input-sensors-and-open-questions.md)
  - What we can and cannot claim about buttons, IMU, NFC, and LED hardware.

### `reverse-engineering/`

- [`reverse-engineering/stock-firmware-reverse-engineering.md`](reverse-engineering/stock-firmware-reverse-engineering.md)
  - Findings from the stock `2.0.8` image: partitions, command surface, backend model, and OTA behavior.

### `buddy/`

- [`buddy/buddy-design-implications.md`](buddy/buddy-design-implications.md)
  - What the hardware profile means for a Claude Buddy-style adaptation.
- [`buddy/quote0-buddy-architecture.md`](buddy/quote0-buddy-architecture.md)
  - A USB-first, Wi-Fi-enabled Buddy architecture for Quote0, including LED and external-input roles.
- [`buddy/quote0-buddy-roadmap.md`](buddy/quote0-buddy-roadmap.md)
  - A phased implementation plan for Buddy on Quote0, with Wi-Fi kept in scope.

### `firmware/`

- [`firmware/quote0_usb_firmware.md`](firmware/quote0_usb_firmware.md)
  - Notes on the custom USB firmware path used in this repository.

## Recommended reading order

If you are new to the project, read the files in this order:

1. `hardware/hardware-overview.md`
2. `hardware/usb-findings.md`
3. `reverse-engineering/stock-firmware-reverse-engineering.md`
4. `hardware/display-and-power-subsystems.md`
5. `hardware/input-sensors-and-open-questions.md`
6. `buddy/buddy-design-implications.md`
7. `buddy/quote0-buddy-architecture.md`
8. `buddy/quote0-buddy-roadmap.md`
9. `firmware/quote0_usb_firmware.md`

## Scope

These notes aim to describe the hardware as it appears today. They do not claim to be a full schematic, and they intentionally separate hard evidence from inference. Where a claim rests on a live probe, a firmware string, or a prior bring-up test, the relevant context is stated in the document.
