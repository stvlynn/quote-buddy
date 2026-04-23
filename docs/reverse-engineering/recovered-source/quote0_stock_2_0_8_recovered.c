/*
 * Quote0 stock firmware 2.0.8 - recovered source skeleton
 *
 * Source basis:
 * - docs/reverse-engineering/stock-firmware-reverse-engineering.md
 * - docs/hardware/hardware-overview.md
 * - docs/firmware/quote0_usb_firmware.md
 * - printable strings extracted from:
 *   .workspace/2.0.8_merged_3a6e3f3a31dc64da2a0359667af8b566c360b4c589854c7248f793c1370a7718.bin
 *
 * Important:
 * This is NOT the vendor's exact original source.
 * It is a high-confidence reconstruction of the application architecture,
 * control flow, and module boundaries implied by the stock firmware image.
 */

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

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
    WINDOW_USER_CONF_TIME,
    WINDOW_LOW_BATTERY,
    WINDOW_ERROR,
} window_kind_t;

typedef struct {
    bool available;
    bool reset_requested;
    bool update_requested;
} remote_config_t;

typedef struct {
    wake_reason_t wake_reason;
    power_mode_t power_mode;
    display_controller_t display_controller;
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
    uint32_t battery_mv;
    uint8_t battery_percent;
    uint32_t next_render_ms;
    uint32_t next_sleep_ms;
    remote_config_t remote_config;
} quote0_app_t;

static void log_info(const char *msg)
{
    (void)msg;
    /* Placeholder for ESP_LOGI */
}

static void log_warn(const char *msg)
{
    (void)msg;
    /* Placeholder for ESP_LOGW */
}

static void log_error(const char *msg)
{
    (void)msg;
    /* Placeholder for ESP_LOGE */
}

static void sample_battery(quote0_app_t *app)
{
    /* Evidence:
     * "电池电压: %d mV (%d%%)"
     * "[时钟模式] 电池电压: %dmV"
     */
    app->battery_mv = 3920;
    app->battery_percent = 73;
}

static void detect_wakeup_reason(quote0_app_t *app)
{
    /* Evidence:
     * "定时唤醒"
     * "插电唤醒"
     * "唤醒原因: %d (%s)"
     */
    if (app->first_boot) {
        app->wake_reason = WAKE_COLD_BOOT;
        return;
    }

    app->wake_reason = WAKE_TIMER;
}

static void configure_power_mode(quote0_app_t *app)
{
    /* Evidence:
     * "充电模式"
     * "[电源] 切换到电池模式刷新间隔: %ldms (%.1f小时)"
     * "[WiFi重连] 插电，切换到充电模式重连间隔"
     */
    if (app->wake_reason == WAKE_VBUS) {
        app->power_mode = POWER_CHARGING;
        app->next_render_ms = 5 * 60 * 1000;
    } else {
        app->power_mode = POWER_BATTERY;
        app->next_render_ms = 3 * 60 * 60 * 1000;
    }
}

static bool display_detect_controller(quote0_app_t *app)
{
    /* Evidence:
     * "EPD_DETECT"
     * "初始化UC8251D (%dx%d), border_reg=0x%02X"
     * "初始化UC8151 (%dx%d), border_reg=0x%02X"
     * "BUSY超时，尝试重新检测IC型号..."
     */
    app->display_controller = DISPLAY_CTRL_UC8251D;
    return true;
}

static bool display_init(quote0_app_t *app)
{
    if (!display_detect_controller(app)) {
        log_error("display detect failed");
        return false;
    }

    /* Evidence:
     * "创建显示互斥锁失败"
     * "创建显示队列失败"
     * "[ASYNC] 显示队列已满，回退同步显示"
     */
    return true;
}

static void display_show_overlay_qrcode(const char *data)
{
    (void)data;
    /* Evidence:
     * "显示配网主图并叠加二维码: %s"
     * "生成二维码: data=\"%s\""
     * ">>> 显示 MAC 二维码: %s"
     */
}

static void display_show_window(window_kind_t window)
{
    (void)window;
    /* Evidence:
     * "显示图像（GC全刷）"
     * "已显示 Wi-Fi 连接失败提示"
     * "[时钟模式] 显示低电量提示"
     */
}

static void display_update_decorations(quote0_app_t *app)
{
    /* Evidence:
     * ">>> 电量条显示已开启"
     * ">>> 电量条显示已关闭"
     * ">>> 显示提示功能已开启"
     * ">>> 显示提示功能已关闭"
     * "电量条显示: %s"
     */
    (void)app;
}

static bool wifi_init_async(void)
{
    /* Evidence:
     * "启动 WiFi 初始化..."
     * "等待 WiFi 初始化完成..."
     * "WiFi 初始化超时"
     */
    return true;
}

static bool wifi_try_smart_reconnect(quote0_app_t *app)
{
    (void)app;
    /* Evidence:
     * "定时唤醒但Wi-Fi失败，尝试智能重连..."
     * "[定时唤醒] 智能重连成功！继续正常流程"
     * "首次启动/插电唤醒但Wi-Fi失败，尝试智能重连..."
     * "[插电唤醒] 智能重连成功！继续正常流程"
     */
    return false;
}

static void wifi_schedule_retry_timer(quote0_app_t *app)
{
    (void)app;
    /* Evidence:
     * "[WiFi重连] 定时器已启动，间隔: %ldms (%.1f分钟)"
     * "[WiFi重连] 充电模式，使用充电渲染间隔重连"
     * "[WiFi重连] 电池模式，使用电池渲染间隔重连"
     */
}

static bool ble_start_provisioning(quote0_app_t *app)
{
    app->ble_prov_active = true;

    /* Evidence:
     * ">>> 启动 BLE 配网服务"
     * "prov-ctrl"
     * "prov-config"
     * "prov-scan"
     * "prov-session"
     * "{\"prov\":{\"ver\":\"v1.1\",\"cap\":[\"wifi_scan\"]}}"
     */
    return true;
}

static bool ble_wait_for_credentials(quote0_app_t *app)
{
    (void)app;
    /* Evidence:
     * "BLE 客户端已连接，等待安全会话..."
     * "✓ 安全会话已建立，等待 Wi-Fi 凭据..."
     * "BLE 断开 (安全会话已建立，但未收到凭据)"
     * "BLE 断开 (安全会话未建立)"
     */
    return false;
}

static void ble_stop_provisioning(quote0_app_t *app)
{
    app->ble_prov_active = false;

    /* Evidence:
     * "停止 BLE 配网服务..."
     * "BLE 配网服务已停止"
     * "等待 BLE 资源释放..."
     */
}

static bool factory_ota_try(quote0_app_t *app)
{
    (void)app;

    /* Evidence:
     * "[工厂OTA] 定时唤醒，设备未配对，尝试工厂OTA..."
     * "[工厂OTA] 开始扫描附近 Wi-Fi..."
     * "MindReset_Factory"
     * "[工厂OTA] 发现工厂 Wi-Fi \"%s\"，尝试连接..."
     * "[工厂OTA] Wi-Fi 连接成功，初始化 OTA 模块..."
     * "[工厂OTA] 开始执行 OTA 更新..."
     * "[工厂OTA] OTA 成功，设备即将重启"
     */
    return false;
}

static bool mqtt_start(quote0_app_t *app)
{
    /* Evidence:
     * "启动 MQTT 连接"
     * "启动 MQTT 客户端..."
     * "MQTT 初始化失败: %s"
     * "MQTT 连接成功!"
     */
    app->mqtt_connected = true;
    return true;
}

static void mqtt_send_user_init(void)
{
    /* Evidence:
     * "首次启动：发送 USER_INIT 心跳，请求 WELCOME 窗口"
     */
}

static void mqtt_send_idle(void)
{
    /* Evidence:
     * "正常启动：发送 IDLE 心跳，请求 REGULAR 窗口"
     * "[MQTT] 屏幕刷新完成，发送 IDLE 心跳"
     */
}

static void mqtt_request_fetch_content(void)
{
    /* Evidence:
     * "COMMON.FETCH_CONTENT"
     * "[MQTT] FETCH_CONTENT 已处理，等待 SET_WINDOW..."
     */
}

static void mqtt_request_welcome(void)
{
    /* Evidence:
     * "将在接收WELCOME窗口后（或超时后）请求REGULAR窗口"
     * "[MQTT] 已收到 WELCOME 窗口"
     */
}

static void mqtt_request_regular(void)
{
    /* Evidence:
     * "请求 REGULAR 窗口"
     * "[MQTT] 已收到 REGULAR 窗口"
     */
}

static void mqtt_handle_set_window(quote0_app_t *app, bool border, int payload_len)
{
    (void)border;
    (void)payload_len;

    /* Evidence:
     * "[MQTT] SET_WINDOW 已处理: border=%d, len=%d"
     * "已收到 SET_WINDOW"
     * "[定时唤醒] 已收到 SET_WINDOW，准备睡眠"
     */
    app->set_window_received = true;
    display_show_window(WINDOW_REGULAR);
    display_update_decorations(app);
    mqtt_send_idle();
}

static void mqtt_handle_set_config(quote0_app_t *app, bool available, bool reset, bool update)
{
    /* Evidence:
     * "SET_CONFIG: available=%d, reset=%d, update=%d"
     * "[MQTT] SET_CONFIG 已处理: available=%d, reset=%d"
     */
    app->remote_config.available = available;
    app->remote_config.reset_requested = reset;
    app->remote_config.update_requested = update;
}

static void mqtt_handle_connected_flow(quote0_app_t *app)
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
}

static void clock_mode_run(quote0_app_t *app)
{
    /* Evidence:
     * "[时钟模式] 显示低电量提示"
     * "[时钟模式] 进入低电量保护性睡眠"
     * "[时钟模式] 显示退出提示，2秒内拔电可退出时钟模式"
     * "[时钟模式] 新的一分钟，刷新时钟"
     */
    if (app->battery_percent < 10) {
        display_show_window(WINDOW_LOW_BATTERY);
        return;
    }

    app->show_clock_overlay = true;
}

static void power_prepare_sleep(quote0_app_t *app)
{
    /* Evidence:
     * "[定时唤醒] 准备睡眠，下次唤醒: %ldms (%.1f小时)"
     * "[电源] 开始延迟休眠计时，将在 %d 分钟后进入休眠"
     * ">>> 未插电，显示提示并进入深度睡眠..."
     */
    if (app->power_mode == POWER_CHARGING) {
        app->next_sleep_ms = 30 * 60 * 1000;
    } else {
        app->next_sleep_ms = 3 * 60 * 60 * 1000;
    }
}

static bool common_handle_set_network(const char *args)
{
    /* Evidence:
     * "SET_NETWORK 格式错误，应为: COMMON.SET_NETWORK {SSID} {Password}"
     * "COMMON.SET_NETWORK.FAIL"
     */
    return args != NULL && strchr(args, ' ') != NULL;
}

static void common_handle_command(quote0_app_t *app, const char *line)
{
    if (strcmp(line, "COMMON.GET_STATUS") == 0) {
        return;
    }
    if (strcmp(line, "COMMON.CHECK_POINT") == 0) {
        return;
    }
    if (strcmp(line, "COMMON.FETCH_CONTENT") == 0) {
        mqtt_request_fetch_content();
        return;
    }
    if (strncmp(line, "COMMON.SET_NETWORK ", 19) == 0) {
        (void)common_handle_set_network(line + 19);
        return;
    }
    if (strcmp(line, "COMMON.RESET_NETWORK") == 0) {
        app->wifi_verified = false;
        return;
    }
    if (strcmp(line, "COMMON.USER_SLEEP") == 0) {
        power_prepare_sleep(app);
        return;
    }
    if (strcmp(line, "COMMON.REBOOT") == 0) {
        return;
    }
    if (strcmp(line, "COMMON.RESET_ALL") == 0) {
        memset(app, 0, sizeof(*app));
        return;
    }
    if (strcmp(line, "COMMON.RESTORED") == 0) {
        return;
    }
    if (strcmp(line, "COMMON.SHOW_MAC_QRCODE") == 0) {
        display_show_overlay_qrcode("mac://device-id");
        return;
    }
    if (strcmp(line, "COMMON.DISABLE_SLEEP") == 0) {
        app->next_sleep_ms = 0;
        return;
    }
    if (strcmp(line, "COMMON.ENABLE_SLEEP") == 0) {
        power_prepare_sleep(app);
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
        (void)factory_ota_try(app);
        return;
    }
    if (strcmp(line, "COMMON.SET_WINDOW") == 0) {
        mqtt_handle_set_window(app, true, 0);
        return;
    }
    if (strcmp(line, "COMMON.SET_CONFIG") == 0) {
        mqtt_handle_set_config(app, true, false, false);
        return;
    }
}

static void app_run_online_flow(quote0_app_t *app)
{
    if (!mqtt_start(app)) {
        log_warn("mqtt init failed");
        return;
    }

    mqtt_handle_connected_flow(app);

    /* Main event loop recovered from strings:
     * - wait for SET_WINDOW / SET_CONFIG / FETCH_CONTENT
     * - update display
     * - send IDLE heartbeat
     * - react to Wi-Fi recovery
     */
    while (app->mqtt_connected) {
        if (!app->set_window_received) {
            mqtt_request_fetch_content();
        }
        power_prepare_sleep(app);
        break;
    }
}

void app_main(void)
{
    quote0_app_t app;
    memset(&app, 0, sizeof(app));

    app.first_boot = true;
    app.show_battery_bar = true;
    app.show_hint_overlay = true;

    sample_battery(&app);
    detect_wakeup_reason(&app);
    configure_power_mode(&app);

    if (!display_init(&app)) {
        log_error("display init failed");
        return;
    }

    if (app.clock_mode_enabled) {
        clock_mode_run(&app);
        return;
    }

    if (!app.wifi_verified && app.wake_reason == WAKE_TIMER) {
        if (factory_ota_try(&app)) {
            return;
        }
    }

    if (!wifi_init_async()) {
        if (!wifi_try_smart_reconnect(&app)) {
            display_show_window(WINDOW_USER_CONF_TIME);
            power_prepare_sleep(&app);
            return;
        }
    }

    app.wifi_connected = true;

    if (!app.wifi_verified) {
        if (!ble_start_provisioning(&app)) {
            display_show_window(WINDOW_ERROR);
            return;
        }

        display_show_overlay_qrcode("https://dot.mindreset.tech/app?id=device");

        if (!ble_wait_for_credentials(&app)) {
            ble_stop_provisioning(&app);
            display_show_window(WINDOW_USER_CONF_TIME);
            power_prepare_sleep(&app);
            return;
        }

        ble_stop_provisioning(&app);
        app.wifi_verified = true;
    }

    app_run_online_flow(&app);
    wifi_schedule_retry_timer(&app);
}
