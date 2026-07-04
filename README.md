# Atlas NAS Monitor Android 7

中文 | [English](#english)

## 中文

Atlas NAS Monitor Android 7 是一个为旧 Android 7 手机打造的横屏常亮 NAS 监控 App。它使用 React、Vite 和 Capacitor 构建前端界面，使用运行在 NAS 上的 Docker Agent 采集真实系统数据。目标设备是 1280 x 720 横屏手机，用作桌面 NAS / HomeLab 状态屏。

当前版本已经不是纯静态原型：Android App 通过 HTTP 读取 NAS 上的 `atlas-nas-agent`，不会让手机 APK 直接通过 SSH 登录 NAS。

## 当前状态

- 已完成 Android 7 横屏 APK 验证。
- 已完成总览、硬件、设置三个页面。
- 已删除旧的存储、网络、服务、日志占位 Tab。
- 已使用真实 NAS 图片替换硬件页设备图标。
- 已接入 NAS 端 Docker Agent。
- 已支持在设置页配置 NAS 地址、端口、账号、密码、刷新频率、常亮模式、夜间模式。
- 已支持连接测试弹窗和刷新频率应用按钮。
- 已修复 Android 真机弹窗 OK 点击偏移问题。
- 已锁定横屏沉浸式显示，并阻止页面上划滚动。
- 已清理演示假数据：读不到的传感器明确显示“未知”或“不支持”。

## 数据原则

界面中看起来像实时数据的内容必须来自 NAS Agent 或设备 API：

- CPU 使用率、CPU 型号、CPU 频率、核心数来自 `/host/proc`。
- 内存使用率、已用内存、总内存来自 `/host/proc/meminfo`。
- 运行时间来自 `/host/proc/uptime`。
- 网络速率来自 `/host/proc/net/dev` 的采样差值。
- 存储池容量来自 NAS 主机 `df`。
- 硬盘列表来自 `lsblk` 或 `/host/sys/block`。
- Docker 服务来自 Docker socket。
- SMB/CIFS 服务来自主机进程检测。
- 告警和通知来自后端事件生成，不再由前端写死。
- 温度、风扇、电压等传感器如果 NAS 系统没有暴露真实数据，界面显示“未知”或“不支持”，不会伪造正常值。

## 功能

- 系统健康分数
- NAS 运行时间
- CPU 使用率与趋势
- 内存使用率与趋势
- 网络上传 / 下载速率与趋势
- 系统温度
- 存储池使用率
- 真实硬盘列表
- 服务状态检测
- 硬件详情页
- 设置页连接测试
- 刷新频率设置：1 秒、3 秒、5 秒、10 秒、30 秒
- 常亮模式和夜间模式
- Android 7 旧 WebView 兼容

## 技术栈

- React 19
- Vite 6
- Capacitor 6
- Phosphor Icons
- Android Gradle Project
- Node.js Docker Agent

## 项目结构

```text
.
├─ src/                  # React UI 源码
│  └─ assets/            # UI 图片资产
├─ nas-agent/            # NAS 端 Docker 数据采集服务
├─ android/              # Capacitor Android 工程
├─ scripts/              # Android 7 legacy 构建辅助脚本
├─ capacitor.config.json # Capacitor 配置
├─ package.json
└─ README.md
```

## 开发环境

本机开发和打包需要：

- Node.js
- npm
- Android Studio
- Android SDK
- JDK 17
- adb
- Android 7.0+ 真机或模拟器

NAS 端需要：

- Docker
- 可挂载 `/proc`、`/sys`、`/`
- 可挂载 `/var/run/docker.sock`
- 手机和 NAS 位于同一局域网

Android 工程：

- App ID：`com.delix.nasmonitor`
- minSdk：API 24 / Android 7.0
- 横屏固定显示

## 安装依赖

```bash
npm install
```

## 本地预览

```bash
npm run dev
```

设计基准为 1280 x 720 横屏。

## 构建 Android 7 兼容 Web 资源

```bash
npm run build:android
```

这个命令会先执行 Vite 构建，然后运行 `scripts/use-legacy-index.cjs`，让 Android 7 旧 WebView 加载 legacy bundle。

## 同步 Android 工程

```bash
npx cap sync android
```

## 构建 Debug APK

Windows PowerShell 示例：

```powershell
$env:JAVA_HOME="C:\Path\To\jdk-17"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT="$env:ANDROID_HOME"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

cd android
.\gradlew.bat assembleDebug
```

APK 输出位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

安装到手机：

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## NAS Agent 部署

构建镜像：

```bash
cd nas-agent
docker build -t atlas-nas-agent:latest .
```

运行容器：

```bash
docker run -d \
  --name atlas-nas-agent \
  --restart unless-stopped \
  -p 5088:5088 \
  -v /proc:/host/proc:ro \
  -v /sys:/host/sys:ro \
  -v /:/host:ro \
  -v /var/run/docker.sock:/var/run/docker.sock \
  atlas-nas-agent:latest
```

健康检查：

```bash
curl http://NAS_IP:5088/health
```

实时数据：

```bash
curl http://NAS_IP:5088/api/metrics
```

## `/api/metrics` 返回内容

接口会返回：

- `online`
- `cpu`
- `ram`
- `down`
- `up`
- `networkName`
- `uptime`
- `since`
- `health`
- `cpuTemp`
- `boardTemp`
- `fanRpm`
- `memoryUsed`
- `memoryTotal`
- `cpuModel`
- `cpuClock`
- `cpuCores`
- `model`
- `board`
- `bios`
- `voltage`
- `storage`
- `drives`
- `services`
- `alerts`
- `notifications`
- `lastSync`

## 设置页

手机端不需要重新编译就能修改这些连接参数：

- NAS 地址
- NAS 端口
- 账号
- 密码
- 刷新频率
- 常亮模式
- 夜间模式

连接按钮会请求 `/health`，成功或失败都会弹窗提示。失败时会显示返回的错误原因。

## 健康分数

健康分数由 NAS Agent 实时计算，基础分为 100。以下情况会扣分：

- CPU 使用率过高
- 内存使用率过高
- 温度过高
- 存储空间使用率过高
- 硬盘状态异常
- 服务状态异常
- 已知风扇转速异常

未知或不支持的传感器不会被当作异常扣分。

## Android 7 兼容处理

- 使用 `@vitejs/plugin-legacy` 输出旧 WebView 可运行的 bundle。
- 使用 `scripts/use-legacy-index.cjs` 强制 Android 端加载 legacy 资源。
- 避免依赖 Android 7 WebView 不稳定支持的现代 CSS Grid 作为主布局。
- Capacitor Android 使用 HTTP scheme。
- 允许局域网 HTTP 明文请求。
- Java 侧启用沉浸式全屏并在焦点恢复时重新锁定导航栏。
- 前端阻止页面 `touchmove`，避免监控屏被上划拖动。

## 当前限制

- NAS Agent 当前没有鉴权机制，只建议在可信局域网内使用。
- 硬盘 SMART 温度尚未接入；当前硬盘温度显示“未知”。
- 风扇、电压、USB 检测依赖 NAS 系统是否暴露传感器；没有真实通道时显示“不支持”。
- 当前 APK 是 debug 包，不是正式签名发布包。

## 许可证

本项目采用 [PolyForm Noncommercial License 1.0.0](LICENSE)。

允许个人和非商业用途使用、学习、修改和分发本项目。任何商业用途，包括但不限于销售、商业产品集成、商业服务、商业部署或商业再分发，均需事先获得版权所有者的书面授权。

## 常用开发流程

```bash
npm install
npm run build:android
npx cap sync android
```

然后：

```powershell
cd android
.\gradlew.bat assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

## 设计目标

Atlas NAS Monitor Android 7 的目标是把闲置旧手机变成稳定、清晰、低干扰的 NAS 状态屏。它不是完整 NAS 管理后台，而是一个适合横屏常亮、信息密度高、真实数据优先的监控界面。

---

## English

Atlas NAS Monitor Android 7 is a landscape always-on NAS monitoring app for old Android 7 phones. The frontend is built with React, Vite, and Capacitor. Real NAS metrics are collected by a Docker-based agent running on the NAS.

The Android app does not SSH into the NAS directly. It talks to the `atlas-nas-agent` HTTP service over the local network.

## Current Status

- Verified on an Android 7 landscape device.
- Overview, Hardware, and Settings pages are implemented.
- Old placeholder Storage, Network, Services, and Logs tabs were removed.
- The Hardware page uses a realistic NAS product image.
- NAS-side Docker agent is implemented.
- Settings page supports NAS address, port, account, password, refresh interval, keep-awake mode, and night mode.
- Connection test and refresh-apply actions are implemented.
- Android modal OK button hit testing has been fixed.
- Landscape immersive display is locked.
- Fake demo telemetry has been removed. Unsupported or unavailable sensors are shown as `Unknown` or `Unsupported`.

## Data Policy

Any value that looks like live telemetry must come from the NAS Agent or a device API:

- CPU usage, model, clock, and core count come from `/host/proc`.
- Memory usage comes from `/host/proc/meminfo`.
- Uptime comes from `/host/proc/uptime`.
- Network speed is sampled from `/host/proc/net/dev`.
- Storage capacity comes from host `df`.
- Drive list comes from `lsblk` or `/host/sys/block`.
- Docker status comes from the Docker socket.
- SMB/CIFS status comes from host process detection.
- Alerts and notifications are generated by the agent.
- Temperature, fan, voltage, and USB values are not faked. If the NAS does not expose real sensor data, the UI shows `Unknown` or `Unsupported`.

## Features

- System health score
- NAS uptime
- CPU usage and trend
- Memory usage and trend
- Network upload / download speed and trend
- System temperature
- Storage pool usage
- Real drive list
- Service status detection
- Hardware detail page
- Connection settings page
- Refresh interval: 1s, 3s, 5s, 10s, 30s
- Keep-awake mode and night mode
- Android 7 WebView compatibility

## Tech Stack

- React 19
- Vite 6
- Capacitor 6
- Phosphor Icons
- Android Gradle Project
- Node.js Docker Agent

## Project Structure

```text
.
├─ src/                  # React UI source
│  └─ assets/            # UI image assets
├─ nas-agent/            # NAS-side Docker metrics agent
├─ android/              # Capacitor Android project
├─ scripts/              # Android 7 legacy build helper
├─ capacitor.config.json # Capacitor config
├─ package.json
└─ README.md
```

## Requirements

Development and APK build:

- Node.js
- npm
- Android Studio
- Android SDK
- JDK 17
- adb
- Android 7.0+ device or emulator

NAS side:

- Docker
- Host `/proc`, `/sys`, and `/` mounts
- Docker socket mount
- Phone and NAS on the same LAN

Android project:

- App ID: `com.delix.nasmonitor`
- minSdk: API 24 / Android 7.0
- Fixed landscape orientation

## Install Dependencies

```bash
npm install
```

## Local Preview

```bash
npm run dev
```

The target viewport is 1280 x 720 landscape.

## Build Android 7 Compatible Web Assets

```bash
npm run build:android
```

This runs the Vite build and then `scripts/use-legacy-index.cjs`, which makes the Android app load the legacy bundle for old WebView compatibility.

## Sync Android Project

```bash
npx cap sync android
```

## Build Debug APK

Windows PowerShell example:

```powershell
$env:JAVA_HOME="C:\Path\To\jdk-17"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT="$env:ANDROID_HOME"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

cd android
.\gradlew.bat assembleDebug
```

APK output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install on device:

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## NAS Agent Deployment

Build the image:

```bash
cd nas-agent
docker build -t atlas-nas-agent:latest .
```

Run the container:

```bash
docker run -d \
  --name atlas-nas-agent \
  --restart unless-stopped \
  -p 5088:5088 \
  -v /proc:/host/proc:ro \
  -v /sys:/host/sys:ro \
  -v /:/host:ro \
  -v /var/run/docker.sock:/var/run/docker.sock \
  atlas-nas-agent:latest
```

Health check:

```bash
curl http://NAS_IP:5088/health
```

Metrics endpoint:

```bash
curl http://NAS_IP:5088/api/metrics
```

## `/api/metrics` Response

The endpoint returns:

- `online`
- `cpu`
- `ram`
- `down`
- `up`
- `networkName`
- `uptime`
- `since`
- `health`
- `cpuTemp`
- `boardTemp`
- `fanRpm`
- `memoryUsed`
- `memoryTotal`
- `cpuModel`
- `cpuClock`
- `cpuCores`
- `model`
- `board`
- `bios`
- `voltage`
- `storage`
- `drives`
- `services`
- `alerts`
- `notifications`
- `lastSync`

## Settings Page

These values can be changed in the app without recompiling:

- NAS address
- NAS port
- Account
- Password
- Refresh interval
- Keep-awake mode
- Night mode

The Connect button calls `/health`. Success and failure both show a modal message; failures include the returned reason when available.

## Health Score

The health score is calculated by the NAS Agent. It starts from 100 and subtracts points for:

- High CPU usage
- High memory usage
- High temperature
- High storage usage
- Abnormal drive state
- Abnormal service state
- Known abnormal fan speed

Unknown or unsupported sensors do not reduce the score.

## Android 7 Compatibility

- Uses `@vitejs/plugin-legacy`.
- Uses `scripts/use-legacy-index.cjs` to force legacy assets in the Android bundle.
- Avoids relying on modern CSS Grid for the main Android layout.
- Uses Capacitor Android HTTP scheme.
- Allows cleartext LAN HTTP requests.
- Java side re-enters immersive fullscreen when focus returns.
- Frontend blocks `touchmove` to prevent accidental page dragging on the monitoring screen.

## Current Limitations

- NAS Agent has no authentication yet. Use it only inside a trusted LAN.
- Drive SMART temperature is not connected yet; drive temperature shows `Unknown`.
- Fan, voltage, and USB detection depend on whether the NAS exposes real sensor data. Without a real source, the app shows `Unsupported`.
- The current APK is a debug build, not a production-signed release.

## License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).

Personal and non-commercial use, study, modification, and distribution are permitted. Any commercial use, including but not limited to sale, commercial product integration, commercial services, commercial deployment, or commercial redistribution, requires prior written permission from the copyright holder.

## Typical Development Flow

```bash
npm install
npm run build:android
npx cap sync android
```

Then:

```powershell
cd android
.\gradlew.bat assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

## Design Goal

Atlas NAS Monitor Android 7 turns an old phone into a stable, readable, low-distraction NAS status screen. It is not a full NAS administration panel; it is a high-density always-on dashboard that prioritizes truthful live data.
