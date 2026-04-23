#include "quote0_stock_app.h"

void quote0_scheduler_boot(quote0_app_t *app)
{
    /* Recovered runtime pieces:
     * - hb_timer
     * - status_timer
     * - refresh_timer
     * - clock_sync_d
     * - 启动延迟定时器（10秒），让 App 查询连接状态...
     * - [定时器] 充电模式定时器已启动
     * - [定时器] 充电模式定时器已停止
     */
    app->event_bits = EVENT_NONE;
    quote0_scheduler_on_power_mode_change(app);
}

void quote0_scheduler_update_render_interval(quote0_app_t *app, uint32_t power_render_ms, uint32_t battery_render_ms)
{
    /* Recovered from strings:
     * - SET_CONFIG Task: powerRender=%ldms, battRender=%ldms
     * - nextPowerRenderDelay
     * - [定时器] 刷新间隔更新: %ldms (%.1f分钟)
     */
    app->remote_config.power_render_ms = power_render_ms;
    app->remote_config.battery_render_ms = battery_render_ms;

    if (app->power_mode == POWER_CHARGING) {
        app->next_render_ms = power_render_ms;
    } else {
        app->next_render_ms = battery_render_ms;
    }
}

void quote0_scheduler_on_power_mode_change(quote0_app_t *app)
{
    if (app->power_mode == POWER_CHARGING) {
        app->next_render_ms = app->remote_config.power_render_ms != 0
            ? app->remote_config.power_render_ms
            : 5 * 60 * 1000;
    } else {
        app->next_render_ms = app->remote_config.battery_render_ms != 0
            ? app->remote_config.battery_render_ms
            : 3 * 60 * 60 * 1000;
    }
}
