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

## Wireless implementation model

The current evidence points to a single-chip wireless design, not a board with separate Wi-Fi and Bluetooth modules. The stock image identifies itself as an `ESP32-C3` build, and the same image contains both Wi-Fi runtime strings and a BLE provisioning stack.

The BLE side looks especially close to Espressif's standard provisioning stack:

- `protocomm`
- `protocomm_nimble`
- `NimBLE`
- `WiFiProvConfig`
- `WiFiConfigPayload`
- `WiFiScanPayload`
- `prov-ctrl`
- `prov-config`
- `prov-scan`
- `prov-session`
- `proto-ver`
- `sec0`, `sec1`, `sec2`
- `{"prov":{"ver":"v1.1","cap":["wifi_scan"]}}`
- NimBLE advertising and scan-response error strings
- BLE device-name setup error strings

That combination strongly suggests this model:

- BLE is used to provision Wi-Fi credentials
- Wi-Fi is the main online transport after provisioning
- MQTT carries the product's normal content and control traffic

This is the strongest explanation that fits both the recovered strings and the reconstructed control flow.

## Provisional application message schema

We still do not have the exact MQTT topic map or the full JSON schema. We do, however, have enough strings to infer the rough message envelope.

Visible envelope and routing strings include:

- `requestKey`
- `requestId`
- `requestData`
- `{"requestId":"%s","responseData":%s}`
- `{"responseKey":"%s","responseId":"%s"}`
- `/{"responseKey":"%s","responseData":%s}/`
- `heartbeat/%s (%d bytes)`
- `window/%s`
- `{"scheme":"%s","version":"v2","id":"%s","series":"%s","model":"%s","edition":%s}`

The most conservative reading is that the cloud path uses a small request/response envelope with key, id, and data fields, plus topic or route names for heartbeat and window traffic.

### `SET_WINDOW`

The payload appears to include at least these fields or nodes:

- `render`
- `border`
- `array`

Supporting strings include:

- `SET_WINDOW: border=%d, data_len=%d`
- `[MQTT] SET_WINDOW 已处理: border=%d, len=%d`
- `(len=%d, total=%d, offset=%d)`

That last string is important. It suggests that the actual render payload may be chunked or assembled from segments rather than delivered as one small inline value.

### `SET_CONFIG`

The payload appears richer than the earlier notes suggested. Visible field names include:

- `needUpdate`
- `forceUpdate`
- `nextPowerRenderDelay`
- `nextBattRenderDelay`
- `channel`
- `network`
- `wifiList`
- `locale`
- `displayHint`
- `floatTimezone`
- `timezone`
- `available`
- `reset`
- `update`
- `has_task`

Supporting log strings include:

- `SET_CONFIG Task: powerRender=%ldms, battRender=%ldms`
- `SET_CONFIG: locale=%s`
- `SET_CONFIG: displayHint=%d`
- `SET_CONFIG: floatTimezone=%.2f -> %ld min`
- `SET_CONFIG: available=%d, reset=%d, update=%d`
- `>>> SET_CONFIG: available=%d, reset=%d, update=%d, has_task=%d`
- `>>> SET_CONFIG.Reset=1`

The safest current interpretation is that `SET_CONFIG` combines:

- display and UX toggles
- locale and timezone settings
- refresh intervals for charging and battery modes
- device-availability flags
- remote reset and update requests
- an optional task block

### Heartbeat and status data

The stock image also contains a status-oriented field cluster:

- `currentStatus`
- `memory`
- `temperature`
- `wifiSignal`
- `voltage`
- `level`
- `isLoaded`
- `isCharging`
- `power`
- `schedule`
- `hardware`
- `production`
- `server_mode`
- `serverMode`
- `software`
- `general`
- `statusData`

Those names fit the existing hypothesis that heartbeats carry more than a simple online marker. They likely include live device state and hardware telemetry.

## `COMMON.BLE_IMAGE_ON/OFF` and `COMMON.LOCAL_IMAGE_ON/OFF`

These commands remain only partially explained, but the picture is now sharper.

Direct evidence from the stock image includes:

- `COMMON.BLE_IMAGE_ON`
- `COMMON.BLE_IMAGE_OFF`
- `COMMON.LOCAL_IMAGE_ON`
- `COMMON.LOCAL_IMAGE_OFF`
- `ble_img_mode`
- `net_mode`
- `BLE IMAGE OFF`
- `WEB IMAGE OFF`

The recovered command handler treats these as mode toggles, which is consistent with the string evidence. What we can say with confidence is this:

- the firmware had a distinct BLE image mode flag
- the firmware had at least one other image or network mode flag
- the BLE-image and local-image commands did not look like one-shot upload commands

What we still cannot prove is the exact transport behind those modes. The nearby `WEB IMAGE OFF` string is especially interesting, because it suggests that `LOCAL_IMAGE_*` may not have meant "raw local framebuffer over UART" in the way we first hoped. It may have referred to a separate image-source mode that the application internally contrasted with normal network windows.

So the best current hypothesis is narrow:

- `COMMON.BLE_IMAGE_ON/OFF` toggled a BLE-backed image path or BLE-originated image mode
- `COMMON.LOCAL_IMAGE_ON/OFF` toggled a second non-standard image path, possibly what the firmware internally called a web-image mode
- neither command, by itself, proves a practical raw USB image upload path in the stock firmware

## Live-device probing note

A live USB probe on the currently connected unit is useful mainly as a guardrail.

The present device on `/dev/cu.usbmodem101` responds to the custom replacement firmware protocol:

- `PING` replies with `PONG`
- `STATUS` replies with the custom diagnostic line format

That means the currently attached device is **not** running the stock application image right now. Any behavior observed through that live port belongs to the custom USB receiver in this repository, not to the stock `2.0.8` application.

This matters for the unresolved questions above:

- we can use the live unit to confirm the custom USB transport
- we cannot use the current live unit, as-is, to validate stock `COMMON.*` command behavior
- validating stock `COMMON.BLE_IMAGE_ON/OFF` or the exact stock MQTT payload schema would require reflashing the stock image or extracting runtime logs from a stock-running unit

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
