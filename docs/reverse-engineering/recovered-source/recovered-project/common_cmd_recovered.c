#include "quote0_stock_app.h"

#include <string.h>

static bool handle_set_network_args(const char *args)
{
    return args != NULL && strchr(args, ' ') != NULL;
}

void quote0_handle_common_command(quote0_app_t *app, const char *line)
{
    if (strcmp(line, "COMMON.GET_STATUS") == 0) {
        return;
    }
    if (strcmp(line, "COMMON.CHECK_POINT") == 0) {
        return;
    }
    if (strcmp(line, "COMMON.FETCH_CONTENT") == 0) {
        return;
    }
    if (strncmp(line, "COMMON.SET_NETWORK ", 19) == 0) {
        (void)handle_set_network_args(line + 19);
        return;
    }
    if (strcmp(line, "COMMON.RESET_NETWORK") == 0) {
        app->wifi_verified = false;
        return;
    }
    if (strcmp(line, "COMMON.USER_SLEEP") == 0) {
        quote0_user_sleep_flow(app);
        return;
    }
    if (strcmp(line, "COMMON.REBOOT") == 0) {
        quote0_display_show_window(WINDOW_SYS_REBOOT);
        return;
    }
    if (strcmp(line, "COMMON.RESET_ALL") == 0) {
        quote0_display_show_window(WINDOW_RESET_ALL);
        *app = (quote0_app_t){0};
        return;
    }
    if (strcmp(line, "COMMON.RESTORED") == 0) {
        quote0_display_show_window(WINDOW_RESTORED);
        return;
    }
    if (strcmp(line, "COMMON.SHOW_MAC_QRCODE") == 0) {
        quote0_display_show_qrcode_overlay("mac://device-id");
        return;
    }
    if (strcmp(line, "COMMON.DISABLE_SLEEP") == 0) {
        app->next_sleep_ms = 0;
        return;
    }
    if (strcmp(line, "COMMON.ENABLE_SLEEP") == 0) {
        quote0_power_prepare_sleep(app);
        return;
    }
    if (strcmp(line, "COMMON.BLE_IMAGE_ON") == 0) {
        app->ble_image_enabled = true;
        return;
    }
    if (strcmp(line, "COMMON.BLE_IMAGE_OFF") == 0) {
        app->ble_image_enabled = false;
        return;
    }
    if (strcmp(line, "COMMON.LOCAL_IMAGE_ON") == 0) {
        app->local_image_enabled = true;
        return;
    }
    if (strcmp(line, "COMMON.LOCAL_IMAGE_OFF") == 0) {
        app->local_image_enabled = false;
        return;
    }
    if (strcmp(line, "COMMON.SHOW_BATTERY_ON") == 0) {
        app->show_battery_bar = true;
        return;
    }
    if (strcmp(line, "COMMON.SHOW_BATTERY_OFF") == 0) {
        app->show_battery_bar = false;
        return;
    }
    if (strcmp(line, "COMMON.DISPLAY_HINT_ON") == 0) {
        app->show_hint_overlay = true;
        return;
    }
    if (strcmp(line, "COMMON.DISPLAY_HINT_OFF") == 0) {
        app->show_hint_overlay = false;
        return;
    }
    if (strcmp(line, "COMMON.DISPLAY_CLOCK_ON") == 0) {
        app->show_clock_overlay = true;
        return;
    }
    if (strcmp(line, "COMMON.DISPLAY_CLOCK_OFF") == 0) {
        app->show_clock_overlay = false;
        return;
    }
    if (strcmp(line, "COMMON.FORCE_OTA") == 0 || strcmp(line, "COMMON.OTA") == 0) {
        (void)quote0_factory_ota_try(app);
        return;
    }
    if (strcmp(line, "COMMON.SET_WINDOW") == 0) {
        quote0_display_show_window(WINDOW_REGULAR);
        return;
    }
    if (strcmp(line, "COMMON.SET_CONFIG") == 0) {
        app->set_config_received = true;
        return;
    }
}
