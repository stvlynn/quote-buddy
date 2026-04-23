#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef enum {
    WAKE_UNKNOWN = 0,
    WAKE_COLD_BOOT,
    WAKE_TIMER,
    WAKE_VBUS,
} wake_reason_t;

typedef enum {
    POWER_BATTERY = 0,
    POWER_CHARGING,
} power_mode_t;

typedef enum {
    DISPLAY_CTRL_UNKNOWN = 0,
    DISPLAY_CTRL_UC8251D,
    DISPLAY_CTRL_UC8151,
} display_controller_t;

typedef enum {
    WINDOW_NONE = 0,
    WINDOW_WELCOME,
    WINDOW_REGULAR,
    WINDOW_USER_CONF_INIT,
    WINDOW_USER_CONF_TIME,
    WINDOW_USER_CONF_PROV,
    WINDOW_WIFI_AUTH_ERROR,
    WINDOW_NO_WIFI_REBOOT,
    WINDOW_SYS_REBOOT,
    WINDOW_SYS_NEED_UPDATE,
    WINDOW_SYS_UPDATE,
    WINDOW_SYS_SLEEP,
    WINDOW_RESET_ALL,
    WINDOW_RESTORED,
    WINDOW_HEALTH_BATT_LOW,
    WINDOW_HEALTH_TEMP_HIGH,
    WINDOW_CLOCK_CONF_TIPS,
    WINDOW_CLOCK_BACKGROUND,
    WINDOW_ERROR,
} window_kind_t;

typedef enum {
    APP_MODE_BOOT = 0,
    APP_MODE_PROVISIONING,
    APP_MODE_ONLINE,
    APP_MODE_CLOCK,
    APP_MODE_LOW_BATTERY_SLEEP,
    APP_MODE_FACTORY_OTA,
} quote0_app_mode_t;

typedef enum {
    TASK_WIFI_INIT = 0,
    TASK_WIFI_RECONNECT,
    TASK_MQTT_ASYNC,
    TASK_UART_COMMAND,
    TASK_DISPLAY,
    TASK_OTA,
} quote0_task_name_t;

typedef enum {
    TIMER_HEARTBEAT = 0,
    TIMER_STATUS,
    TIMER_REFRESH,
    TIMER_CLOCK_SYNC_DELAY,
    TIMER_PROV_DELAY,
    TIMER_WIFI_RECONNECT,
} quote0_timer_name_t;

typedef enum {
    EVENT_NONE = 0,
    EVENT_SET_WINDOW = 1 << 0,
    EVENT_SET_CONFIG = 1 << 1,
    EVENT_VBUS_DROP_CONFIRMED = 1 << 2,
    EVENT_WIFI_READY = 1 << 3,
    EVENT_WIFI_RESTORED = 1 << 4,
    EVENT_MQTT_CONNECTED = 1 << 5,
} quote0_event_bits_t;

typedef struct {
    bool available;
    bool reset_requested;
    bool update_requested;
    uint32_t power_render_ms;
    uint32_t battery_render_ms;
} remote_config_t;

typedef struct {
    wake_reason_t wake_reason;
    power_mode_t power_mode;
    display_controller_t display_controller;
    quote0_app_mode_t app_mode;
    window_kind_t current_window;
    bool wifi_verified;
    bool wifi_connected;
    bool mqtt_connected;
    bool ble_prov_active;
    bool first_boot;
    bool clock_mode_enabled;
    bool show_battery_bar;
    bool show_hint_overlay;
    bool show_clock_overlay;
    bool local_image_enabled;
    bool ble_image_enabled;
    bool set_window_received;
    bool set_config_received;
    bool ota_in_progress;
    bool waiting_vbus_rise;
    bool display_queue_available;
    uint32_t event_bits;
    uint32_t battery_mv;
    uint8_t battery_percent;
    uint32_t next_render_ms;
    uint32_t next_sleep_ms;
    remote_config_t remote_config;
} quote0_app_t;

void quote0_app_boot(quote0_app_t *app);
void quote0_app_run(quote0_app_t *app);
void quote0_handle_common_command(quote0_app_t *app, const char *line);

bool quote0_init_nvs_and_wifi_state(quote0_app_t *app);
bool quote0_wifi_init_async(void);
bool quote0_wifi_try_smart_reconnect(quote0_app_t *app);
void quote0_wifi_schedule_retry_timer(quote0_app_t *app);

bool quote0_ble_start_provisioning(quote0_app_t *app);
bool quote0_ble_wait_for_credentials(quote0_app_t *app);
void quote0_ble_stop_provisioning(quote0_app_t *app);

bool quote0_mqtt_start(quote0_app_t *app);
void quote0_mqtt_run_connected_flow(quote0_app_t *app);
void quote0_mqtt_send_sleep_heartbeat(quote0_app_t *app);
void quote0_mqtt_wait_set_config_before_sleep(quote0_app_t *app);

bool quote0_display_init(quote0_app_t *app);
void quote0_display_show_window(window_kind_t window);
void quote0_display_show_qrcode_overlay(const char *data);
void quote0_display_update_decorations(quote0_app_t *app);
const char *quote0_window_resource_name(window_kind_t window);

void quote0_scheduler_boot(quote0_app_t *app);
void quote0_scheduler_update_render_interval(quote0_app_t *app, uint32_t power_render_ms, uint32_t battery_render_ms);
void quote0_scheduler_on_power_mode_change(quote0_app_t *app);

void quote0_uart_command_task_loop(quote0_app_t *app);
void quote0_mqtt_async_task_loop(quote0_app_t *app);
void quote0_display_task_loop(quote0_app_t *app);

bool quote0_factory_ota_try(quote0_app_t *app);
void quote0_power_prepare_sleep(quote0_app_t *app);
void quote0_power_handle_critical_battery(quote0_app_t *app);
void quote0_enter_deep_sleep_waiting_vbus(quote0_app_t *app);
void quote0_user_sleep_flow(quote0_app_t *app);
