# Quote0 Hardware Documentation

This directory collects the hardware conclusions, reverse-engineering notes, and design implications we derived from two sources:

- static analysis of the stock `2.0.8` merged firmware image
- live USB inspection of the connected device

## Evidence levels

- **Confirmed**: backed by live USB behavior, repeated firmware strings, or both
- **Inferred**: strongly suggested by the firmware or the board behavior, but not proven directly
- **Open question**: plausible, reported, or partially hinted, but not confirmed yet

## Document index

- [`hardware-overview.md`](hardware-overview.md)
  - Executive summary of the device platform, with confidence levels.
- [`usb-findings.md`](usb-findings.md)
  - What the live unit exposes over USB, and what that tells us about the MCU and firmware path.
- [`stock-firmware-reverse-engineering.md`](stock-firmware-reverse-engineering.md)
  - Findings from the stock `2.0.8` image: partitions, command surface, backend model, and OTA behavior.
- [`display-and-power-subsystems.md`](display-and-power-subsystems.md)
  - E-paper, power, battery, VBUS, sleep, and thermal-management notes.
- [`input-sensors-and-open-questions.md`](input-sensors-and-open-questions.md)
  - What we can and cannot claim about buttons, IMU, NFC, and LED hardware.
- [`buddy-design-implications.md`](buddy-design-implications.md)
  - What the hardware profile means for a Claude Buddy-style adaptation.
- [`quote0_usb_firmware.md`](quote0_usb_firmware.md)
  - Notes on the custom USB firmware path used in this repository.

## Recommended reading order

If you are new to the project, read the files in this order:

1. `hardware-overview.md`
2. `usb-findings.md`
3. `stock-firmware-reverse-engineering.md`
4. `display-and-power-subsystems.md`
5. `input-sensors-and-open-questions.md`
6. `buddy-design-implications.md`

## Scope

These notes aim to describe the hardware as it appears today. They do not claim to be a full schematic, and they intentionally separate hard evidence from inference. Where a claim rests on a live probe, a firmware string, or a prior bring-up test, the relevant context is stated in the document.
