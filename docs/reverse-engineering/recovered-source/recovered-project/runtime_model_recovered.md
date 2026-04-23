# Quote0 Stock Runtime Model (Recovered)

## 核心判断

从 stock `2.0.8` merged 镜像中可以直接确认，原厂应用是一个 **多任务、事件驱动、资源模板化显示** 的 ESP-IDF 工程，而不是单个 `while(1)` 主循环。

## 已确认的后台任务

- `wifi_init`
- `wifi_reconn`
- MQTT 异步处理任务
- UART 命令后台任务
- 显示任务
- OTA 任务

这些任务共同支撑一个“联网、渲染、串口控制、OTA、睡眠管理”并行执行的系统。最值得注意的是，`MQTT` 和 `显示` 都明显不是同步直调，而是经过异步任务或队列。 

## 已确认的定时器

- `hb_timer`
- `status_timer`
- `refresh_timer`
- `clock_sync_d`
- 配网延迟定时器（10 秒）
- Wi-Fi 周期性重连定时器

## 已确认的同步原语

- 事件组
- 消息队列
- 互斥锁
- 显示专用队列 / 互斥锁 / 事件组
- `tx_idle_sem`

## 恢复出的高层状态机

### 1. 启动态

- 初始化 NVS
- 检查 `wifi_verified`
- 采样电池
- 判定唤醒原因
- 初始化显示驱动和显示任务

### 2. 未配网态

- 显示 `USER_CONF_INIT.mrc`
- 启动 BLE 配网服务
- 叠加二维码
- 等待安全会话与 Wi-Fi 凭据
- 失败则显示 `USER_CONF_TIME.mrc`

### 3. 在线内容态

- 初始化 MQTT
- 首次启动发送 `USER_INIT`
- 请求 `WELCOME`
- 再请求 `REGULAR`
- 服务端返回 `SET_WINDOW` / `SET_CONFIG`
- `SET_CONFIG` 可下发 `powerRender` / `battRender`，并可能触发 `Reset=1`
- 刷新屏幕后发送 `IDLE`

### 4. 充电 / 电池调度态

- 充电模式使用较短的 `powerRender` 间隔
- 电池模式使用较长的 `battRender` 间隔
- 可动态更新刷新周期

### 5. 低电量保护态

- 显示 `HEALTH_BATT_LOW.mrc`
- 如 MQTT 在线则先发 `SLEEP` 心跳
- 最多等待 30 秒 `SET_CONFIG` 响应
- 然后进入仅等待插电唤醒的 deep sleep

### 6. 工厂 OTA 态

- 定时唤醒时若未配网，可扫描 `MindReset_Factory`
- 连接后启动 OTA 任务
- 失败则记录并延期若干天再次尝试

## UI 资源模板

当前可直接确认的资源模板包括：

- `USER_CONF_INIT.mrc`
- `USER_CONF_TIME.mrc`
- `USER_CONF_PROV.mrc`
- `WIFI_AUTH_ERROR.mrc`
- `NO_WIFI_REBOOT.mrc`
- `SYS_REBOOT.mrc`
- `SYS_NEED_UPDATE.mrc`
- `SYS_UPDATE.mrc`
- `SYS_SLEEP.mrc`
- `RESET_ALL.mrc`
- `RESTORED.mrc`
- `HEALTH_BATT_LOW.mrc`
- `HEALTH_TEMP_HIGH.mrc`
- `CLOCK_CONF_TIPS.mrc`
- `CLOCK_BACKGROUND.mrc`

## 仍无法百分百证明的部分

- 原厂源文件的真实名字与目录布局
- MQTT topic / payload 的精确 schema
- `.mrc` 文件格式、资源打包方式和像素布局
- 事件组 bit 位的真实定义
- 任务栈大小、优先级和具体调度参数
