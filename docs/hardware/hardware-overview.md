# Hardware Overview

## Summary

The device appears to be a low-power, battery-backed, networked e-paper terminal built around an **ESP32-C3**. It is not, in its stock form, a rich local-input gadget. Instead, the stock firmware points to a design in which the device receives content from a remote backend, renders it on e-paper, and manages its own sleep, charging, and connectivity states.

## Sources

This summary combines two evidence streams:

- live USB enumeration and protocol probing of the connected unit
- static string analysis of the stock `2.0.8` merged firmware image

## Platform summary

| Item | Status | Notes |
| --- | --- | --- |
| MCU is `ESP32-C3` | **Confirmed** | The stock image contains `boot.esp32c3` and `Quote_0_ESP32-C3_IDF`. The live unit enumerates as an Espressif native USB device. |
| Native USB Serial/JTAG is present | **Confirmed** | The live unit enumerates as `USB JTAG/serial debug unit` with `VID:PID = 303A:1001`. |
| The display is e-paper | **Confirmed** | The stock image contains `EPD_DETECT`, `UC8251D`, `UC8151`, and display-init logs. |
| The stock firmware supports more than one EPD controller | **Confirmed** | The image includes separate paths for `UC8151/IL0324` and `UC8251D`. |
| The board has a battery-backed power path | **Confirmed** | The image includes battery, ADC, VBUS, low-battery, and sleep-management logic. |
| VBUS plug and unplug detection exists | **Confirmed** | The image logs VBUS GPIO initialization and wake/sleep behavior tied to plug events. |
| Wi-Fi exists and is used by the stock product | **Confirmed** | The image contains Wi-Fi setup, reconnect, and backend handshake logs. |
| BLE exists in the stock firmware | **Confirmed** | The image includes BLE-related commands and BLE stack strings. |
| Dual OTA partitions are used | **Confirmed** | The stock image follows a standard ESP-IDF dual-OTA layout. |
| The current panel size is `152 x 296` | **Confirmed for the live unit** | Verified during custom bring-up in this repository. This size was not recovered directly from stock firmware string scans. |
| Physical buttons are absent | **Inferred / operationally likely** | Current project notes describe the device as having no physical buttons. We found no positive evidence of a rich local button UI in stock-firmware strings. |
| An IMU is present | **Not confirmed** | We found no strong IMU driver strings or motion-sensor clues in the stock image. |
| NFC is present | **Open question** | A generic NDEF-related string appears in the image, but no obvious NFC chip identifier was found. |
| A status LED is present | **User-reported, not firmware-confirmed** | We have a user report of an LED, but no stock-firmware string tied it to a specific GPIO or subsystem. |

## What the hardware looks like in practice

Taken together, the evidence points to a device with these priorities:

- low idle power
- battery awareness
- plug-detect wake behavior
- remote content delivery
- e-paper rendering
- factory and field update paths

That profile matches a desk display or notification endpoint far better than a handheld controller with rich onboard input.

## Working conclusion

For design work, the safest current model is this:

> Treat Quote0 as a battery-backed ESP32-C3 e-paper endpoint with native USB, Wi-Fi, BLE, and strong power-management logic. Treat NFC, LED, and any local-input hardware as separate questions until they are verified on the live board.
