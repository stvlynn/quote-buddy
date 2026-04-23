#include "quote0_stock_app.h"

void quote0_power_prepare_sleep(quote0_app_t *app)
{
    if (app->power_mode == POWER_CHARGING) {
        app->next_sleep_ms = 30 * 60 * 1000;
    } else {
        app->next_sleep_ms = 3 * 60 * 60 * 1000;
    }
}

void quote0_power_handle_critical_battery(quote0_app_t *app)
{
    /* Recovered from strings:
     * - [极低电量] 电池电量极低，准备进入保护性睡眠
     * - [极低电量] OTA 正在进行 (state=%d)，取消睡眠
     * - [极低电量] 发送 SLEEP 心跳...
     * - [极低电量] 等待 SET_CONFIG 响应（最多 30 秒）...
     * - [极低电量] 已收到 SET_CONFIG 响应
     * - [极低电量] SET_CONFIG 响应超时，继续进入睡眠
     * - [极低电量] MQTT 未连接，跳过心跳发送
     * - [极低电量] 进入深度睡眠，仅等待插电唤醒
     * - [极低电量] 请插入电源充电以唤醒设备
     * - 进入 deep sleep：等待 VBUS(GPIO%d) 拉高（插电）唤醒
     */
    if (app->ota_in_progress) {
        return;
    }

    quote0_display_show_window(WINDOW_HEALTH_BATT_LOW);

    if (app->mqtt_connected) {
        quote0_display_show_window(WINDOW_SYS_SLEEP);
        quote0_mqtt_send_sleep_heartbeat(app);
        quote0_mqtt_wait_set_config_before_sleep(app);
    }

    app->waiting_vbus_rise = true;
    quote0_power_prepare_sleep(app);
}
