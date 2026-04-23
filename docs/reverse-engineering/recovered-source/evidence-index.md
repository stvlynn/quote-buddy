# Quote0 Stock 2.0.8 Evidence Index

本文件汇总了从 stock `2.0.8` merged 固件中直接提取到、且对“源码恢复”最有价值的证据点。

## 1. 已确认的任务 / 定时器 / 同步原语

### 任务与后台处理

- `wifi_init`
- `wifi_reconn`
- `创建 WiFi 初始化任务失败`
- `创建异步处理任务失败`
- `创建 OTA 任务失败`
- `创建 UART 命令后台任务失败`
- `创建显示任务失败`

### 定时器

- `hb_timer`
- `status_timer`
- `refresh_timer`
- `clock_sync_d`
- `启动延迟定时器（10秒），让 App 查询连接状态...`
- `[WiFi重连] 定时器已启动，间隔: %ldms (%.1f分钟)`
- `[WiFi重连] 定时器已停止`
- `[定时器] 充电模式定时器已启动`
- `[定时器] 充电模式定时器已停止`
- `[WiFi重连] 智能重连失败，启动周期性重连定时器`
- `[WiFi重连] 定时器触发，尝试智能重连（扫描已知网络）...`

### 同步原语

- `tx_idle_sem create error`
- `创建事件组失败`
- `创建互斥锁失败`
- `创建消息队列失败`
- `创建显示互斥锁失败`
- `创建显示队列失败`
- `创建显示事件组失败（同步等待不可用）`
- `获取显示互斥锁超时`
- `[ASYNC] 显示队列已满，回退同步显示`
- `MQTT 异步处理任务启动`
- `异步处理任务已创建 (stack=%d)`
- `UART 命令后台任务启动 (%s)`

这说明原厂应用并不是简单单线程轮询，而是一个基于 **FreeRTOS task + queue + mutex + event group + esp_timer** 的异步系统。

## 2. NVS 与配网状态

- `初始化 NVS...`
- `NVS 需要擦除`
- `NVS 初始化成功`
- `NVS 初始化失败: %s`
- `wifi_verified`
- `nvs.net80211`
- `配网检查: 未配网（无 SSID）`
- `配网检查: 发现未验证的凭据（SSID='%s'），可能是上次配网中断`
- `残留的 Wi-Fi 凭据已清除（NVS）`
- `Wi-Fi 凭据已保存到 NVS`
- `Wi-Fi 凭据已清除 (nvs.net80211)`

这说明原始源码里至少存在：

- NVS 初始化模块
- Wi-Fi 凭据完整性检查
- `wifi_verified` 标志位
- 配网中断后的残留凭据清理逻辑

## 3. BLE 配网端点

- `prov-ctrl`
- `prov-config`
- `prov-scan`
- `prov-session`
- `{"prov":{"ver":"v1.1","cap":["wifi_scan"]}}`
- `BLE 客户端已连接，等待安全会话...`
- `✓ 安全会话已建立，等待 Wi-Fi 凭据...`
- `BLE 断开 (安全会话已建立，但未收到凭据)`
- `BLE 断开 (安全会话未建立)`

这非常像 **ESP-IDF BLE Wi-Fi provisioning** 的定制封装。

## 4. MQTT 内容流与远端状态机

- `启动 MQTT 连接`
- `启动 MQTT 客户端...`
- `MQTT 初始化失败: %s`
- `MQTT 已由 WiFi 事件处理器初始化，继续握手流程`
- `MQTT 连接成功!`
- `首次启动：发送 USER_INIT 心跳，请求 WELCOME 窗口`
- `将在接收WELCOME窗口后（或超时后）请求REGULAR窗口`
- `正常启动：发送 IDLE 心跳，请求 REGULAR 窗口`
- `[MQTT] 已收到 WELCOME 窗口`
- `[MQTT] 请求 REGULAR 窗口`
- `[MQTT] 已收到 REGULAR 窗口`
- `[MQTT] FETCH_CONTENT 已处理，等待 SET_WINDOW...`
- `[MQTT] SET_WINDOW 已处理: border=%d, len=%d`
- `[MQTT] SET_CONFIG 已处理: available=%d, reset=%d`
- `[MQTT] 屏幕刷新完成，发送 IDLE 心跳`
- `[MQTT] 未知指令 (request_id=%s)`

这说明服务端-设备协议最少包含：

- 心跳类型：`USER_INIT` / `IDLE`
- 窗口类型：`WELCOME` / `REGULAR`
- 下行控制：`SET_WINDOW` / `SET_CONFIG`
- 拉取动作：`FETCH_CONTENT`
- 可能存在 `request_id` 级别的关联请求

## 5. 显示子系统与资源

### 控制器 / 驱动

- `EPD_DETECT`
- `UC8251D`
- `UC8151`
- `初始化UC8251D (%dx%d), border_reg=0x%02X`
- `初始化UC8151 (%dx%d), border_reg=0x%02X`
- `BUSY超时，尝试重新检测IC型号...`
- `等待BUSY超时!`
- `Power on (0x04)，等待 BUSY...`

### 覆盖层 / 辅助绘制

- `显示配网主图并叠加二维码: %s`
- `生成二维码: data="%s"`
- `绘制二维码: modules=%d, scale=%d, pos=(%d,%d), size=%d`
- `电量条显示: %s`
- `[BATTERY] 电压=%dmV, 电量=%d%%, 条高=%d px`
- `>>> 电量条显示已开启`
- `>>> 电量条显示已关闭`
- `>>> 显示提示功能已开启`
- `>>> 显示提示功能已关闭`
- `>>> 显示 MAC 二维码: %s`

### MRC 资源名

- `HEALTH_BATT_LOW.mrc`
- `CLOCK_CONF_TIPS.mrc`
- `USER_CONF_TIME.mrc`
- `USER_CONF_INIT.mrc`
- `NO_WIFI_REBOOT.mrc`
- `SYS_REBOOT.mrc`

这说明原厂项目大概率内置了一组“模板化静态画面资源”，通过 `.mrc` 资源名驱动渲染。

## 6. 电源 / VBUS / 睡眠路径

- `VBUS GPIO 初始化失败: %s`
- `已有 task 在等待 VBUS 事件，拒绝并发等待`
- `VBUS 抖动/快速插拔：已恢复插电，忽略本次拔电事件`
- `VBUS 已变低（拔电确认），waited_ms=%lu`
- `进入 deep sleep：等待 VBUS(GPIO%d) 拉高（插电）唤醒（当前电平=%d）`
- `进入 deep sleep：等待 VBUS(GPIO%d) 拉高（插电）唤醒`
- `[极低电量] 电池电量极低，准备进入保护性睡眠`
- `[极低电量] OTA 正在进行 (state=%d)，取消睡眠`
- `[极低电量] 发送 SLEEP 心跳...`
- `[极低电量] 等待 SET_CONFIG 响应（最多 30 秒）...`
- `[极低电量] 已收到 SET_CONFIG 响应`
- `[极低电量] SET_CONFIG 响应超时，继续进入睡眠`
- `[极低电量] MQTT 未连接，跳过心跳发送`
- `[极低电量] 进入深度睡眠，仅等待插电唤醒`
- `[极低电量] 请插入电源充电以唤醒设备`

这说明原厂固件存在一个 **低电量保护子状态机**，并且会在睡眠前与云端尝试同步一次配置状态。

## 7. 工厂 OTA

- `MindReset_Factory`
- `[工厂OTA] 定时唤醒，设备未配对，尝试工厂OTA...`
- `[工厂OTA] 开始扫描附近 Wi-Fi...`
- `[工厂OTA] 扫描到 %d 个 AP`
- `[工厂OTA]   #%d  SSID="%s"  RSSI=%d`
- `[工厂OTA] 未找到工厂 Wi-Fi "%s"，继续睡眠`
- `[工厂OTA] 发现工厂 Wi-Fi "%s"，尝试连接...`
- `[工厂OTA] Wi-Fi 连接成功，初始化 OTA 模块...`
- `[工厂OTA] 开始执行 OTA 更新...`
- `[工厂OTA] OTA 任务已启动，等待完成...`
- `[工厂OTA] OTA 成功，设备即将重启`
- `[工厂OTA] OTA 失败 (state=%d)`
- `[工厂OTA] OTA 超时 (5分钟)`
- `[工厂OTA] OTA 启动失败: %d`
- `[工厂OTA] 工厂OTA未完成，%d天后再次尝试`
- `SYS_NEED_UPDATE.mrc`
- `SYS_UPDATE.mrc`

## 8. 结论

基于这些证据，现在能相当确定地恢复出：

- 模块划分
- 任务与定时器模型
- 主要状态机
- 命令面与资源面
- 配网 / OTA / 显示 / 睡眠的主控制流

但**仍不能“证明到 100%”** 的部分包括：

- 原厂函数名与结构体真实字段顺序
- MQTT topic、payload schema、鉴权细节
- `.mrc` 资源文件格式和具体绘制参数
- BLE 安全会话和加密实现细节
- 某些条件分支中的阈值常量与超时常量
