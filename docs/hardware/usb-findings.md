# USB Findings

## Live USB identity

A live inspection of the connected unit on macOS showed the following USB identity:

- **Vendor**: `Espressif`
- **Product**: `USB JTAG/serial debug unit`
- **VID:PID**: `303A:1001`
- **USB serial number**: the device exposes a MAC-like serial string
- **Serial device nodes**:
  - `/dev/cu.usbmodem1101`
  - `/dev/tty.usbmodem1101`

## What that means

This is not a board that relies on a separate USB-to-UART bridge such as `CH340`, `CP2102`, or `FTDI`. Instead, it presents the standard **native USB Serial/JTAG interface used by ESP32-C3-class devices**.

That finding matches the stock-firmware evidence, which contains strings such as:

- `/dev/usbserjtag`
- `usb_serial_jtag`
- `USB-Serial-JTAG`

## Custom firmware probe

The connected unit is currently running the custom USB firmware from this repository. A minimal probe over the live serial interface returned:

- request: `PING`
- response: `PONG`

That confirms three things:

1. the serial path is alive
2. the custom protocol is active on the live device
3. the repository's USB firmware bring-up matches the current hardware

## Why USB matters for hardware analysis

USB gives us a reliable view of the MCU-facing transport layer. It can confirm:

- the device family
- the presence of native USB Serial/JTAG
- the current firmware path
- the live serial endpoint name and access path

USB cannot, by itself, prove the presence of:

- NFC hardware
- an LED GPIO
- a physical button matrix
- an IMU or other motion sensor

Those require either stronger firmware evidence, a board inspection, or deeper live probing.

## Practical conclusion

For bring-up, diagnostics, and a display-first Buddy adaptation, USB is already good enough to support:

- firmware flashing
- serial debugging
- a host-driven framebuffer push path
- low-friction local development on macOS or Linux

In short, USB is a stable anchor point for this device. It tells us the platform is ESP32-C3-class, and it gives us a direct control path even when the stock network stack is not in use.
