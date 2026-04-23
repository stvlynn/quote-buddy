#include "quote0_stock_app.h"

#include <stdbool.h>

static bool uart_read_line(char *line, unsigned line_size)
{
    (void)line;
    (void)line_size;
    return false;
}

void quote0_uart_command_task_loop(quote0_app_t *app)
{
    char line[160];

    /* Recovered from strings:
     * - 创建 UART 命令后台任务失败
     * - UART 命令后台任务启动 (%s)
     * - [RX] read error=%d (%s)
     */
    while (uart_read_line(line, sizeof(line))) {
        quote0_handle_common_command(app, line);
    }
}

void quote0_mqtt_async_task_loop(quote0_app_t *app)
{
    /* Recovered from strings:
     * - MQTT 异步处理任务启动
     * - 创建消息队列失败
     * - 创建异步处理任务失败
     * - 异步处理任务已创建 (stack=%d)
     * - [MQTT] 未知指令 (request_id=%s)
     */
    while (app->mqtt_connected) {
        app->event_bits |= EVENT_MQTT_CONNECTED;
        break;
    }
}

void quote0_display_task_loop(quote0_app_t *app)
{
    /* Recovered from strings:
     * - 创建显示互斥锁失败
     * - 创建显示队列失败
     * - 创建显示事件组失败（同步等待不可用）
     * - 创建显示任务失败
     * - 获取显示互斥锁超时
     * - [ASYNC] 显示队列已满，回退同步显示
     */
    if (!app->display_queue_available) {
        return;
    }
}
