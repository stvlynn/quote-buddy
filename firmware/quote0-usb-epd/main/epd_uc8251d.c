/*
 * Quote/0 e-paper driver — UC8251D full refresh path.
 *
 * ESP-IDF logging is disabled in sdkconfig.defaults (CONFIG_LOG_DEFAULT_LEVEL_NONE,
 * CONFIG_ESP_CONSOLE_NONE), so debugging is entirely piggy-backed on the USB text
 * protocol: every major step of a refresh updates `s_last_diag`, which is then
 * returned to the host as part of the protocol reply.
 *
 * Bring-up history is recorded in docs/firmware/quote0_usb_firmware.md.
 */

#include "epd_uc8251d.h"

#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_check.h"
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

#include "quote0_pins.h"

#define EPD_SPI_HOST SPI2_HOST
#define EPD_SPI_CLOCK_HZ (15 * 1000 * 1000)
#define EPD_WAIT_INIT_MS 1800
#define EPD_WAIT_PWR_MS 3500
#define EPD_WAIT_REFRESH_MS 8000

/* ------------------------------------------------------------------------- */
/* State                                                                      */
/* ------------------------------------------------------------------------- */

static spi_device_handle_t s_epd;
static bool s_bus_ready;
static SemaphoreHandle_t s_hw_mutex;
static char s_last_diag[96] = "stage=boot mode=none busy=-1 err=0";

/* ------------------------------------------------------------------------- */
/* Utility                                                                    */
/* ------------------------------------------------------------------------- */

static void delay_ms(uint32_t ms)
{
    if (ms < 5) {
        esp_rom_delay_us(ms * 1000U);
    } else {
        vTaskDelay(pdMS_TO_TICKS(ms));
    }
}

static int epd_pin_level(int pin)
{
    return gpio_get_level((gpio_num_t)pin);
}

static void epd_set_diag(const char *stage, const char *mode, int busy, esp_err_t err)
{
    snprintf(s_last_diag, sizeof(s_last_diag),
             "stage=%s mode=%s busy=%d err=%d",
             stage, mode, busy, (int)err);
}

const char *epd_last_diag(void)
{
    return s_last_diag;
}

void epd_format_status(char *buf, size_t len)
{
    if (buf == NULL || len == 0) {
        return;
    }
    snprintf(buf, len,
             "%s bus=%d pins=busy:%d,pwr:%d,rst:%d,dc:%d,cs:%d",
             s_last_diag,
             s_bus_ready ? 1 : 0,
             epd_pin_level(Q0_EPD_PIN_BUSY),
             epd_pin_level(Q0_EPD_PIN_PWR),
             epd_pin_level(Q0_EPD_PIN_RST),
             epd_pin_level(Q0_EPD_PIN_DC),
             epd_pin_level(Q0_EPD_PIN_CS));
}

/* ------------------------------------------------------------------------- */
/* Low-level SPI / GPIO                                                       */
/* ------------------------------------------------------------------------- */

static void epd_write_command(uint8_t command)
{
    gpio_set_level(Q0_EPD_PIN_DC, 0);
    gpio_set_level(Q0_EPD_PIN_CS, 0);
    spi_transaction_t tx = {.length = 8, .tx_buffer = &command};
    (void)spi_device_polling_transmit(s_epd, &tx);
    gpio_set_level(Q0_EPD_PIN_CS, 1);
}

static void epd_write_data_byte(uint8_t data)
{
    gpio_set_level(Q0_EPD_PIN_DC, 1);
    gpio_set_level(Q0_EPD_PIN_CS, 0);
    spi_transaction_t tx = {.length = 8, .tx_buffer = &data};
    (void)spi_device_polling_transmit(s_epd, &tx);
    gpio_set_level(Q0_EPD_PIN_CS, 1);
}

static void epd_write_data(const uint8_t *data, size_t len)
{
    gpio_set_level(Q0_EPD_PIN_DC, 1);
    gpio_set_level(Q0_EPD_PIN_CS, 0);
    while (len > 0) {
        size_t chunk = len > 4096 ? 4096 : len;
        spi_transaction_t tx = {.length = chunk * 8, .tx_buffer = data};
        (void)spi_device_polling_transmit(s_epd, &tx);
        data += chunk;
        len -= chunk;
    }
    gpio_set_level(Q0_EPD_PIN_CS, 1);
}

/* ------------------------------------------------------------------------- */
/* Power and reset sequencing                                                 */
/* ------------------------------------------------------------------------- */

static void epd_power_cycle(void)
{
    /* PWR is active-high on the live Quote/0 unit. */
    gpio_set_level(Q0_EPD_PIN_PWR, 0);
    gpio_set_level(Q0_EPD_PIN_RST, 0);
    delay_ms(80);
    gpio_set_level(Q0_EPD_PIN_PWR, 1);
    delay_ms(120);
}

static void epd_reset_short(void)
{
    gpio_set_level(Q0_EPD_PIN_RST, 1);
    delay_ms(10);
    gpio_set_level(Q0_EPD_PIN_RST, 0);
    delay_ms(10);
    gpio_set_level(Q0_EPD_PIN_RST, 1);
    delay_ms(20);
}

/*
 * BUSY polarity on UC8251D is LOW-while-busy, HIGH-when-idle.  The panel BUSY
 * line is not externally pulled, so without an internal pull-up the input
 * reads whatever noise is nearby and epd_wait_idle_level() returns instantly —
 * producing a "refresh succeeded" result in well under the physical refresh
 * time.  epd_init_bus() configures GPIO_PULLUP_ENABLE; keep it that way.
 */
static bool epd_wait_idle_poll71(uint32_t timeout_ms)
{
    uint32_t elapsed = 0;
    while (elapsed < timeout_ms) {
        epd_write_command(0x71);
        if (epd_pin_level(Q0_EPD_PIN_BUSY) != 0) {
            delay_ms(40);
            return true;
        }
        delay_ms(10);
        elapsed += 10;
    }
    return false;
}

static bool epd_wait_idle_level(uint32_t timeout_ms)
{
    uint32_t elapsed = 0;
    while (epd_pin_level(Q0_EPD_PIN_BUSY) == 0) {
        if (elapsed >= timeout_ms) {
            return false;
        }
        delay_ms(10);
        elapsed += 10;
    }
    delay_ms(40);
    return true;
}

/* ------------------------------------------------------------------------- */
/* UC8251D full-refresh                                                       */
/* ------------------------------------------------------------------------- */

static uint8_t s_white_frame[Q0_EPD_FRAME_BYTES];
static uint8_t s_inverted_frame[Q0_EPD_FRAME_BYTES];

static void epd_prepare_static_buffers(void)
{
    static bool prepared = false;
    if (prepared) {
        return;
    }
    memset(s_white_frame, 0xff, sizeof(s_white_frame));
    prepared = true;
}

/*
 * The tested Quote/0 panel requires framebuffer inversion: bits-to-dark in the
 * host's "1 = white" convention must be flipped before being sent over SPI.
 * See README.md (`On the tested Quote/0 unit ...`).
 */
static const uint8_t *epd_invert_frame(const uint8_t *frame)
{
    for (size_t i = 0; i < Q0_EPD_FRAME_BYTES; ++i) {
        s_inverted_frame[i] = (uint8_t)~frame[i];
    }
    return s_inverted_frame;
}

static esp_err_t epd_refresh(const uint8_t *frame)
{
    const uint8_t *payload = epd_invert_frame(frame);

    epd_set_diag("power-cycle", "full", epd_pin_level(Q0_EPD_PIN_BUSY), ESP_OK);
    epd_power_cycle();
    epd_reset_short();

    epd_set_diag("wait-before-init", "full", epd_pin_level(Q0_EPD_PIN_BUSY), ESP_OK);
    if (!epd_wait_idle_poll71(EPD_WAIT_INIT_MS)) {
        epd_set_diag("timeout-before-init", "full",
                     epd_pin_level(Q0_EPD_PIN_BUSY), ESP_ERR_TIMEOUT);
        return ESP_ERR_TIMEOUT;
    }

    /* PSR (panel setting) */
    epd_write_command(0x00);
    epd_write_data_byte(0xf3);
    epd_write_data_byte(0x0e);

    /* Power setting */
    epd_write_command(0x01);
    epd_write_data_byte(0x03);
    epd_write_data_byte(0x00);
    epd_write_data_byte(0x3f);
    epd_write_data_byte(0x3f);
    epd_write_data_byte(0x03);

    /* Booster soft start */
    epd_write_command(0x06);
    epd_write_data_byte(0x17);
    epd_write_data_byte(0x17);
    epd_write_data_byte(0x17);

    /* Resolution setting */
    epd_write_command(0x61);
    epd_write_data_byte(0x98);
    epd_write_data_byte(0x01);
    epd_write_data_byte(0x28);

    /* PLL control */
    epd_write_command(0x30);
    epd_write_data_byte(0x1b);

    /* TCON */
    epd_write_command(0x60);
    epd_write_data_byte(0x22);

    /* VCOM_DC */
    epd_write_command(0x82);
    epd_write_data_byte(0x00);

    /* Power off sequence slot (unused but required to prime the register) */
    epd_write_command(0x03);
    epd_write_data_byte(0x10);

    /* VCOM and data interval: 0x97 = white border, matches the stock firmware. */
    epd_write_command(0x50);
    epd_write_data_byte(0x97);

    epd_set_diag("power-on", "full", epd_pin_level(Q0_EPD_PIN_BUSY), ESP_OK);
    epd_write_command(0x04);
    delay_ms(100);
    if (!epd_wait_idle_poll71(EPD_WAIT_PWR_MS)) {
        epd_set_diag("timeout-after-0x04", "full",
                     epd_pin_level(Q0_EPD_PIN_BUSY), ESP_ERR_TIMEOUT);
        return ESP_ERR_TIMEOUT;
    }

    /* DTM1 holds the previous frame.  Sending an all-white frame guarantees a
     * clean start regardless of what was on the panel before. */
    epd_set_diag("write-old", "full", epd_pin_level(Q0_EPD_PIN_BUSY), ESP_OK);
    epd_write_command(0x10);
    epd_write_data(s_white_frame, sizeof(s_white_frame));

    /* DTM2 is the new frame. */
    epd_set_diag("write-new", "full", epd_pin_level(Q0_EPD_PIN_BUSY), ESP_OK);
    epd_write_command(0x13);
    epd_write_data(payload, Q0_EPD_FRAME_BYTES);

    epd_set_diag("refresh", "full", epd_pin_level(Q0_EPD_PIN_BUSY), ESP_OK);
    epd_write_command(0x12);
    delay_ms(100);
    if (!epd_wait_idle_level(EPD_WAIT_REFRESH_MS)) {
        epd_set_diag("timeout-refresh", "full",
                     epd_pin_level(Q0_EPD_PIN_BUSY), ESP_ERR_TIMEOUT);
        return ESP_ERR_TIMEOUT;
    }

    epd_set_diag("done", "full", epd_pin_level(Q0_EPD_PIN_BUSY), ESP_OK);
    return ESP_OK;
}

/* ------------------------------------------------------------------------- */
/* Public API                                                                 */
/* ------------------------------------------------------------------------- */

esp_err_t epd_init_bus(void)
{
    if (s_bus_ready) {
        return ESP_OK;
    }

    if (s_hw_mutex == NULL) {
        s_hw_mutex = xSemaphoreCreateMutex();
        if (s_hw_mutex == NULL) {
            return ESP_ERR_NO_MEM;
        }
    }

    /* Drive the four control pins.  INPUT_OUTPUT keeps the input buffer
     * enabled so gpio_get_level() reports the real pin level, which is what
     * the STATUS protocol command surfaces. */
    gpio_config_t outputs = {
        .pin_bit_mask = (1ULL << Q0_EPD_PIN_DC) |
                        (1ULL << Q0_EPD_PIN_CS) |
                        (1ULL << Q0_EPD_PIN_RST) |
                        (1ULL << Q0_EPD_PIN_PWR),
        .mode = GPIO_MODE_INPUT_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_RETURN_ON_ERROR(gpio_config(&outputs), "epd", "gpio_config outputs");
    gpio_set_level(Q0_EPD_PIN_CS, 1);
    gpio_set_level(Q0_EPD_PIN_RST, 1);
    gpio_set_level(Q0_EPD_PIN_PWR, 0);

    /* BUSY is active-low and has no external pull on the live unit; without
     * the internal pull-up the wait loops trip on noise instead of the real
     * controller signal.  This was the single fix that made refreshes work. */
    gpio_config_t busy = {
        .pin_bit_mask = (1ULL << Q0_EPD_PIN_BUSY),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
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
    epd_prepare_static_buffers();
    return ESP_OK;
}

esp_err_t epd_display_frame(const uint8_t *frame, size_t len)
{
    if (frame == NULL || len != Q0_EPD_FRAME_BYTES) {
        epd_set_diag("invalid-arg", "full", -1, ESP_ERR_INVALID_ARG);
        return ESP_ERR_INVALID_ARG;
    }

    ESP_RETURN_ON_ERROR(epd_init_bus(), "epd", "epd_init_bus");
    (void)xSemaphoreTake(s_hw_mutex, portMAX_DELAY);
    esp_err_t err = epd_refresh(frame);
    (void)xSemaphoreGive(s_hw_mutex);
    return err;
}

esp_err_t epd_set_output_pin(const char *pin_name, int level)
{
    if (pin_name == NULL || (level != 0 && level != 1)) {
        epd_set_diag("gpio-invalid", "gpio",
                     epd_pin_level(Q0_EPD_PIN_BUSY), ESP_ERR_INVALID_ARG);
        return ESP_ERR_INVALID_ARG;
    }

    int pin = -1;
    if (strcmp(pin_name, "PWR") == 0) {
        pin = Q0_EPD_PIN_PWR;
    } else if (strcmp(pin_name, "RST") == 0) {
        pin = Q0_EPD_PIN_RST;
    } else if (strcmp(pin_name, "DC") == 0) {
        pin = Q0_EPD_PIN_DC;
    } else if (strcmp(pin_name, "CS") == 0) {
        pin = Q0_EPD_PIN_CS;
    } else {
        epd_set_diag("gpio-unknown", pin_name,
                     epd_pin_level(Q0_EPD_PIN_BUSY), ESP_ERR_INVALID_ARG);
        return ESP_ERR_INVALID_ARG;
    }

    ESP_RETURN_ON_ERROR(epd_init_bus(), "epd", "epd_init_bus");
    (void)xSemaphoreTake(s_hw_mutex, portMAX_DELAY);
    gpio_set_level((gpio_num_t)pin, level);

    char mode[24];
    snprintf(mode, sizeof(mode), "%s=%d", pin_name, level);
    epd_set_diag("gpio-set", mode, epd_pin_level(Q0_EPD_PIN_BUSY), ESP_OK);
    (void)xSemaphoreGive(s_hw_mutex);
    return ESP_OK;
}

void epd_power_off(void)
{
    if (!s_bus_ready) {
        return;
    }
    (void)xSemaphoreTake(s_hw_mutex, portMAX_DELAY);
    epd_write_command(0x10);
    epd_write_data_byte(0x01);
    delay_ms(100);
    gpio_set_level(Q0_EPD_PIN_PWR, 0);
    (void)xSemaphoreGive(s_hw_mutex);
}
