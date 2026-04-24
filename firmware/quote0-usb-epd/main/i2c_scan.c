/*
 * Non-destructive I²C scanner, exposed over the USB text protocol as
 *   I2CSCAN <sda> <scl>
 *
 * Design goals:
 *   - Run with no side effects on the already-initialised EPD driver.
 *     The two pins passed in must not collide with any EPD signal; the
 *     command handler is responsible for validating that.
 *   - Never write data — only address-only probe transactions. An ACK
 *     means a device answered; we record the 7-bit address and move on.
 *   - Install, scan, uninstall within a single call. No global state
 *     left behind, no GPIO held high after the call returns.
 */

#include "i2c_scan.h"

#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "driver/gpio.h"
#include "driver/i2c_master.h"

#define I2C_PORT I2C_NUM_0
#define I2C_FREQ_HZ 100000
#define PROBE_TIMEOUT_MS 50

/* Scan 7-bit addresses 0x08..0x77, the standard usable range. */
#define ADDR_MIN 0x08
#define ADDR_MAX 0x77

esp_err_t i2c_scan_run(int sda, int scl, char *out, size_t len)
{
    if (out == NULL || len < 32) {
        return ESP_ERR_INVALID_ARG;
    }
    if (sda < 0 || sda > 21 || scl < 0 || scl > 21 || sda == scl) {
        snprintf(out, len, "sda=%d scl=%d err=invalid-pins", sda, scl);
        return ESP_ERR_INVALID_ARG;
    }

    const i2c_master_bus_config_t bus_cfg = {
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .i2c_port = I2C_PORT,
        .sda_io_num = sda,
        .scl_io_num = scl,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };

    i2c_master_bus_handle_t bus = NULL;
    esp_err_t err = i2c_new_master_bus(&bus_cfg, &bus);
    if (err != ESP_OK) {
        snprintf(out, len, "sda=%d scl=%d err=%d-install", sda, scl, (int)err);
        return err;
    }

    char found[96];
    size_t fp = 0;
    int n = 0;
    found[0] = '\0';

    for (int addr = ADDR_MIN; addr <= ADDR_MAX; ++addr) {
        esp_err_t probe = i2c_master_probe(bus, addr, PROBE_TIMEOUT_MS);
        if (probe == ESP_OK) {
            if (fp + 6 < sizeof(found)) {
                fp += (size_t)snprintf(found + fp, sizeof(found) - fp,
                                       n == 0 ? "0x%02x" : ",0x%02x", addr);
            }
            n++;
        }
    }

    (void)i2c_del_master_bus(bus);

    snprintf(out, len, "sda=%d scl=%d found=%s n=%d", sda, scl, found, n);
    return ESP_OK;
}
