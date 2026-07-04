import { useEffect, useMemo, useState } from "react";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import nasDeviceImage from "./assets/nas-device.png";
import {
  ArrowDown,
  ArrowUp,
  ArrowsClockwise,
  Bell,
  ClockCounterClockwise,
  Cpu,
  Cube,
  Database,
  FolderSimple,
  GearSix,
  HardDrives,
  Key,
  List,
  Network,
  PlayCircle,
  Pulse,
  ShieldCheck,
  Timer,
  ThermometerSimple,
  WifiHigh,
  X,
} from "@phosphor-icons/react";
import "./styles.css";

const nav = [
  { label: "总览", icon: Pulse },
  { label: "硬件", icon: HardDrives },
  { label: "设置", icon: GearSix },
];

const refreshOptions = ["1 秒", "3 秒", "5 秒", "10 秒", "30 秒"];

const defaultNasAddress = "192.168.1.100";
const defaultNasPort = "5088";
const settingsStorageKey = "atlas-nas-monitor-settings";

const fallbackMetrics = {
  online: false,
  cpu: 0,
  ram: 0,
  down: 0,
  up: 0,
  uptime: "--",
  since: "--",
  health: 0,
  cpuTemp: null,
  boardTemp: null,
  fanRpm: null,
  memoryUsed: "--",
  memoryTotal: "--",
  cpuModel: "未知 CPU",
  cpuClock: "",
  cpuCores: 0,
  model: "Atlas NAS",
  board: "未知主板",
  bios: "未知",
  networkName: "LAN",
  voltage: {
    supported: false,
    cpu: "不支持",
    memory: "不支持",
    v33: "不支持",
    v5: "不支持",
    v12: "不支持",
  },
  storage: {
    usedTb: 0,
    totalTb: 0,
    freeTb: 0,
    type: "未知",
    status: "未知",
  },
  drives: [],
  services: [],
  alerts: [],
  notifications: [],
  lastSync: "--",
};

const serviceIcons = [Cube, FolderSimple, ClockCounterClockwise, PlayCircle];
const serviceTones = ["cyan", "blue", "amber", "blue"];

function normalizeServices(items) {
  return (items && items.length ? items : []).map(function (item, index) {
    const name = String(item.name || "");
    const icon = name.includes("Docker")
      ? Cube
      : name.includes("SMB")
        ? FolderSimple
        : serviceIcons[index] || PlayCircle;
    return Object.assign({}, item, {
      icon,
      tone: item.tone || serviceTones[index] || "blue",
    });
  });
}

function normalizeMetrics(data) {
  const next = data || {};
  return Object.assign({}, fallbackMetrics, next, {
    online: true,
    storage: Object.assign({}, fallbackMetrics.storage, next.storage || {}),
    voltage: Object.assign({}, fallbackMetrics.voltage, next.voltage || {}),
    drives: Array.isArray(next.drives) ? next.drives : fallbackMetrics.drives,
    services: normalizeServices(next.services),
    alerts: Array.isArray(next.alerts) ? next.alerts : fallbackMetrics.alerts,
    notifications: Array.isArray(next.notifications) ? next.notifications : fallbackMetrics.notifications,
  });
}

function normalizeApiBase(address, port) {
  const host = String(address || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const safePort = String(port || "").trim();
  return "http://" + host + (safePort ? ":" + safePort : "");
}

function refreshLabelToMs(label) {
  const seconds = Number(String(label || "").replace(/[^\d]/g, "")) || 5;
  return seconds * 1000;
}

function readStoredSettings() {
  try {
    return JSON.parse(window.localStorage.getItem(settingsStorageKey) || "{}");
  } catch (error) {
    return {};
  }
}

function compactCpuModel(model) {
  const text = String(model || "").replace(/\(R\)|\(TM\)|CPU/gi, "").replace(/\s+/g, " ").trim();
  const coreMatch = text.match(/Intel\s+Core\s+i\d[-\s]?\d+/i);
  const celeronMatch = text.match(/Intel\s+Celeron\s+[A-Z]?\d+/i);
  const clockMatch = text.match(/@\s*[\d.]+\s*GHz/i);
  const base = coreMatch ? coreMatch[0] : celeronMatch ? celeronMatch[0] : text;
  return (base + (clockMatch ? " " + clockMatch[0] : "")).trim();
}

function requestJson(url) {
  function fetchMetrics() {
    return fetch(url, { cache: "no-store" }).then(function (response) {
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      return response.json();
    });
  }

  if (Capacitor.isNativePlatform()) {
    return CapacitorHttp.get({
      url,
      connectTimeout: 4000,
      readTimeout: 4000,
    }).then(function (response) {
      if (response.status < 200 || response.status >= 300) {
        throw new Error("HTTP " + response.status);
      }
      return typeof response.data === "string" ? JSON.parse(response.data) : response.data;
    }).catch(function () {
      return fetchMetrics();
    });
  }

  return fetchMetrics();
}

function requestMetrics(apiBase) {
  return requestJson(apiBase + "/api/metrics");
}

function requestHealth(apiBase) {
  return requestJson(apiBase + "/health");
}

function isKnown(value) {
  return value !== null && value !== undefined && value !== "" && value !== "--";
}

function displayValue(value) {
  return isKnown(value) ? value : "--";
}

function toneForState(value) {
  const text = String(value || "").trim();
  return ["正常", "健康", "运行中", "已检测", "OK"].includes(text) ? "green" : "amber";
}

function formatIsoTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function pushHistory(history, metrics) {
  function append(list, value) {
    const next = list.slice(-45);
    next.push(Number.isFinite(Number(value)) ? Number(value) : null);
    return next;
  }
  return {
    cpu: append(history.cpu, metrics.cpu),
    ram: append(history.ram, metrics.ram),
    down: append(history.down, metrics.down),
    up: append(history.up, metrics.up),
    temp: append(history.temp, metrics.boardTemp),
    cpuTemp: append(history.cpuTemp, metrics.cpuTemp),
    fan: append(history.fan, metrics.fanRpm),
  };
}

function Sparkline({ color = "#32d9ee", values = [], max = 100, fill = false, id = "spark" }) {
  const points = useMemo(function () {
    const clean = values.filter(function (value) {
      return Number.isFinite(Number(value));
    });
    if (!clean.length) return [];
    const localMax = Math.max(Number(max) || 1, ...clean.map(Number), 1);
    const source = values.slice(-46);
    return source.map(function (value, index) {
      if (!Number.isFinite(Number(value))) return null;
      const x = source.length <= 1 ? 0 : (index / (source.length - 1)) * 240;
      const y = 68 - Math.max(0, Math.min(1, Number(value) / localMax)) * 54;
      return { x, y };
    }).filter(Boolean);
  }, [values, max]);

  const path = points
    .map(function (point, index) {
      return (index === 0 ? "M" : "L") + " " + point.x + " " + point.y;
    })
    .join(" ");

  return (
    <svg className="sparkline" viewBox="0 0 240 76" role="img" aria-label="60 second trend">
      <defs>
        <linearGradient id={"fill-" + id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="grid" d="M0 14H240M0 38H240M0 62H240" />
      {path ? <path fill="none" stroke={color} strokeLinecap="round" strokeWidth="3" d={path} /> : null}
      {fill && path ? <path fill={"url(#fill-" + id + ")"} d={path + " L240 76 L0 76 Z"} /> : null}
    </svg>
  );
}

function MetricPanel({ icon: Icon, title, value, suffix, meta, color, tone, values, chartMax, chartId }) {
  return (
    <section className="metric-panel">
      <div className={"metric-icon " + (tone || "")} style={{ "--accent": color }}>
        <Icon size={38} weight="duotone" />
      </div>
      <div className="metric-copy">
        <h3>{title}</h3>
        <div className="metric-value">
          {value}
          <span>{suffix}</span>
        </div>
        <p>{meta}</p>
      </div>
      <div className="metric-chart">
        <div className="chart-scale">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
        <Sparkline color={color} values={values} max={chartMax} id={chartId || title} fill />
        <div className="chart-time">
          <span>60秒前</span>
          <span>现在</span>
        </div>
      </div>
    </section>
  );
}

function Pill({ children, tone = "green" }) {
  return <span className={"pill " + tone}>{children}</span>;
}

function DonutGauge({ value = 65 }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const used = (value / 100) * circumference;

  return (
    <div className="donut" aria-label={"Storage pool " + value + "% used"}>
      <svg viewBox="0 0 120 120" role="img" aria-label={value + "% used"}>
        <circle className="donut-track" cx="60" cy="60" r={radius} />
        <circle
          className="donut-value"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={used + " " + circumference}
        />
      </svg>
      <span>{value}<small>%</small></span>
      <b>已使用</b>
    </div>
  );
}

function HardwarePage({ metrics, history }) {
  const cpuLabel = compactCpuModel(metrics.cpuModel);
  const cpuCoreText = metrics.cpuCores ? metrics.cpuCores + " 核心" : "核心数未知";
  const fanStatus = isKnown(metrics.fanRpm) ? metrics.fanRpm + " RPM" : "不支持";
  const voltageStatus = metrics.voltage && metrics.voltage.supported ? "正常" : "不支持";
  const knownHardwareCount = [
    metrics.board,
    metrics.cpuModel,
    metrics.memoryTotal,
    metrics.fanRpm,
    metrics.voltage && metrics.voltage.supported,
  ].filter(function (item) { return isKnown(item) && item !== false; }).length;
  const hardwareItems = [
    { name: "主板", detail: metrics.board, status: isKnown(metrics.board) ? "已检测" : "未知", tone: "green", icon: Cpu },
    { name: "CPU", detail: cpuLabel + " / " + cpuCoreText, status: isKnown(metrics.cpuModel) ? "已检测" : "未知", tone: "cyan", icon: Cpu },
    { name: "内存", detail: metrics.memoryTotal + " / 已使用 " + metrics.memoryUsed, status: isKnown(metrics.memoryTotal) ? "已检测" : "未知", tone: "green", icon: Database },
    { name: "风扇", detail: isKnown(metrics.fanRpm) ? "转速传感器" : "未接入转速传感器", status: fanStatus, tone: "blue", icon: Network },
    { name: "电源", detail: metrics.voltage && metrics.voltage.supported ? "电压传感器已接入" : "未接入电源传感器", status: voltageStatus, tone: "amber", icon: Key },
    { name: "USB 设备", detail: "未接入 USB 检测", status: "不支持", tone: "purple", icon: HardDrives },
  ];

  return (
    <section className="hardware-page">
      <section className="hardware-card device-info surface">
        <div className="panel-heading">
          <h2>设备信息</h2>
          <Pill>{metrics.online ? "实时" : "离线缓存"}</Pill>
        </div>
        <div className="device-info-body">
          <div className="nas-visual">
            <img src={nasDeviceImage} alt="Atlas NAS" />
          </div>
          <div className="device-specs">
            <div><HardDrives size={22} /><span>型号</span><b>{metrics.model}</b></div>
            <div><Cpu size={22} /><span>处理器</span><b>{cpuLabel}</b></div>
            <div><Database size={22} /><span>内存容量</span><b>{metrics.memoryTotal}</b></div>
            <div><Pulse size={22} /><span>健康分数</span><b className="ok-text">{metrics.health}</b><Pill>OK</Pill></div>
            <div><ShieldCheck size={22} /><span>BIOS 版本</span><b>{metrics.bios}</b></div>
          </div>
        </div>
      </section>

      <section className="hardware-card live-monitor surface">
        <div className="panel-heading">
          <h2>实时监控</h2>
          <span>更新于：{metrics.lastSync}</span>
        </div>
        <div className="monitor-list">
          <div className="monitor-row temp">
            <div className="monitor-icon"><ThermometerSimple size={36} weight="duotone" /></div>
            <div className="monitor-copy"><span>CPU 温度</span><strong>{displayValue(metrics.cpuTemp)}<small>{isKnown(metrics.cpuTemp) ? "°C" : ""}</small></strong></div>
            <div className="monitor-chart"><Sparkline color="#ff9d31" values={history.cpuTemp} max={100} id="cpu-temp" fill /></div>
            <Pill tone={isKnown(metrics.cpuTemp) ? "green" : "amber"}>{isKnown(metrics.cpuTemp) ? "OK" : "未知"}</Pill>
          </div>
          <div className="monitor-row fan">
            <div className="monitor-icon"><Network size={36} weight="duotone" /></div>
            <div className="monitor-copy"><span>风扇转速</span><strong>{displayValue(metrics.fanRpm)}<small>{isKnown(metrics.fanRpm) ? " RPM" : ""}</small></strong></div>
            <div className="monitor-chart"><Sparkline color="#309dff" values={history.fan} max={2500} id="fan" fill /></div>
            <Pill tone={isKnown(metrics.fanRpm) ? "green" : "amber"}>{isKnown(metrics.fanRpm) ? "OK" : "不支持"}</Pill>
          </div>
          <div className="monitor-row voltage">
            <div className="monitor-icon"><Key size={36} weight="duotone" /></div>
            <div className="monitor-copy"><span>电压状态</span><strong>{voltageStatus}</strong></div>
            <div className="voltage-grid">
              <span>CPU 核心<b>{metrics.voltage.cpu}</b></span>
              <span>内存<b>{metrics.voltage.memory}</b></span>
              <span>3.3V<b>{metrics.voltage.v33}</b></span>
              <span>5V<b>{metrics.voltage.v5}</b></span>
              <span>12V<b>{metrics.voltage.v12}</b></span>
            </div>
            <Pill tone={metrics.voltage && metrics.voltage.supported ? "green" : "amber"}>{metrics.voltage && metrics.voltage.supported ? "OK" : "不支持"}</Pill>
          </div>
        </div>
      </section>

      <section className="hardware-status surface">
        <div className="panel-heading">
          <h2>硬件状态</h2>
          <span>{knownHardwareCount} 项已检测</span>
        </div>
        <div className="hardware-status-grid">
          {hardwareItems.map(function (item) {
            const Icon = item.icon;
            return (
              <div className="hardware-status-row" key={item.name}>
                <div className={"hardware-status-icon " + item.tone}><Icon size={31} weight="duotone" /></div>
                <div><strong>{item.name}</strong><span>{item.detail}</span></div>
                <div className={"hardware-state " + toneForState(item.status)}><span>状态</span><b>{item.status}</b></div>
                <Pill tone={item.status === "不支持" || item.status === "未知" ? "amber" : "green"}>{item.status === "不支持" ? "--" : "OK"}</Pill>
              </div>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button className={"toggle " + (checked ? "on" : "")} onClick={onChange} aria-label={label}>
      <span />
    </button>
  );
}

function SettingsPage({
  dimmed,
  setDimmed,
  nasAddress,
  setNasAddress,
  nasPort,
  setNasPort,
  account,
  setAccount,
  password,
  setPassword,
  refreshRate,
  pendingRefreshRate,
  setPendingRefreshRate,
  onApplyRefresh,
  onConnect,
  connectionState,
}) {
  const [keepAwake, setKeepAwake] = useState(true);
  const dirtyRefresh = pendingRefreshRate !== refreshRate;

  return (
    <section className="settings-page">
      <section className="settings-card surface">
        <div className="panel-heading">
          <h2><GearSix size={22} weight="duotone" />连接设置</h2>
          <Pill tone={connectionState.connected ? "green" : "amber"}>{connectionState.connected ? "已连接" : "未连接"}</Pill>
        </div>
        <div className="setting-list">
          <label className="setting-field">
            <span>NAS 地址</span>
            <input value={nasAddress} onChange={function (event) { setNasAddress(event.target.value); }} />
          </label>
          <label className="setting-field">
            <span>NAS 端口</span>
            <input value={nasPort} onChange={function (event) { setNasPort(event.target.value); }} />
          </label>
          <label className="setting-field">
            <span>账号</span>
            <input value={account} onChange={function (event) { setAccount(event.target.value); }} />
          </label>
          <label className="setting-field">
            <span>密码</span>
            <input type="password" value={password} onChange={function (event) { setPassword(event.target.value); }} />
          </label>
        </div>
        <button className="primary-action connect-action" onClick={onConnect}>
          连接
        </button>
      </section>

      <section className="settings-card surface">
        <div className="panel-heading">
          <h2><Timer size={22} weight="duotone" />刷新频率</h2>
          <span>当前：{refreshRate}</span>
        </div>
        <div className="refresh-options">
          {refreshOptions.map(function (option) {
            return (
              <button
                className={pendingRefreshRate === option ? "active" : ""}
                key={option}
                onClick={function () { setPendingRefreshRate(option); }}
              >
                {option}
              </button>
            );
          })}
        </div>
        <button className={"primary-action apply-action " + (dirtyRefresh ? "pending" : "")} onClick={onApplyRefresh}>
          应用
        </button>
      </section>

      <section className="settings-card surface">
        <div className="panel-heading">
          <h2><ShieldCheck size={22} weight="duotone" />屏幕模式</h2>
          <span>Android 7 横屏</span>
        </div>
        <div className="mode-list">
          <div className="mode-row">
            <div>
              <strong>常亮模式</strong>
              <span>作为监控屏使用时保持屏幕唤醒</span>
            </div>
            <Toggle checked={keepAwake} onChange={function () { setKeepAwake(function (value) { return !value; }); }} label="常亮模式" />
          </div>
          <div className="mode-row">
            <div>
              <strong>夜间模式</strong>
              <span>降低亮度与对比度，适合长时间常亮</span>
            </div>
            <Toggle checked={dimmed} onChange={function () { setDimmed(function (value) { return !value; }); }} label="夜间模式" />
          </div>
        </div>
      </section>

      <section className="settings-summary surface">
        <div className="summary-icon"><Key size={36} weight="duotone" /></div>
        <div className="summary-content">
          <h2>设置预览</h2>
          <div className="summary-grid">
            <p><span>地址</span><b>{nasAddress}:{nasPort}</b></p>
            <p><span>账号</span><b>{account}</b></p>
            <p><span>刷新</span><b>每 {refreshRate}</b></p>
            <p><span>屏幕</span><Pill tone={keepAwake ? "green" : "amber"}>{keepAwake ? "常亮开启" : "常亮关闭"}</Pill></p>
          </div>
        </div>
      </section>
    </section>
  );
}

export function App() {
  const [initialSettings] = useState(readStoredSettings);
  const [active, setActive] = useState(function () {
    return window.location.hash === "#settings" ? "设置" : window.location.hash === "#hardware" ? "硬件" : "总览";
  });
  const [selectedService, setSelectedService] = useState(null);
  const [tick, setTick] = useState(0);
  const [dimmed, setDimmed] = useState(false);
  const [metrics, setMetrics] = useState(fallbackMetrics);
  const [nasAddress, setNasAddress] = useState(initialSettings.nasAddress || defaultNasAddress);
  const [nasPort, setNasPort] = useState(initialSettings.nasPort || defaultNasPort);
  const [account, setAccount] = useState(initialSettings.account || "admin");
  const [password, setPassword] = useState("");
  const [refreshRate, setRefreshRate] = useState(initialSettings.refreshRate || "5 秒");
  const [pendingRefreshRate, setPendingRefreshRate] = useState(initialSettings.refreshRate || "5 秒");
  const [reloadToken, setReloadToken] = useState(0);
  const [connectionState, setConnectionState] = useState({ connected: false, message: "尚未连接" });
  const [notice, setNotice] = useState(null);
  const [now, setNow] = useState(function () {
    return new Date();
  });
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [history, setHistory] = useState({
    cpu: [],
    ram: [],
    down: [],
    up: [],
    temp: [],
    cpuTemp: [],
    fan: [],
  });
  const apiBase = normalizeApiBase(nasAddress, nasPort);
  const refreshMs = refreshLabelToMs(refreshRate);

  useEffect(function () {
    const timer = setInterval(function () {
      setTick(function (value) {
        return value + 1;
      });
      setNow(new Date());
    }, 2400);

    return function () {
      clearInterval(timer);
    };
  }, []);

  useEffect(function () {
    let timer = null;
    if (window.AtlasDevice && typeof window.AtlasDevice.getBatteryLevel === "function") {
      function updateNativeBattery() {
        const level = Number(window.AtlasDevice.getBatteryLevel());
        if (Number.isFinite(level) && level >= 0) {
          setBatteryLevel(Math.max(0, Math.min(100, Math.round(level))));
        }
      }
      updateNativeBattery();
      timer = setInterval(updateNativeBattery, 30000);
      return function () {
        clearInterval(timer);
      };
    }

    if (!navigator.getBattery) return undefined;
    let battery = null;
    let cancelled = false;
    function update(nextBattery) {
      if (!cancelled && nextBattery) {
        setBatteryLevel(Math.round(Number(nextBattery.level || 0) * 100));
      }
    }
    navigator.getBattery().then(function (nextBattery) {
      battery = nextBattery;
      update(battery);
      battery.addEventListener("levelchange", function () { update(battery); });
    }).catch(function () {});
    return function () {
      cancelled = true;
    };
  }, []);

  useEffect(function () {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify({
      nasAddress,
      nasPort,
      account,
      refreshRate,
    }));
  }, [nasAddress, nasPort, account, refreshRate]);

  useEffect(function () {
    let cancelled = false;

    function loadMetrics() {
      requestMetrics(apiBase)
        .then(function (data) {
          if (!cancelled) {
            const nextMetrics = normalizeMetrics(data);
            setMetrics(nextMetrics);
            setHistory(function (current) {
              return pushHistory(current, nextMetrics);
            });
            setConnectionState({ connected: true, message: "连接成功" });
          }
        })
        .catch(function (error) {
          if (!cancelled) {
            setMetrics(function (current) {
              return Object.assign({}, current, { online: false });
            });
            setConnectionState({
              connected: false,
              message: error && error.message ? error.message : "无法连接 NAS Agent",
            });
          }
        });
    }

    loadMetrics();
    const timer = setInterval(loadMetrics, refreshMs);
    return function () {
      cancelled = true;
      clearInterval(timer);
    };
  }, [apiBase, refreshMs, reloadToken]);

  function handleConnect() {
    requestHealth(apiBase)
      .then(function (data) {
        const message = data && data.ok ? "连接成功：NAS Agent 正常响应" : "连接失败：返回内容不包含 ok=true";
        const connected = Boolean(data && data.ok);
        setConnectionState({ connected, message });
        setNotice({ title: connected ? "连接成功" : "连接失败", message, tone: connected ? "green" : "amber" });
        if (connected) {
          setReloadToken(function (value) { return value + 1; });
        }
      })
      .catch(function (error) {
        const message = error && error.message ? error.message : "无法连接 NAS Agent";
        setConnectionState({ connected: false, message });
        setNotice({ title: "连接失败", message, tone: "amber" });
      });
  }

  function handleApplyRefresh() {
    setRefreshRate(pendingRefreshRate);
    setNotice({ title: "刷新频率已应用", message: "当前刷新频率：" + pendingRefreshRate, tone: "green" });
  }

  const cpu = metrics.cpu;
  const ram = metrics.ram;
  const down = metrics.down;
  const up = metrics.up;
  const timeText = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const syncText = metrics.lastSync || "--";
  const batteryText = batteryLevel === null ? "--%" : batteryLevel + "%";
  const batteryBucket = batteryLevel === null ? 0 : Math.max(0, Math.min(100, Math.round(batteryLevel / 10) * 10));
  const storageUsed = Number(metrics.storage.usedTb || 0);
  const storageTotal = Number(metrics.storage.totalTb || 0);
  const storageFree = Number(metrics.storage.freeTb || 0);
  const storagePercent = storageTotal ? Math.max(0, Math.min(99, Math.round((storageUsed / storageTotal) * 100))) : 0;
  const healthScore = Number(metrics.health || 0);
  const healthStatus = !metrics.online ? "离线" : healthScore >= 90 ? "健康" : healthScore >= 75 ? "注意" : "异常";
  const healthMessage = !metrics.online ? "等待数据" : healthScore >= 90 ? "一切正常" : healthScore >= 75 ? "需要关注" : "请检查系统";
  const cpuMeta = (metrics.cpuClock || "-- GHz") + " / " + (metrics.cpuCores || "--") + " 核心";
  const tempMeta = isKnown(metrics.boardTemp) ? "主板温度实时采样" : "未接入温度传感器";
  const statusRows = [
    { label: "系统", value: metrics.online ? "正常" : "离线" },
    { label: "存储池", value: metrics.storage.status || "未知" },
    { label: "网络连接", value: metrics.online ? "正常" : "离线" },
    { label: "硬件状态", value: healthStatus },
  ];

  return (
    <main className={"app-shell " + (dimmed ? "dimmed" : "")}>
      <header className="topbar">
        <div className="brand">
          <button className="icon-button" aria-label="返回总览" onClick={function () {
            setActive("总览");
            window.location.hash = "";
          }}>
            <List size={26} weight="bold" />
          </button>
          <div className="server-mark">
            <HardDrives size={36} weight="fill" />
          </div>
          <div>
            <h1>Atlas NAS</h1>
            <p>HomeLab - DSM-like monitor</p>
          </div>
          <Pill tone={metrics.online ? "green" : "amber"}>{metrics.online ? "在线" : "离线"}</Pill>
        </div>
        <div className="sync">
          <ClockCounterClockwise size={22} />
          <span>最后同步： {syncText}</span>
          <button className="mini-action" onClick={function () {
            setTick(function (value) { return value + 1; });
            setReloadToken(function (value) { return value + 1; });
          }} aria-label="Refresh now">
            <ArrowsClockwise size={18} />
            刷新
          </button>
          <button className={"mini-action " + (dimmed ? "active" : "")} onClick={function () { setDimmed(function (value) { return !value; }); }}>
            夜间
          </button>
        </div>
        <div className="status-strip">
          <WifiHigh size={22} weight="bold" />
          <span>LAN {nasAddress}</span>
          <span className="divider" />
          <span className={"battery l" + batteryBucket + " " + (batteryLevel === null ? "unknown" : "")}><i />{batteryText}</span>
          <strong>{timeText}</strong>
        </div>
      </header>

      {active === "设置" ? (
        <SettingsPage
          dimmed={dimmed}
          setDimmed={setDimmed}
          nasAddress={nasAddress}
          setNasAddress={setNasAddress}
          nasPort={nasPort}
          setNasPort={setNasPort}
          account={account}
          setAccount={setAccount}
          password={password}
          setPassword={setPassword}
          refreshRate={refreshRate}
          pendingRefreshRate={pendingRefreshRate}
          setPendingRefreshRate={setPendingRefreshRate}
          onApplyRefresh={handleApplyRefresh}
          onConnect={handleConnect}
          connectionState={connectionState}
        />
      ) : active === "硬件" ? (
        <HardwarePage metrics={metrics} history={history} />
      ) : (
      <div className="dashboard-grid">
        <aside className="left-rail surface">
          <h2>系统健康</h2>
          <div className="health-gauge" aria-label={"Health score " + healthScore}>
            <div className="arc" />
            <strong>{healthScore}</strong>
            <span>{healthStatus}</span>
            <small>{healthMessage}</small>
            <em className="gauge-min">0</em>
            <em className="gauge-max">100</em>
          </div>
          <div className="rail-section">
            <div className="section-title">
              <ClockCounterClockwise size={22} />
              <span>运行时间</span>
            </div>
            <strong className="uptime">{metrics.uptime}</strong>
            <p>自 {metrics.since}</p>
          </div>
          <div className="rail-section">
            <div className="section-title">
              <ShieldCheck size={22} />
              <span>系统状态</span>
            </div>
            {statusRows.map(function (item) {
              return (
                <div className="check-row" key={item.label}>
                  <span className={"check-dot " + toneForState(item.value)}>{toneForState(item.value) === "green" ? "✓" : "!"}</span>
                  <span>{item.label}</span>
                  <b>{item.value}</b>
                </div>
              );
            })}
          </div>
          <div className="alert-strip">
            <button onClick={function () {
              const message = metrics.alerts.length
                ? metrics.alerts.map(function (item) { return item.title; }).join("；")
                : "当前没有告警";
              setNotice({ title: "告警", message, tone: metrics.alerts.length ? "amber" : "green" });
            }}>
              <Bell size={20} />告警 <b>{metrics.alerts.length}</b>
            </button>
            <button onClick={function () {
              const message = metrics.notifications.length
                ? metrics.notifications.map(function (item) { return item.title; }).join("；")
                : "当前没有通知";
              setNotice({ title: "通知", message, tone: "green" });
            }}>
              通知 <b>{metrics.notifications.length}</b>
            </button>
          </div>
        </aside>

        <section className="center-stack">
          <MetricPanel icon={Cpu} title="CPU 使用率" value={cpu} suffix="%" meta={cpuMeta} color="#33dcea" tone="cyan" values={history.cpu} chartMax={100} chartId="cpu" />
          <MetricPanel icon={Database} title="内存使用率" value={ram} suffix="%" meta={metrics.memoryUsed + " / " + metrics.memoryTotal} color="#43df75" tone="green" values={history.ram} chartMax={100} chartId="ram" />
          <section className="network-panel surface">
            <div className="metric-icon blue">
              <Network size={40} weight="duotone" />
            </div>
            <div className="network-main">
              <div className="panel-heading">
                <h3>网络速率</h3>
                <span>网口： {metrics.networkName || "LAN"} 实时采样</span>
              </div>
              <div className="traffic">
                <div>
                  <span className="traffic-label blue-text">下载</span>
                  <strong><ArrowDown size={26} />{down}<small>MB/s</small></strong>
                  <Sparkline color="#309dff" values={history.down} max={Math.max(1, down)} id="down" />
                </div>
                <div>
                  <span className="traffic-label green-text">上传</span>
                  <strong><ArrowUp size={26} />{up}<small>MB/s</small></strong>
                  <Sparkline color="#41df77" values={history.up} max={Math.max(1, up)} id="up" />
                </div>
              </div>
            </div>
          </section>
          <MetricPanel icon={ThermometerSimple} title="系统温度" value={displayValue(metrics.boardTemp)} suffix={isKnown(metrics.boardTemp) ? "°C" : ""} meta={tempMeta} color="#ff9d31" tone="amber" values={history.temp} chartMax={100} chartId="temp" />
        </section>

        <aside className="right-rail">
          <section className="pool-card surface">
            <div className="panel-heading">
              <h2><Database size={22} weight="duotone" />存储池</h2>
              <span>Pool 1</span>
            </div>
            <div className="pool-body">
              <DonutGauge value={storagePercent} />
              <div className="pool-stats">
                <strong>{storageUsed} <span>TB / {storageTotal} TB</span></strong>
                <p><i className="dot used" />已使用 <b>{storageUsed} TB</b></p>
                <p><i className="dot free" />可用 <b>{storageFree} TB</b></p>
                <p>类型： {metrics.storage.type} <Pill>{metrics.storage.status}</Pill></p>
              </div>
            </div>
          </section>

          <section className="drives surface">
            <div className="panel-heading">
              <h2>硬盘列表</h2>
              <span>{metrics.drives.length} 个硬盘</span>
            </div>
            <div className="drive-head">
              <span>硬盘</span><span>容量</span><span>温度</span><span>状态</span>
            </div>
            {metrics.drives.map(function (drive) {
              return (
                <div className="drive-row" key={drive.name}>
                  <span><HardDrives size={20} weight="duotone" />{drive.name}</span>
                  <span>{drive.size}</span>
                  <span>{drive.temp}</span>
                  <Pill tone={toneForState(drive.status)}>{drive.status}</Pill>
                </div>
              );
            })}
          </section>

          <section className="services surface">
            <div className="panel-heading">
              <h2>服务状态</h2>
              <span>{metrics.services.length} 项检测</span>
            </div>
            <div className="service-grid">
              {metrics.services.map(function (service) {
                const ServiceIcon = service.icon;
                return (
                  <button className="service-tile" key={service.name} onClick={function () { setSelectedService(service); }}>
                    <span className={"service-icon " + service.tone}>
                      <ServiceIcon size={31} weight="duotone" />
                    </span>
                    <strong>{service.name}</strong>
                    <small>{service.meta}</small>
                    <Pill tone={service.tone === "amber" ? "amber" : "green"}>{service.state}</Pill>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
      )}

      <nav className="bottom-nav">
        {nav.map(function ({ label, icon: Icon }) {
          return (
            <button
              className={active === label ? "active" : ""}
              onClick={function (event) {
                setActive(label);
                window.location.hash = label === "设置" ? "settings" : label === "硬件" ? "hardware" : "";
                event.currentTarget.blur();
              }}
              key={label}
            >
              <Icon size={25} weight="duotone" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {notice ? (
        <div className="modal-backdrop" onClick={function () { setNotice(null); }}>
          <section className="service-modal notice-modal" onClick={function (event) { event.stopPropagation(); }}>
            <button className="close-button" onClick={function () { setNotice(null); }} aria-label="关闭">
              <X size={18} />
            </button>
            <h2>{notice.title}</h2>
            <p>{notice.message}</p>
            <button className={"modal-action " + (notice.tone === "amber" ? "amber" : "green")} onClick={function () { setNotice(null); }}>
              OK
            </button>
          </section>
        </div>
      ) : null}

      {selectedService ? (
        <div className="modal-backdrop" onClick={function () { setSelectedService(null); }}>
          <section className="service-modal" onClick={function (event) { event.stopPropagation(); }}>
            <button className="close-button" onClick={function () { setSelectedService(null); }} aria-label="Close">
              <X size={18} />
            </button>
            <h2>{selectedService.name}</h2>
            <p>{selectedService.meta}</p>
            <div className="modal-grid">
              <div className="modal-stat"><span>状态</span><Pill>{selectedService.state}</Pill></div>
              <div className="modal-stat"><span>响应</span><b>{selectedService.responseMs === null || selectedService.responseMs === undefined ? "未检测" : selectedService.responseMs + " ms"}</b></div>
              <div className="modal-stat"><span>最后检查</span><b>{formatIsoTime(selectedService.lastCheck || metrics.lastSync)}</b></div>
            </div>
            <button className="modal-action green" onClick={function () { setSelectedService(null); }}>
              OK
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
