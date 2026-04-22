# Stock Firmware Reverse-Engineering Notes

## Scope

This document summarizes what the stock `2.0.8` merged firmware image tells us about the device architecture. The goal is not to reconstruct the entire application. The goal is to extract hardware-relevant facts and the system model behind them.

## Firmware identity

The stock image contains strings that identify it as an **ESP-IDF-based ESP32-C3 build**. It also matches the product naming seen elsewhere in the repository and in live testing.

## Flash layout

Earlier analysis in this repository recovered the stock layout as:

- bootloader at `0x0000`
- partition table at `0x8000`
- `nvs` at `0x9000`, size `0x4000`
- `otadata` at `0xD000`, size `0x2000`
- `phy_init` at `0xF000`, size `0x1000`
- `ota_0` at `0x10000`, size `0x1F0000`
- `ota_1` at `0x200000`, size `0x1F0000`

This is a standard dual-OTA ESP-IDF layout. It strongly suggests that the device was designed for field updates from the start.

## Command surface exposed by the stock image

The stock image contains a visible `COMMON.*` command namespace, including:

- `COMMON.GET_STATUS`
- `COMMON.CHECK_POINT`
- `COMMON.FETCH_CONTENT`
- `COMMON.SET_NETWORK`
- `COMMON.RESET_NETWORK`
- `COMMON.USER_SLEEP`
- `COMMON.REBOOT`
- `COMMON.RESET_ALL`
- `COMMON.RESTORED`
- `COMMON.SHOW_MAC_QRCODE`
- `COMMON.DISABLE_SLEEP`
- `COMMON.ENABLE_SLEEP`
- `COMMON.BLE_IMAGE_ON`
- `COMMON.BLE_IMAGE_OFF`
- `COMMON.LOCAL_IMAGE_ON`
- `COMMON.LOCAL_IMAGE_OFF`
- `COMMON.SHOW_BATTERY_ON`
- `COMMON.SHOW_BATTERY_OFF`
- `COMMON.DISPLAY_HINT_ON`
- `COMMON.DISPLAY_HINT_OFF`
- `COMMON.DISPLAY_CLOCK_ON`
- `COMMON.DISPLAY_CLOCK_OFF`
- `COMMON.FORCE_OTA`
- `COMMON.OTA`
- `COMMON.SET_WINDOW`
- `COMMON.SET_CONFIG`

## What the command list implies

The stock firmware was built for more than a static display demo. It includes:

- network provisioning
- battery and display overlays
- local sleep and wake behavior
- remote image or window delivery
- OTA control
- Bluetooth-assisted behavior

That is a product firmware, not a factory test image.

## Backend and content model

The firmware includes repeated references to:

- `MQTT`
- `WELCOME`
- `REGULAR`
- `IDLE`
- `USER_INIT`
- `SET_WINDOW`
- `SET_CONFIG`
- `FETCH_CONTENT`

The logs show a workflow in which the device:

1. boots and initializes connectivity
2. establishes an MQTT-backed session
3. sends an initial heartbeat or `USER_INIT`
4. requests a `WELCOME` or `REGULAR` window
5. receives `SET_WINDOW`
6. refreshes the e-paper display
7. returns to an `IDLE` heartbeat model

That architecture matters. It shows that the original product already worked as a **remote-rendered endpoint**, not as a self-contained local UI.

## Factory and field-update model

The image also exposes a factory-update path tied to Wi-Fi scanning and OTA:

- references to `MindReset`
- references to `MindReset_Factory`
- references to a provisioning or app URL under `dot.mindreset.tech`
- logs for factory Wi-Fi discovery and OTA attempts

This tells us two things:

- the product expected controlled provisioning flows
- the vendor invested in recovery and update behavior, not just one-time flashing

## UART versus real image transport

The stock image contains `COMMON.SET_WINDOW`, but prior analysis in this repository found that the stock UART command dispatcher does not accept it in the way we would need for raw image upload. Likewise, enabling `COMMON.LOCAL_IMAGE_ON` did not unlock a practical USB framebuffer path.

That result is important because it explains why the custom firmware in this repository took a different route: replacing the application with a small, explicit USB image receiver was simpler and more reliable than trying to patch the stock command path.

## Working conclusion

The stock firmware describes a connected product with these traits:

- ESP32-C3 platform
- dual-OTA update strategy
- MQTT-backed content delivery
- Wi-Fi provisioning and recovery paths
- BLE-assisted features
- e-paper window rendering
- aggressive sleep and power management

In other words, the stock system was already organized around **remote control and scheduled display updates**. That makes the current repository's host-driven USB workflow a natural fit for repurposing the hardware.
