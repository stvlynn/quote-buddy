# Display and Power Subsystems

## Display subsystem

The stock firmware contains strong evidence for an e-paper display stack. Relevant strings include:

- `EPD_DETECT`
- `epd_config`
- `UC8251D`
- `UC8151`
- `IL0324`
- `使用 UC8151/IL0324 驱动`
- `使用 UC8251D 驱动`
- `初始化UC8251D (%dx%d), border_reg=...`
- `初始化UC8151 (%dx%d), border_reg=...`
- `BUSY超时，尝试重新检测IC型号...`

## What that tells us

The stock firmware does not appear to target exactly one hard-coded panel controller. Instead, it includes detection or fallback logic for at least two controller families:

- `UC8251D`
- `UC8151 / IL0324`

That matters because it suggests one of two possibilities:

- the product line used more than one compatible panel during manufacturing, or
- the firmware was written to tolerate panel variation across revisions

Either way, the display path is mature enough to handle controller detection and BUSY-line failure cases.

## Live-unit panel size

The current live unit has already been brought up in this repository as a `152 x 296`, 1-bit e-paper panel. That size is confirmed by the working custom firmware and test uploads.

This specific resolution was verified during custom bring-up, not recovered directly from the stock string scan.

## Power subsystem

The stock image contains a substantial amount of power-management logic, including:

- `VBUS GPIO 初始化失败`
- `VBUS 已变低（拔电确认）`
- `等待 VBUS(GPIO%d) 拉高（插电）唤醒`
- `battery_low`
- `ADC 校准`
- `VBAT ADC 初始化失败`
- battery percentage and millivolt logs
- deep-sleep and light-sleep transitions

## What that means

The board is not a simple USB-powered peripheral. It has a real power model with:

- battery measurement
- plug and unplug detection
- low-battery behavior
- sleep scheduling
- VBUS-based wake behavior

The firmware also references waiting for VBUS to rise before wake. That is exactly the kind of behavior expected in a battery-backed product that wants to sleep deeply when unplugged.

## Thermal monitoring

The stock image also includes temperature-related strings such as:

- `Failed to install temperature sensor`
- `Failed to enable temperature sensor`
- `High temperature detected`
- `HEALTH_TEMP_HIGH.mrc`

This suggests the firmware monitors temperature at least well enough to surface warnings or trigger health-related display states.

## Design takeaway

The display and power systems were clearly first-class features of the original product. If the device is repurposed as a Buddy display, these are the hardware strengths to lean into:

- e-paper as the primary output path
- battery-aware behavior
- sleep and wake tied to power events
- infrequent but meaningful screen refreshes

Those strengths matter more than local input features, which remain far less certain.
