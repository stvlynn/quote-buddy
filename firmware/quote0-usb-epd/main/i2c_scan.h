#pragma once

#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

/*
 * Non-destructive I²C bus probe. Installs the master on the given SDA/SCL
 * pins at 100 kHz, sends an address-only START+ACK probe to every 7-bit
 * address in 0x08..0x77, then tears the master down so the GPIOs are free
 * for other uses.
 *
 * Result format written into `out` (at most `len` bytes, always NUL
 * terminated):
 *
 *   sda=<n> scl=<m> found=0x<aa>,0x<bb>,... n=<count>
 *   sda=<n> scl=<m> found= n=0
 *   sda=<n> scl=<m> err=<errno>
 *
 * Returns ESP_OK once the scan completed (even when 0 devices responded),
 * or an error if the bus could not be installed.
 */
esp_err_t i2c_scan_run(int sda, int scl, char *out, size_t len);
