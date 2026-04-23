#include "quote0_stock_app.h"

#include <string.h>

static void sample_battery(quote0_app_t *app)
{
    app->battery_mv = 3920;
    app->battery_percent = 73;
}

static void detect_wakeup_reason(quote0_app_t *app)
{
    if (app->first_boot) {
        app->wake_reason = WAKE_COLD_BOOT;
    } else {
        app->wake_reason = WAKE_TIMER;
    }
}

static void configure_power_mode(quote0_app_t *app)
{
    if (app->wake_reason == WAKE_VBUS) {
        app->power_mode = POWER_CHARGING;
        app->next_render_ms = 5 * 60 * 1000;
    } else {
        app->power_mode = POWER_BATTERY;
        app->next_render_ms = 3 * 60 * 60 * 1000;
    }
}

void quote0_app_boot(quote0_app_t *app)
{
    memset(app, 0, sizeof(*app));
    app->first_boot = true;
    app->show_battery_bar = true;
    app->show_hint_overlay = true;

    sample_battery(app);
    detect_wakeup_reason(app);
    configure_power_mode(app);
}

void quote0_app_run(quote0_app_t *app)
{
    if (!quote0_display_init(app)) {
        return;
    }

    if (!quote0_init_nvs_and_wifi_state(app)) {
        quote0_display_show_window(WINDOW_ERROR);
        return;
    }

    if (app->battery_percent < 5) {
        quote0_power_handle_critical_battery(app);
        return;
    }

    if (!app->wifi_verified && app->wake_reason == WAKE_TIMER) {
        if (quote0_factory_ota_try(app)) {
            return;
        }
    }

    if (!quote0_wifi_init_async()) {
        if (!quote0_wifi_try_smart_reconnect(app)) {
            quote0_display_show_window(WINDOW_USER_CONF_TIME);
            quote0_power_prepare_sleep(app);
            return;
        }
    }

    app->wifi_connected = true;

    if (!app->wifi_verified) {
        quote0_display_show_window(WINDOW_USER_CONF_INIT);
        quote0_display_show_qrcode_overlay("https://dot.mindreset.tech/app?id=device");

        if (!quote0_ble_start_provisioning(app)) {
            quote0_display_show_window(WINDOW_ERROR);
            return;
        }

        if (!quote0_ble_wait_for_credentials(app)) {
            quote0_ble_stop_provisioning(app);
            quote0_display_show_window(WINDOW_USER_CONF_TIME);
            quote0_power_prepare_sleep(app);
            return;
        }

        quote0_ble_stop_provisioning(app);
        app->wifi_verified = true;
    }

    if (!quote0_mqtt_start(app)) {
        quote0_display_show_window(WINDOW_NO_WIFI_REBOOT);
        quote0_wifi_schedule_retry_timer(app);
        return;
    }

    quote0_mqtt_run_connected_flow(app);
    quote0_wifi_schedule_retry_timer(app);
}
