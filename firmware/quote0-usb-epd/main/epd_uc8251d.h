#pragma once

#include <stddef.h>
#include <stdint.h>
#include "esp_err.h"

esp_err_t epd_init_bus(void);
esp_err_t epd_display_frame(const uint8_t *frame, size_t len);
void epd_power_off(void);

