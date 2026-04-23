# Stock-image reverse-engineering playbook

How to extract **hardware-truthful** facts (controller ID, pin map,
revisions, timing, border register) from a closed-source ESP-IDF firmware
image when the device is on your desk.  Extracted from the Quote/0 debug,
but generic enough for any Espressif consumer product where you have:

- a merged `.bin` image (bootloader + partition table + app), and
- a physical unit that at least boots into the stock firmware.

The single most useful insight: **the running stock firmware is a more
reliable information source than the binary itself**.  String scanning is
plan B.

## Level 0 — What you already know before touching anything

1. Every Espressif merged image is `bootloader@0x0 | partitions@0x8000 | app@0x10000`.
2. App image magic byte is `0xE9`.
3. NVS, otadata, phy_init, and OTA slots live in a standard partition table
   you can dump in 20 lines of Python (`AA 50` entry magic, 32-byte entries).
4. On ESP32-C3, `GPIO18/19` are USB D-/D+, `GPIO2/8/9` are strapping,
   `GPIO12–17` are the SPI flash interface.  Anything else is fair game.

Consequence: you can map every file offset to a load address, and you can
distinguish "data" from "code" before reading a single instruction.

## Level 1 — Capture the stock firmware's own boot log

The stock firmware almost certainly has verbose `ESP_LOGI` enabled.  Flash
it back (keep the merged bin around as `.workspace/<name>.bin`), then:

```sh
python3 - <<'PY'
import serial, time
p = serial.Serial('/dev/cu.usbmodemXXXX', 115200, timeout=0.2)
p.dtr = False; p.rts = True; time.sleep(0.05)
p.dtr = True;  p.rts = False
end = time.time() + 20
buf = b''
while time.time() < end:
    buf += p.read(4096)
print(buf.decode('utf-8', errors='replace'))
PY
```

This single capture typically surfaces:

- chip revision + MAC address,
- partition / OTA slot actually in use,
- **controller ID** (e.g. `EPD_DETECT: IC型号: UC8251D, Revision: 0x0A`),
- **resolution** (e.g. `初始化UC8251D (152x296), border_reg=0x97`),
- **real wait-busy timing** (e.g. `wait_busy: 等待 1160 ms`),
- connectivity / BLE device name and PIN,
- battery mV and percentage.

These values are ground truth.  Write them down.  Every later decision in
your custom firmware should be cross-checked against them.

## Level 2 — Extract strings from the merged image

`strings(1)` is a fine first pass; a 20-line Python scanner is better
because it preserves file offsets:

```python
import re
data = open("<merged>.bin", "rb").read()
for m in re.finditer(rb"[\x20-\x7e]{6,}", data):
    print(f"0x{m.start():06x}  {m.group().decode()}")
```

Filter by keywords that are likely to appear next to hardware decisions:

- panel: `EPD`, `UC8`, `IL0`, `SSD`, `GDE`, `border_reg`, `BUSY`
- buses: `sclk`, `mosi`, `miso`, `cs=`, `spi_bus`, `gpio_config`
- NVS keys: `epd_config`, `ic_type`, `ic_rev`, `edition`, `user_config`

Cross-check every string against the boot log from Level 1.  If both
sources agree, you can treat the fact as confirmed.  If only the string
scan sees it, it might be dead code from another SKU.

## Level 3 — Parse the app image, not just the blob

```python
# Merged image: app starts at file offset 0x10000
# App header: 0xE9, seg_cnt, spi_mode, spi_spd|size, entry(4), ext_hdr(16)
# Then seg_cnt × { load_addr(4), seg_len(4), data(seg_len) }
```

Knowing each segment's `load_addr` lets you:

- distinguish `.rodata` (high 0x3C…) from `.text` (high 0x420…),
- restrict "pin-like numeric pattern" searches to data segments so you do
  not match riscv `LI rd, imm` opcodes,
- translate file offsets into addresses that the stock code references.

Save each segment out to a flat file for later grepping / disassembly.

## Level 4 — Read NVS without touching it

Every custom firmware on the same board should preserve the NVS partition
(`0x9000 / 0x4000` on stock, `0x9000 / 0x6000` in this repo — same base,
same alignment).  `esptool read_flash` fetches the partition even when your
own firmware is running:

```sh
esptool.py --chip esp32c3 --port /dev/cu.usbmodemXXXX \
    read_flash 0x9000 0x6000 nvs_dump.bin
```

Parsing NVS is ~80 lines of Python (page header + 32-byte entries).  The
keys you want are short (`ic_type`, `ic_rev`, `edition`, `epd_config`);
print everything and filter later.

On Quote/0 this immediately answered "what panel does this specific unit
think it is?":

```
ns=01 key=ic_type  u8  = 2   (note: value indexing is vendor-defined)
ns=01 key=ic_rev   u8  = 10
ns=01 key=edition  u8  = 2
ns=00 key=epd_config u8 = 1
```

**Important**: the mapping `ic_type=2 → <controller name>` is not standard.
Cross-check with the boot log to decide which integer means which panel.

## Level 5 — Structured data search in .rodata

For tables like `epd_pinset_t configs[N]`, scan the data segment for
*repeating* rows:

- same stride (try 16, 20, 24, 32, 48 bytes),
- each row has ≥ 6 GPIO-range integers (0–21 for ESP32-C3) with no repeats,
- the same layout repeats for ≥ 2–4 consecutive rows.

This filters out `LI` opcode constants and strapping / peripheral tables.
On Quote/0 this approach found large data blocks but none were the EPD pin
table; the real pin map was ultimately cross-validated against the stock
boot log instead.  Keep this as plan B, not plan A.

## Level 6 — Use the firmware you are debugging as a measurement tool

Principle 1 of
[`epd-hardware-bringup-playbook.md`](epd-hardware-bringup-playbook.md)
applies: once your custom firmware is alive enough to reply to `PING`, you
can use it to poke the hardware and read back.

For reverse engineering specifically, this unlocks:

- reading real electrical levels on disputed pins without a scope,
- timing individual stages of the refresh by diff'ing wall-clock on
  `STATUS` responses,
- toggling safe pins to cross-reference against visible cues (LED, panel
  power, battery management).

Do not rely on blind pin scans that drive every possible GPIO one after the
other.  ESP32-C3 has strapping and flash pins that **must not** be driven.

## Level 7 — Confirm before trusting

Accept a reverse-engineered fact only when **two independent sources
agree**:

| Source | Example |
| --- | --- |
| stock boot log | `UC8251D: 初始化UC8251D (152x296)` |
| string scan | `UC8251D (%dx%d), border_reg=0x%02X` |
| NVS value | `ic_type=2` |
| custom firmware measurement | full-refresh time ≈ 1.8 s |
| host-side protocol diagnostic | `stage=done busy=1 err=0` |

A single source of truth, especially a raw integer plucked from `.rodata`,
can be misleading.  Two sources rarely lie the same way.

## Mini-recipe (copy-pasteable)

For the next Espressif consumer device this project investigates:

```
# 1. Archive the merged image
cp <vendor>.bin .workspace/

# 2. Dump strings and the partition table
python3 scripts/scan_strings.py .workspace/<vendor>.bin | head -200
python3 scripts/dump_parttable.py .workspace/<vendor>.bin

# 3. Capture boot log
python3 scripts/boot_log.py /dev/cu.usbmodemXXXX > .workspace/stock-boot.log

# 4. Read NVS
esptool.py --chip esp32c3 --port /dev/cu.usbmodemXXXX \
    read_flash 0x9000 0x6000 .workspace/nvs.bin
python3 scripts/nvs_parse.py .workspace/nvs.bin

# 5. Cross-check controller / resolution / pin map in boot log vs strings.
#    Anything that does not appear in at least two sources is not a fact.
```

(The `scripts/` directory above is where one-off helpers would live if you
decide to keep them.  On this project they were thrown away after use.)

## Non-goals

This playbook is for extracting hardware truth, not for full IP
reconstruction.  It deliberately stays at the `.rodata` / log / NVS layer
and avoids disassembly unless absolutely necessary.  For product-level
behavior — content model, SET_WINDOW semantics, MRC display format — see
`docs/reverse-engineering/` instead.
