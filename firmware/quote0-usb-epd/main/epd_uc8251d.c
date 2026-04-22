/*
 * UC8251D e-paper driver for the MindReset Quote/0 panel.
 * Based on Waveshare 2.66" e-paper driver (MIT).
 * BUSY polarity: LOW while busy, HIGH when idle.
 */

#include "epd_uc8251d.h"

#include <stdbool.h>
#include <string.h>

#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_check.h"
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "quote0_pins.h"

#define EPD_SPI_HOST SPI2_HOST
#define EPD_SPI_CLOCK_HZ (4 * 1000 * 1000)

static spi_device_handle_t s_epd;
static bool s_bus_ready;
static bool s_ctrl_inited;

static void delay_ms(uint32_t ms)
{
    if (ms < 5) {
        esp_rom_delay_us(ms * 1000U);
    } else {
        vTaskDelay(pdMS_TO_TICKS(ms));
    }
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

static bool epd_wait_idle(uint32_t timeout_ms)
{
    uint32_t elapsed = 0;
    while (gpio_get_level(Q0_EPD_PIN_BUSY) == 0) {
        if (elapsed >= timeout_ms) {
            return false;
        }
        delay_ms(20);
        elapsed += 20;
    }
    delay_ms(200);
    return true;
}

static void epd_reset(void)
{
    gpio_set_level(Q0_EPD_PIN_RST, 0);
    delay_ms(1);
    gpio_set_level(Q0_EPD_PIN_RST, 1);
    delay_ms(200);
}

static void epd_controller_init(void)
{
    if (s_ctrl_inited) {
        return;
    }
    s_ctrl_inited = true;

    gpio_set_level(Q0_EPD_PIN_PWR, 1);
    delay_ms(100);

    epd_reset();

    epd_wait_idle(5000);

    epd_write_command(0x12);
    if (!epd_wait_idle(5000)) {
        return;
    }

    epd_write_command(0x11);
    epd_write_data_byte(0x03);

    epd_write_command(0x44);
    epd_write_data_byte(0x01);
    epd_write_data_byte((Q0_EPD_WIDTH + 7) / 8);

    epd_write_command(0x45);
    epd_write_data_byte(0x00);
    epd_write_data_byte(0x00);
    epd_write_data_byte(Q0_EPD_HEIGHT & 0xff);
    epd_write_data_byte((Q0_EPD_HEIGHT >> 8) & 0xff);

    if (!epd_wait_idle(5000)) {
        return;
    }
}

esp_err_t epd_init_bus(void)
{
    if (s_bus_ready) {
        return ESP_OK;
    }

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

    epd_controller_init();

    epd_write_command(0x24);
    epd_write_data(frame, len);

    epd_write_command(0x20);
    if (!epd_wait_idle(60000)) {
        return ESP_ERR_TIMEOUT;
    }

    return ESP_OK;
}

void epd_power_off(void)
{
    if (!s_bus_ready) {
        return;
    }
    epd_write_command(0x10);
    epd_write_data_byte(0x01);
    delay_ms(100);
    gpio_set_level(Q0_EPD_PIN_PWR, 0);
    s_ctrl_inited = false;
}
