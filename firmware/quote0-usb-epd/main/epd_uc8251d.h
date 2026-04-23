#pragma once

#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

/*
 * Quote/0 e-paper driver, UC8251D full-refresh path.
 *
 * Live unit notes (see docs/firmware/quote0_usb_firmware.md):
 *   controller  = UC8251D (EPD_DETECT Revision 0x0A)
 *   pin map     = SCLK=10, MOSI=7, CS=6, DC=5, RST=4, BUSY=3, PWR=20
 *   BUSY        = active-low, needs internal pull-up (no external pull)
 *   full refresh~ 1.8 s (Power On + write + wait_busy)
 */

esp_err_t epd_init_bus(void);
esp_err_t epd_display_frame(const uint8_t *frame, size_t len);
void epd_power_off(void);

/* Diagnostic helpers exposed through the USB protocol.  The string returned by
 * epd_last_diag() / epd_format_status() is the only debugging surface because
 * ESP_LOG output is disabled in sdkconfig.defaults. */
const char *epd_last_diag(void);
void epd_format_status(char *buf, size_t len);
esp_err_t epd_set_output_pin(const char *pin_name, int level);
