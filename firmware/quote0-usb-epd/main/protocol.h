#pragma once

#include <stddef.h>
#include <stdint.h>
#include "esp_err.h"

typedef esp_err_t (*frame_handler_t)(const uint8_t *frame, size_t len);

/* Install the USB-Serial/JTAG driver and send the Q0READY banner immediately,
 * before any long-running work. Safe to call once at boot. */
void protocol_usb_init(void);

/* Enter the blocking protocol loop. Must be called after protocol_usb_init. */
void protocol_task(frame_handler_t handler);
