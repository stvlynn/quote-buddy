#pragma once

#include <stddef.h>
#include <stdint.h>
#include "esp_err.h"

typedef esp_err_t (*frame_handler_t)(const uint8_t *frame, size_t len);

void protocol_task(frame_handler_t handler);

