/*
 * UC8151 / UC8251D e-paper driver for the MindReset Quote/0 panel.
 * BUSY polarity: LOW while busy, HIGH when idle.
 */

#include "epd_uc8251d.h"

#include <stdarg.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "driver/usb_serial_jtag.h"
#include "esp_check.h"
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "quote0_pins.h"

#define EPD_SPI_HOST SPI2_HOST
#define EPD_SPI_CLOCK_HZ (4 * 1000 * 1000)

static spi_device_handle_t s_epd;
static bool s_bus_ready;

static void delay_ms(uint32_t ms)
{
    if (ms < 5) {
        esp_rom_delay_us(ms * 1000U);
    } else {
        vTaskDelay(pdMS_TO_TICKS(ms));
    }
}

static void dbg(const char *fmt, ...)
{
    char buf[96];
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    if (n < 0) return;
    if (n > (int)sizeof(buf) - 1) n = sizeof(buf) - 1;
    usb_serial_jtag_write_bytes((const uint8_t *)buf, (size_t)n, pdMS_TO_TICKS(200));
}

static void epd_write_command(uint8_t command)
{
    gpio_set_level(Q0_EPD_PIN_DC, 0);
    gpio_set_level(Q0_EPD_PIN_CS, 0);
    spi_transaction_t tx = { .length = 8, .tx_buffer = &command };
    (void)spi_device_polling_transmit(s_epd, &tx);
    gpio_set_level(Q0_EPD_PIN_CS, 1);
}

static void epd_write_data_byte(uint8_t data)
{
    gpio_set_level(Q0_EPD_PIN_DC, 1);
    gpio_set_level(Q0_EPD_PIN_CS, 0);
    spi_transaction_t tx = { .length = 8, .tx_buffer = &data };
    (void)spi_device_polling_transmit(s_epd, &tx);
    gpio_set_level(Q0_EPD_PIN_CS, 1);
}

static void epd_write_data(const uint8_t *data, size_t len)
{
    gpio_set_level(Q0_EPD_PIN_DC, 1);
    gpio_set_level(Q0_EPD_PIN_CS, 0);
    while (len > 0) {
        size_t chunk = len > 4096 ? 4096 : len;
        spi_transaction_t tx = { .length = chunk * 8, .tx_buffer = data };
        (void)spi_device_polling_transmit(s_epd, &tx);
        data += chunk;
        len -= chunk;
    }
    gpio_set_level(Q0_EPD_PIN_CS, 1);
}

/* Full-refresh LUTs — Waveshare 2.9" UC8151 (MIT). */
static const uint8_t LUT_VCOM[] = {
    0x00, 0x00,
    0x00, 0x0F, 0x0F, 0x00, 0x00, 0x05,
    0x00, 0x32, 0x32, 0x00, 0x00, 0x02,
    0x00, 0x0F, 0x0F, 0x00, 0x00, 0x05,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00,
};
static const uint8_t LUT_WW[] = {
    0x50, 0x0F, 0x0F, 0x00, 0x00, 0x05,
    0xAA, 0x32, 0x32, 0x00, 0x00, 0x02,
    0xA0, 0x0F, 0x0F, 0x00, 0x00, 0x05,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
};
static const uint8_t LUT_BW[] = {
    0x50, 0x0F, 0x0F, 0x00, 0x00, 0x05,
    0xAA, 0x32, 0x32, 0x00, 0x00, 0x02,
    0xA0, 0x0F, 0x0F, 0x00, 0x00, 0x05,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
};
static const uint8_t LUT_WB[] = {
    0xA0, 0x0F, 0x0F, 0x00, 0x00, 0x05,
    0x55, 0x32, 0x32, 0x00, 0x00, 0x02,
    0x50, 0x0F, 0x0F, 0x00, 0x00, 0x05,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
};
static const uint8_t LUT_BB[] = {
    0xA0, 0x0F, 0x0F, 0x00, 0x00, 0x05,
    0x55, 0x32, 0x32, 0x00, 0x00, 0x02,
    0x50, 0x0F, 0x0F, 0x00, 0x00, 0x05,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
};

static void epd_load_luts(void)
{
    epd_write_command(0x20);
    epd_write_data(LUT_VCOM, sizeof(LUT_VCOM));
    epd_write_command(0x21);
    epd_write_data(LUT_WW, sizeof(LUT_WW));
    epd_write_command(0x22);
    epd_write_data(LUT_BW, sizeof(LUT_BW));
    epd_write_command(0x23);
    epd_write_data(LUT_WB, sizeof(LUT_WB));
    epd_write_command(0x24);
    epd_write_data(LUT_BB, sizeof(LUT_BB));
}

/* UC8151: BUSY LOW while busy, HIGH when idle. */
static bool epd_wait_idle(uint32_t timeout_ms)
{
    uint32_t elapsed = 0;
    int initial = gpio_get_level(Q0_EPD_PIN_BUSY);
    while (gpio_get_level(Q0_EPD_PIN_BUSY) == 0) {
        if (elapsed >= timeout_ms) {
            dbg("\nDBG wait_idle TIMEOUT %ums init=%d\n", elapsed, initial);
            return false;
        }
        delay_ms(20);
        elapsed += 20;
    }
    dbg("\nDBG wait_idle ok %ums init=%d\n", elapsed, initial);
    return true;
}

static void epd_reset(void)
{
    gpio_set_level(Q0_EPD_PIN_RST, 1);
    delay_ms(20);
    gpio_set_level(Q0_EPD_PIN_RST, 0);
    delay_ms(5);
    gpio_set_level(Q0_EPD_PIN_RST, 1);
    delay_ms(20);
}

static esp_err_t epd_controller_init(void)
{
    gpio_set_level(Q0_EPD_PIN_PWR, 1);
    delay_ms(20);

    epd_reset();

    /* POWER_SETTING */
    epd_write_command(0x01);
    epd_write_data_byte(0x03);
    epd_write_data_byte(0x00);
    epd_write_data_byte(0x2b);
    epd_write_data_byte(0x2b);
    epd_write_data_byte(0x03);

    /* BOOSTER_SOFT_START */
    epd_write_command(0x06);
    epd_write_data_byte(0x17);
    epd_write_data_byte(0x17);
    epd_write_data_byte(0x17);

    /* POWER_ON */
    epd_write_command(0x04);
    if (!epd_wait_idle(5000)) return ESP_ERR_TIMEOUT;

    /* PANEL_SETTING: REG=1 (LUT from register), BW-only = 0xbf */
    epd_write_command(0x00);
    epd_write_data_byte(0xbf);
    epd_write_data_byte(0x0d);

    /* PLL_CONTROL: 100Hz */
    epd_write_command(0x30);
    epd_write_data_byte(0x3a);

    /* RESOLUTION: 152 x 296 */
    epd_write_command(0x61);
    epd_write_data_byte(Q0_EPD_WIDTH & 0xff);
    epd_write_data_byte((Q0_EPD_HEIGHT >> 8) & 0xff);
    epd_write_data_byte(Q0_EPD_HEIGHT & 0xff);

    /* VCOM_DC */
    epd_write_command(0x82);
    epd_write_data_byte(0x28);

    /* VCOM_AND_DATA_INTERVAL */
    epd_write_command(0x50);
    epd_write_data_byte(0x97);

    /* Load register-based LUTs (needed because PANEL_SETTING REG=1) */
    epd_load_luts();

    return ESP_OK;
}

esp_err_t epd_init_bus(void)
{
    if (s_bus_ready) return ESP_OK;

    gpio_config_t outputs = {
        .pin_bit_mask = (1ULL << Q0_EPD_PIN_DC) |
                        (1ULL << Q0_EPD_PIN_CS) |
                        (1ULL << Q0_EPD_PIN_RST) |
                        (1ULL << Q0_EPD_PIN_PWR),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_RETURN_ON_ERROR(gpio_config(&outputs), "epd", "gpio_config outputs");
    gpio_set_level(Q0_EPD_PIN_CS, 1);
    gpio_set_level(Q0_EPD_PIN_RST, 1);
    gpio_set_level(Q0_EPD_PIN_PWR, 0);

    gpio_config_t busy = {
        .pin_bit_mask = (1ULL << Q0_EPD_PIN_BUSY),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_RETURN_ON_ERROR(gpio_config(&busy), "epd", "gpio_config busy");

    spi_bus_config_t bus = {
        .mosi_io_num = Q0_EPD_PIN_MOSI,
        .miso_io_num = -1,
        .sclk_io_num = Q0_EPD_PIN_SCLK,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = 4096,
    };
    ESP_RETURN_ON_ERROR(spi_bus_initialize(EPD_SPI_HOST, &bus, SPI_DMA_CH_AUTO),
                        "epd", "spi_bus_initialize");

    spi_device_interface_config_t dev = {
        .clock_speed_hz = EPD_SPI_CLOCK_HZ,
        .mode = 0,
        .spics_io_num = -1,
        .queue_size = 1,
    };
    ESP_RETURN_ON_ERROR(spi_bus_add_device(EPD_SPI_HOST, &dev, &s_epd),
                        "epd", "spi_bus_add_device");

    s_bus_ready = true;
    return ESP_OK;
}

esp_err_t epd_display_frame(const uint8_t *frame, size_t len)
{
    if (frame == NULL || len != Q0_EPD_FRAME_BYTES) {
        return ESP_ERR_INVALID_ARG;
    }

    ESP_RETURN_ON_ERROR(epd_init_bus(), "epd", "epd_init_bus");
    dbg("\nDBG frame_start busy=%d\n", gpio_get_level(Q0_EPD_PIN_BUSY));
    ESP_RETURN_ON_ERROR(epd_controller_init(), "epd", "epd_controller_init");
    dbg("\nDBG post_init busy=%d\n", gpio_get_level(Q0_EPD_PIN_BUSY));

    /* DATA_START_TRANSMISSION_1: previous frame (all white), bulk */
    static uint8_t white_buf[Q0_EPD_FRAME_BYTES];
    memset(white_buf, 0xff, sizeof(white_buf));
    epd_write_command(0x10);
    epd_write_data(white_buf, sizeof(white_buf));

    /* DATA_START_TRANSMISSION_2: current frame */
    epd_write_command(0x13);
    epd_write_data(frame, len);

    /* DISPLAY_REFRESH */
    epd_write_command(0x12);
    delay_ms(10);
    if (!epd_wait_idle(60000)) {
        return ESP_ERR_TIMEOUT;
    }

    /* POWER_OFF */
    epd_write_command(0x02);
    (void)epd_wait_idle(5000);

    return ESP_OK;
}

void epd_power_off(void)
{
    if (!s_bus_ready) return;
    epd_write_command(0x02);
    (void)epd_wait_idle(5000);
    gpio_set_level(Q0_EPD_PIN_PWR, 0);
}
