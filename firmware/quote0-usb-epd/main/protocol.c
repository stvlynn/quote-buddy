#include "protocol.h"

#include <ctype.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "driver/usb_serial_jtag.h"
#include "freertos/FreeRTOS.h"

#include "epd_uc8251d.h"
#include "i2c_scan.h"
#include "quote0_pins.h"

#define RX_TIMEOUT_TICKS pdMS_TO_TICKS(100)
#define HEADER_MAX 96
#define PROTOCOL_BANNER "Q0READY 152 296 1BPP rev=diag3\n"

static uint8_t s_frame[Q0_EPD_FRAME_BYTES];

/* ------------------------------------------------------------------------- */
/* Low-level IO                                                               */
/* ------------------------------------------------------------------------- */

static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t len)
{
    crc = ~crc;
    for (size_t i = 0; i < len; ++i) {
        crc ^= data[i];
        for (int bit = 0; bit < 8; ++bit) {
            uint32_t mask = -(crc & 1U);
            crc = (crc >> 1) ^ (0xedb88320U & mask);
        }
    }
    return ~crc;
}

static void write_all(const char *s)
{
    usb_serial_jtag_write_bytes((const uint8_t *)s, strlen(s), pdMS_TO_TICKS(1000));
}

static void write_status_prefix(const char *prefix)
{
    char status[192];
    char response[256];
    epd_format_status(status, sizeof(status));
    snprintf(response, sizeof(response), "%s %s\n", prefix, status);
    write_all(response);
}

static void write_epd_result(esp_err_t err)
{
    if (err == ESP_OK) {
        write_status_prefix("OK");
    } else if (err == ESP_ERR_TIMEOUT) {
        write_status_prefix("ERR epd-timeout");
    } else if (err == ESP_ERR_INVALID_ARG) {
        write_status_prefix("ERR invalid-arg");
    } else {
        write_status_prefix("ERR epd");
    }
}

static int read_byte_blocking(uint8_t *byte)
{
    while (true) {
        int n = usb_serial_jtag_read_bytes(byte, 1, RX_TIMEOUT_TICKS);
        if (n == 1) {
            return 1;
        }
    }
}

static bool read_header(char *header, size_t header_len)
{
    size_t pos = 0;
    while (pos + 1 < header_len) {
        uint8_t byte = 0;
        if (read_byte_blocking(&byte) != 1) {
            continue;
        }
        if (byte == '\r') {
            continue;
        }
        if (byte == '\n') {
            header[pos] = '\0';
            return pos > 0;
        }
        if (isprint(byte)) {
            header[pos++] = (char)byte;
        } else {
            pos = 0;
        }
    }
    header[header_len - 1] = '\0';
    return false;
}

static bool read_exact(uint8_t *buf, size_t len)
{
    size_t got = 0;
    while (got < len) {
        int n = usb_serial_jtag_read_bytes(buf + got, len - got, pdMS_TO_TICKS(1000));
        if (n < 0) {
            return false;
        }
        got += (size_t)n;
    }
    return true;
}

/* ------------------------------------------------------------------------- */
/* Command handlers                                                           */
/* ------------------------------------------------------------------------- */

static bool parse_image_header(const char *header, uint32_t *expected_crc)
{
    char fmt[8] = {0};
    unsigned width = 0;
    unsigned height = 0;
    unsigned len = 0;
    unsigned crc = 0;

    int fields = sscanf(header, "Q0IMG1 %u %u %7s %u %x",
                        &width, &height, fmt, &len, &crc);
    if (fields != 5) {
        return false;
    }
    if (width != Q0_EPD_WIDTH || height != Q0_EPD_HEIGHT) {
        return false;
    }
    if (strcmp(fmt, "1BPP") != 0 || len != Q0_EPD_FRAME_BYTES) {
        return false;
    }
    *expected_crc = crc;
    return true;
}

static bool handle_gpio_command(const char *header)
{
    if (strcmp(header, "GPIO SNAP") == 0) {
        write_status_prefix("OK");
        return true;
    }

    char pin[8] = {0};
    int level = -1;
    if (sscanf(header, "GPIO %7s %d", pin, &level) == 2) {
        write_epd_result(epd_set_output_pin(pin, level));
        return true;
    }

    write_all("ERR invalid-gpio\n");
    return true;
}

/* Returns true when the line was recognized as a text command and replied to. */
static bool handle_text_command(const char *header)
{
    if (strcmp(header, "PING") == 0) {
        write_all("PONG\n");
        return true;
    }

    if (strcmp(header, "STATUS") == 0 || strcmp(header, "DIAG") == 0) {
        write_status_prefix("OK");
        return true;
    }

    if (strncmp(header, "GPIO ", 5) == 0) {
        return handle_gpio_command(header);
    }

    {
        int sda = -1, scl = -1;
        if (sscanf(header, "I2CSCAN %d %d", &sda, &scl) == 2) {
            /* Refuse pins that are already claimed. */
            static const int forbidden[] = {
                Q0_EPD_PIN_SCLK, Q0_EPD_PIN_MOSI, Q0_EPD_PIN_CS,
                Q0_EPD_PIN_BUSY, Q0_EPD_PIN_RST, Q0_EPD_PIN_DC,
                Q0_EPD_PIN_PWR,
                /* USB D-/D+ on ESP32-C3. */
                18, 19,
                /* SPI flash. */
                11, 12, 13, 14, 15, 16, 17,
            };
            bool blocked = false;
            for (size_t i = 0; i < sizeof(forbidden) / sizeof(forbidden[0]); ++i) {
                if (sda == forbidden[i] || scl == forbidden[i]) {
                    blocked = true;
                    break;
                }
            }
            if (blocked) {
                write_all("ERR i2c-forbidden-pin\n");
                return true;
            }

            char result[192];
            char reply[256];
            esp_err_t err = i2c_scan_run(sda, scl, result, sizeof(result));
            if (err == ESP_OK) {
                snprintf(reply, sizeof(reply), "OK %s\n", result);
            } else {
                snprintf(reply, sizeof(reply), "ERR i2c %s\n", result);
            }
            write_all(reply);
            return true;
        }
    }

    return false;
}

/* ------------------------------------------------------------------------- */
/* Public entry points                                                        */
/* ------------------------------------------------------------------------- */

void protocol_usb_init(void)
{
    static bool initialized = false;
    if (initialized) {
        return;
    }
    initialized = true;

    usb_serial_jtag_driver_config_t usb_config = USB_SERIAL_JTAG_DRIVER_CONFIG_DEFAULT();
    usb_config.rx_buffer_size = 8192;
    usb_config.tx_buffer_size = 1024;
    (void)usb_serial_jtag_driver_install(&usb_config);

    write_all(PROTOCOL_BANNER);
}

void protocol_task(frame_handler_t handler)
{
    protocol_usb_init();

    while (true) {
        char header[HEADER_MAX];
        uint32_t expected_crc = 0;

        if (!read_header(header, sizeof(header))) {
            write_all("ERR bad-header\n");
            continue;
        }

        if (handle_text_command(header)) {
            continue;
        }

        if (!parse_image_header(header, &expected_crc)) {
            write_all("ERR unsupported-header\n");
            continue;
        }

        if (!read_exact(s_frame, sizeof(s_frame))) {
            write_all("ERR short-frame\n");
            continue;
        }

        uint32_t actual_crc = crc32_update(0, s_frame, sizeof(s_frame));
        if (actual_crc != expected_crc) {
            write_all("ERR crc\n");
            continue;
        }

        write_epd_result(handler(s_frame, sizeof(s_frame)));
    }
}
