# Quote0 Stock 2.0.8 Recovered Source

## 说明

本目录不是厂商泄露的原始源码，也不是通过符号表直接还原出的精确工程。
它是基于以下证据，对 `.workspace/2.0.8_merged_3a6e3f3a31dc64da2a0359667af8b566c360b4c589854c7248f793c1370a7718.bin` 做静态字符串级逆向后，整理出的 **高可信源码骨架**：

- `docs/reverse-engineering/stock-firmware-reverse-engineering.md`
- `docs/hardware/hardware-overview.md`
- `docs/firmware/quote0_usb_firmware.md`
- 二进制中直接可见的中文日志、命令名、OTA 分区名、MQTT / BLE / EPD 相关字符串

## 能恢复到什么程度

当前可以较高可信恢复出以下内容：

- **应用主状态机**：首次启动、插电唤醒、定时唤醒、充电模式、电池模式、延迟休眠
- **联网与配网流程**：Wi-Fi 初始化、智能重连、BLE 配网、凭据等待、连接恢复
- **MQTT 内容模型**：`USER_INIT` / `WELCOME` / `REGULAR` / `SET_WINDOW` / `SET_CONFIG` / `FETCH_CONTENT`
- **显示子系统**：`EPD_DETECT`、`UC8251D` / `UC8151` 双控制器路径、显示队列、二维码、电量条、提示覆盖层
- **工厂 OTA 流程**：扫描 `MindReset_Factory`，联网后执行 OTA，失败后延期再试
- **USB 命令面**：`COMMON.*` 控制命令集

## 不能精确恢复的部分

以下部分在没有完整反汇编数据库或符号信息的前提下，无法 1:1 恢复：

- 原厂函数名、文件名、目录结构
- 结构体精确字段布局
- MQTT payload 的真实 JSON schema
- BLE 安全会话与配网细节实现
- OTA 下载地址、鉴权方式、证书与密钥材料
- 第三方库包装层与厂商私有中间件 API

## 目录内容

- `quote0_stock_2_0_8_recovered.c`
  - 单文件恢复版伪源码，适合快速总览 stock 固件的主行为。

- `evidence-index.md`
  - 二进制中直接可见的关键证据索引，覆盖任务、定时器、事件组、NVS、资源名、OTA 与低电量路径。

- `recovered-project/`
  - 更接近原始工程结构的模块化恢复版。
  - 当前已拆分为 `app_main_recovered.c`、`power_recovered.c`、`provisioning_recovered.c`、`mqtt_recovered.c`、`display_recovered.c`、`common_cmd_recovered.c`、`ota_recovered.c` 与 `quote0_stock_app.h`。

## 已确认的关键证据

### 平台与分区

- `boot.esp32c3`
- `Quote_0_ESP32-C3_IDF`
- `otadata`
- `ota_0`
- `ota_1`

### MQTT / 内容调度

- `启动 MQTT 连接`
- `首次启动：发送 USER_INIT 心跳，请求 WELCOME 窗口`
- `请求 REGULAR 窗口`
- `[MQTT] SET_WINDOW 已处理`
- `[MQTT] SET_CONFIG 已处理`
- `[MQTT] FETCH_CONTENT 已处理，等待 SET_WINDOW...`
- `[MQTT] 屏幕刷新完成，发送 IDLE 心跳`

### Wi-Fi / BLE 配网

- `启动 WiFi 初始化...`
- `配网超时，显示 USER_CONF_TIME 并等待插电`
- `>>> 启动 BLE 配网服务`
- `BLE 客户端已连接，等待安全会话...`
- `✓ 安全会话已建立，等待 Wi-Fi 凭据...`
- `prov-ctrl` / `prov-config` / `prov-scan` / `prov-session`

### 电源与睡眠

- `定时唤醒`
- `插电唤醒`
- `充电模式`
- `延迟休眠`
- `电池电压: %d mV (%d%%)`
- `[时钟模式] 进入低电量保护性睡眠`
- `[电源] 开始延迟休眠计时，将在 %d 分钟后进入休眠`

### 显示与覆盖层

- `EPD_DETECT`
- `初始化UC8251D (%dx%d), border_reg=0x%02X`
- `初始化UC8151 (%dx%d), border_reg=0x%02X`
- `BUSY超时，尝试重新检测IC型号...`
- `创建显示队列失败`
- `显示配网主图并叠加二维码`
- `>>> 显示 MAC 二维码`
- `>>> 电量条显示已开启`

### 工厂 OTA

- `MindReset_Factory`
- `[工厂OTA] 开始扫描附近 Wi-Fi...`
- `[工厂OTA] 发现工厂 Wi-Fi "%s"，尝试连接...`
- `[工厂OTA] 开始执行 OTA 更新...`
- `[工厂OTA] OTA 成功，设备即将重启`

## 使用建议

如果你要继续往“更像原厂项目”的方向推进，建议从以下顺序继续：

1. 以 `quote0_stock_2_0_8_recovered.c` 为基线，拆成 `power.c` / `mqtt.c` / `display.c` / `prov.c` / `ota.c`
2. 再根据 Ghidra / IDA 的交叉引用，把日志点反向对到具体函数
3. 最后再补真实的 MQTT payload 结构、NVS key、事件组、定时器和任务模型
