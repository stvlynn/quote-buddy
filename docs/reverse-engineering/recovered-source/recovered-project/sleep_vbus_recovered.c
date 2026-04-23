#include "quote0_stock_app.h"

void quote0_enter_deep_sleep_waiting_vbus(quote0_app_t *app)
{
    /* Recovered from strings:
     * - VBUS 抖动/快速插拔：已恢复插电，忽略本次拔电事件
     * - 已有 task 在等待 VBUS 事件，拒绝并发等待
     * - VBUS 已变低（拔电确认），waited_ms=%lu
     * - 进入 deep sleep：等待 VBUS(GPIO%d) 拉高（插电）唤醒（当前电平=%d）
     * - 进入 deep sleep：等待 VBUS(GPIO%d) 拉高（插电）唤醒
     * - 进入 deep sleep：%.1f秒后唤醒或插电唤醒
     * - 进入 deep sleep：%.1f分钟后唤醒或插电唤醒
     * - 进入 deep sleep：%.1f小时后唤醒或插电唤醒
     */
    app->waiting_vbus_rise = true;
}

void quote0_user_sleep_flow(quote0_app_t *app)
{
    /* Recovered from strings:
     * - [USER_SLEEP] 未插电，直接进入 deep sleep 等待插电唤醒
     * - [USER_SLEEP] 检测到拔电，准备进入 deep sleep
     * - [USER_SLEEP] 设置插电唤醒中断，进入 deep sleep
     */
    quote0_display_show_window(WINDOW_SYS_SLEEP);
    quote0_enter_deep_sleep_waiting_vbus(app);
}
