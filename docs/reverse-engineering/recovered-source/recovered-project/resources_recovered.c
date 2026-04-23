#include "quote0_stock_app.h"

const char *quote0_window_resource_name(window_kind_t window)
{
    switch (window) {
    case WINDOW_USER_CONF_INIT:
        return "USER_CONF_INIT.mrc";
    case WINDOW_USER_CONF_TIME:
        return "USER_CONF_TIME.mrc";
    case WINDOW_USER_CONF_PROV:
        return "USER_CONF_PROV.mrc";
    case WINDOW_WIFI_AUTH_ERROR:
        return "WIFI_AUTH_ERROR.mrc";
    case WINDOW_NO_WIFI_REBOOT:
        return "NO_WIFI_REBOOT.mrc";
    case WINDOW_SYS_REBOOT:
        return "SYS_REBOOT.mrc";
    case WINDOW_SYS_NEED_UPDATE:
        return "SYS_NEED_UPDATE.mrc";
    case WINDOW_SYS_UPDATE:
        return "SYS_UPDATE.mrc";
    case WINDOW_SYS_SLEEP:
        return "SYS_SLEEP.mrc";
    case WINDOW_RESET_ALL:
        return "RESET_ALL.mrc";
    case WINDOW_RESTORED:
        return "RESTORED.mrc";
    case WINDOW_HEALTH_BATT_LOW:
        return "HEALTH_BATT_LOW.mrc";
    case WINDOW_HEALTH_TEMP_HIGH:
        return "HEALTH_TEMP_HIGH.mrc";
    case WINDOW_CLOCK_CONF_TIPS:
        return "CLOCK_CONF_TIPS.mrc";
    case WINDOW_CLOCK_BACKGROUND:
        return "CLOCK_BACKGROUND.mrc";
    case WINDOW_WELCOME:
    case WINDOW_REGULAR:
    case WINDOW_NONE:
    case WINDOW_ERROR:
    default:
        return NULL;
    }
}
