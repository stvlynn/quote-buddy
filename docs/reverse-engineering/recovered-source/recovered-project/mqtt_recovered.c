#include "quote0_stock_app.h"

static void mqtt_send_user_init(void)
{
    /* 首次启动：发送 USER_INIT 心跳，请求 WELCOME 窗口 */
}

static void mqtt_send_idle(void)
{
    /* 正常启动：发送 IDLE 心跳，请求 REGULAR 窗口 */
}

static void mqtt_request_welcome(void)
{
    /* 将在接收WELCOME窗口后（或超时后）请求REGULAR窗口 */
}

static void mqtt_request_regular(void)
{
    /* 请求 REGULAR 窗口 */
}

static void mqtt_request_fetch_content(void)
{
    /* [MQTT] FETCH_CONTENT 已处理，等待 SET_WINDOW... */
}

static void mqtt_handle_set_window(quote0_app_t *app)
{
    app->set_window_received = true;
    quote0_display_show_window(WINDOW_REGULAR);
    quote0_display_update_decorations(app);
    mqtt_send_idle();
}

static void mqtt_handle_set_config(quote0_app_t *app)
{
    /* Recovered from strings:
     * - [MQTT] SET_CONFIG 已处理: available=%d, reset=%d
     * - SET_CONFIG Task: powerRender=%ldms, battRender=%ldms
     * - >>> SET_CONFIG.Reset=1：执行 RESET_ALL
     */
    app->set_config_received = true;
    app->remote_config.available = true;
    app->remote_config.reset_requested = false;
    app->remote_config.update_requested = false;
    quote0_scheduler_update_render_interval(app, 5 * 60 * 1000, 3 * 60 * 60 * 1000);
}

bool quote0_mqtt_start(quote0_app_t *app)
{
    /* Recovered from strings:
     * - 启动 MQTT 连接
     * - 启动 MQTT 客户端...
     * - MQTT 初始化失败: %s
     * - MQTT 已由 WiFi 事件处理器初始化，继续握手流程
     * - MQTT 连接成功!
     * - MQTT 连接超时，将在后台重试
     */
    app->mqtt_connected = true;
    return true;
}

void quote0_mqtt_run_connected_flow(quote0_app_t *app)
{
    if (app->first_boot) {
        mqtt_send_user_init();
        mqtt_request_welcome();
        mqtt_request_regular();
        app->first_boot = false;
    } else {
        mqtt_send_idle();
        mqtt_request_regular();
    }

    /* Recovered event flow:
     * - [MQTT] 检测到连接成功，执行延迟握手...
     * - [MQTT] 已收到 WELCOME 窗口
     * - [MQTT] 等待 WELCOME 窗口超时
     * - [MQTT] 请求 REGULAR 窗口
     * - [MQTT] 已收到 REGULAR 窗口
     * - [MQTT] 等待 REGULAR 窗口超时
     * - [MQTT] FETCH_CONTENT 已处理，等待 SET_WINDOW...
     * - [MQTT] SET_WINDOW 已处理: border=%d, len=%d
     * - [MQTT] SET_CONFIG 已处理: available=%d, reset=%d
     * - [MQTT] 未知指令 (request_id=%s)
     * - [MQTT] 屏幕刷新完成，发送 IDLE 心跳
     */
    mqtt_request_fetch_content();
    mqtt_handle_set_window(app);
    mqtt_handle_set_config(app);
}

void quote0_mqtt_send_sleep_heartbeat(quote0_app_t *app)
{
    (void)app;
    /* [极低电量] 发送 SLEEP 心跳... */
}

void quote0_mqtt_wait_set_config_before_sleep(quote0_app_t *app)
{
    /* Recovered from strings:
     * - [极低电量] 等待 SET_CONFIG 响应（最多 30 秒）...
     * - [极低电量] 已收到 SET_CONFIG 响应
     * - [极低电量] SET_CONFIG 响应超时，继续进入睡眠
     */
    app->set_config_received = true;
}
