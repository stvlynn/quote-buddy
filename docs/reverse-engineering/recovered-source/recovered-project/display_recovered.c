#include "quote0_stock_app.h"

bool quote0_display_init(quote0_app_t *app)
{
    /* Recovered from strings:
     * - EPD_DETECT
     * - UC8251D
     * - UC8151
     * - 初始化UC8251D (%dx%d), border_reg=0x%02X
     * - 初始化UC8151 (%dx%d), border_reg=0x%02X
     * - BUSY超时，尝试重新检测IC型号...
     * - 等待BUSY超时!
     * - 创建显示互斥锁失败
     * - 创建显示队列失败
     * - 创建显示事件组失败（同步等待不可用）
     * - 创建显示任务失败
     */
    app->display_controller = DISPLAY_CTRL_UC8251D;
    return true;
}

void quote0_display_show_window(window_kind_t window)
{
    const char *resource = quote0_window_resource_name(window);

    /* Recovered resource-driven display model:
     * - named .mrc resources are selected by state
     * - WELCOME / REGULAR likely come from server payload, not fixed local .mrc
     */
    (void)resource;
}

void quote0_display_show_qrcode_overlay(const char *data)
{
    (void)data;
    /* Recovered from strings:
     * - 显示配网主图并叠加二维码: %s
     * - 生成二维码: data="%s"
     * - 绘制二维码: modules=%d, scale=%d, pos=(%d,%d), size=%d
     * - >>> 显示 MAC 二维码: %s
     */
}

void quote0_display_update_decorations(quote0_app_t *app)
{
    (void)app;
    /* Recovered from strings:
     * - >>> 电量条显示已开启
     * - >>> 电量条显示已关闭
     * - >>> 显示提示功能已开启
     * - >>> 显示提示功能已关闭
     * - [BATTERY] 电压=%dmV, 电量=%d%%, 条高=%d px
     * - 电量条显示: %s
     * - [时钟模式] 显示低电量提示
     * - [时钟模式] 显示退出提示，2秒内拔电可退出时钟模式
     * - [时钟模式] 新的一分钟，刷新时钟
     */
}
