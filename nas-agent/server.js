const http = require("http");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");

const PORT = Number(process.env.PORT || 5088);
const PROC = process.env.HOST_PROC || "/host/proc";
const SYS = process.env.HOST_SYS || "/host/sys";
let lastCpuSample = null;
let lastNetSample = null;

function read(path, fallback = "") {
  try {
    return fs.readFileSync(path, "utf8").trim();
  } catch {
    return fallback;
  }
}

function exec(cmd, args = []) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 2500 }, (error, stdout) => {
      resolve(error ? "" : String(stdout || ""));
    });
  });
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "-";
  const tb = value / 1024 / 1024 / 1024 / 1024;
  if (tb >= 0.95) return `${Number(tb.toFixed(tb >= 10 ? 0 : 1))}T`;
  const gb = value / 1024 / 1024 / 1024;
  return `${Number(gb.toFixed(gb >= 10 ? 0 : 1))}G`;
}

function isPhysicalDiskName(name) {
  return Boolean(name) && !/^(loop|ram|zram|sr|fd|dm-|md|nbd|rbd)/.test(name);
}

function cpuModel() {
  const text = read(`${PROC}/cpuinfo`);
  const match = text.match(/model name\s*:\s*(.+)/);
  return match ? match[1].replace(/\s+/g, " ") : os.cpus()[0]?.model || "Unknown CPU";
}

function cpuClock() {
  const text = read(`${PROC}/cpuinfo`);
  const match = text.match(/cpu MHz\s*:\s*([\d.]+)/);
  const mhz = match ? Number(match[1]) : 0;
  if (Number.isFinite(mhz) && mhz > 0) {
    return `${(mhz / 1000).toFixed(2)} GHz`;
  }
  return "";
}

function cpuCores() {
  const text = read(`${PROC}/cpuinfo`);
  const processors = text.match(/^processor\s*:/gm);
  if (processors && processors.length) return processors.length;
  return os.cpus().length || 0;
}

function cpuUsage() {
  const line = read(`${PROC}/stat`).split(/\r?\n/).find((item) => item.startsWith("cpu "));
  if (!line) {
    const load = os.loadavg()[0] || 0;
    const cores = Math.max(1, os.cpus().length || 1);
    return Math.max(1, Math.min(99, Math.round((load / cores) * 100)));
  }

  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = (parts[3] || 0) + (parts[4] || 0);
  const total = parts.reduce((sum, value) => sum + (Number(value) || 0), 0);
  const current = { idle, total };

  if (!lastCpuSample) {
    lastCpuSample = current;
    const load = os.loadavg()[0] || 0;
    const cores = Math.max(1, os.cpus().length || 1);
    return Math.max(1, Math.min(99, Math.round((load / cores) * 100)));
  }

  const totalDelta = current.total - lastCpuSample.total;
  const idleDelta = current.idle - lastCpuSample.idle;
  lastCpuSample = current;
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(99, Math.round(((totalDelta - idleDelta) / totalDelta) * 100)));
}

function networkSpeed() {
  const text = read(`${PROC}/net/dev`);
  const ignored = /^(lo|docker|br-|veth|virbr|tun|tap|tailscale|zt|wg)/;
  const totals = text.split(/\r?\n/).reduce((sum, line) => {
    if (!line.includes(":")) return sum;
    const [namePart, dataPart] = line.split(":");
    const name = namePart.trim();
    if (!name || ignored.test(name)) return sum;
    const cols = dataPart.trim().split(/\s+/).map(Number);
    return {
      rx: sum.rx + (cols[0] || 0),
      tx: sum.tx + (cols[8] || 0),
    };
  }, { rx: 0, tx: 0 });
  const now = Date.now();
  if (!lastNetSample) {
    lastNetSample = Object.assign({ time: now }, totals);
    return { down: 0, up: 0, interfaceName: "LAN" };
  }
  const seconds = Math.max(1, (now - lastNetSample.time) / 1000);
  const down = Math.max(0, (totals.rx - lastNetSample.rx) / seconds / 1024 / 1024);
  const up = Math.max(0, (totals.tx - lastNetSample.tx) / seconds / 1024 / 1024);
  lastNetSample = Object.assign({ time: now }, totals);
  return {
    down: Math.round(down),
    up: Math.round(up),
    interfaceName: "LAN",
  };
}

function memInfo() {
  const text = read(`${PROC}/meminfo`);
  const total = Number((text.match(/MemTotal:\s+(\d+)/) || [0, 0])[1]);
  const available = Number((text.match(/MemAvailable:\s+(\d+)/) || [0, 0])[1]);
  const used = Math.max(0, total - available);
  const pct = total ? Math.round((used / total) * 100) : 0;
  const gb = (kb) => (kb / 1024 / 1024).toFixed(2).replace(/\.00$/, "");
  return { pct, used: `${gb(used)} GB`, total: `${gb(total)} GB` };
}

function uptime() {
  const seconds = Number(read(`${PROC}/uptime`, "0").split(/\s+/)[0]) || os.uptime();
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const since = new Date(Date.now() - seconds * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    text: `${days} 天 ${pad(hours)}:${pad(minutes)}:00`,
    since: `${since.getFullYear()}-${pad(since.getMonth() + 1)}-${pad(since.getDate())} ${pad(since.getHours())}:${pad(since.getMinutes())}`,
  };
}

function firstNumber(paths) {
  for (const path of paths) {
    const raw = read(path);
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) {
      return value > 1000 ? Math.round(value / 1000) : Math.round(value);
    }
  }
  return null;
}

function temperatures() {
  const roots = [`${SYS}/class/thermal`, `${SYS}/class/hwmon`];
  const paths = [];
  for (const root of roots) {
    try {
      for (const entry of fs.readdirSync(root)) {
        const base = `${root}/${entry}`;
        try {
          for (const child of fs.readdirSync(base)) {
            if (/temp\d+_input/.test(child) || child === "temp") {
              paths.push(`${base}/${child}`);
            }
          }
        } catch {}
      }
    } catch {}
  }
  const cpu = firstNumber(paths);
  return { cpu, board: cpu, supported: cpu !== null };
}

function fanRpm() {
  const paths = [];
  try {
    for (const entry of fs.readdirSync(`${SYS}/class/hwmon`)) {
      const base = `${SYS}/class/hwmon/${entry}`;
      for (const child of fs.readdirSync(base)) {
        if (/fan\d+_input/.test(child)) paths.push(`${base}/${child}`);
      }
    }
  } catch {}
  if (!paths.length) return null;
  const value = firstNumber(paths);
  return value && value > 120 ? value : null;
}

async function storage() {
  const out = await exec("df", ["-Pk", "/host/vol2", "/host/vol1", "/host"]);
  const rows = out.split(/\r?\n/)
    .filter((line) => /^\/dev\//.test(line) || line.includes("/host/vol"))
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols.length >= 6 && !cols[5].includes("/host/docker"));

  if (rows.length) {
    const totals = rows.reduce((sum, cols) => {
      return {
        total: sum.total + Number(cols[1] || 0),
        used: sum.used + Number(cols[2] || 0),
        free: sum.free + Number(cols[3] || 0),
      };
    }, { total: 0, used: 0, free: 0 });
    const total = totals.total / 1024 / 1024 / 1024;
    const used = totals.used / 1024 / 1024 / 1024;
    const free = totals.free / 1024 / 1024 / 1024;
    return {
      usedTb: Number(used.toFixed(1)),
      totalTb: Number(total.toFixed(1)),
      freeTb: Number(free.toFixed(1)),
      type: "RAID/Volume",
      status: "正常",
    };
  }
  return { usedTb: 0, totalTb: 0, freeTb: 0, type: "未知", status: "未知" };
}

async function dockerServices() {
  const started = Date.now();
  const out = await exec("docker", ["ps", "--format", "{{.Names}}"]);
  const names = out.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const checkedAt = new Date().toISOString();
  const smbRunning = processRunning(["smbd", "nmbd", "samba"]);
  return [
    {
      name: "Docker",
      meta: `${names.length} 个容器`,
      state: names.length ? "运行中" : "未运行",
      tone: names.length ? "cyan" : "amber",
      responseMs: Date.now() - started,
      lastCheck: checkedAt,
    },
    {
      name: "SMB / CIFS",
      meta: smbRunning ? "进程已检测" : "未检测到服务进程",
      state: smbRunning ? "运行中" : "未运行",
      tone: smbRunning ? "blue" : "amber",
      responseMs: null,
      lastCheck: checkedAt,
    },
  ];
}

function processRunning(patterns) {
  const lowered = patterns.map((item) => String(item).toLowerCase());
  try {
    return fs.readdirSync(PROC).some((entry) => {
      if (!/^\d+$/.test(entry)) return false;
      const comm = read(`${PROC}/${entry}/comm`).toLowerCase();
      const cmdline = read(`${PROC}/${entry}/cmdline`).replace(/\0/g, " ").toLowerCase();
      return lowered.some((needle) => comm.includes(needle) || cmdline.includes(needle));
    });
  } catch {
    return false;
  }
}

async function drives() {
  const lsblk = await exec("lsblk", ["-b", "-J", "-o", "NAME,TYPE,SIZE,MODEL,RM,ROTA"]);
  try {
    const parsed = JSON.parse(lsblk || "{}");
    const disks = (parsed.blockdevices || [])
      .filter((disk) => disk.type === "disk" && Number(disk.rm || 0) === 0 && isPhysicalDiskName(disk.name))
      .slice(0, 8);
    if (disks.length) {
      return disks.map((disk, index) => ({
        name: `HDD ${index + 1}`,
        size: formatBytes(disk.size),
        temp: "未知",
        status: "已检测",
        device: disk.name,
        model: String(disk.model || "").trim(),
      }));
    }
  } catch (error) {
    // Fall through to /sys/block fallback.
  }

  let names = [];
  try {
    names = fs.readdirSync(`${SYS}/block`).filter(isPhysicalDiskName);
  } catch (error) {
    names = [];
  }

  return names.map((name, index) => {
    const sectors = Number(read(`${SYS}/block/${name}/size`, "0"));
    const sectorSize = Number(read(`${SYS}/block/${name}/queue/logical_block_size`, "512")) || 512;
    return {
      name: `HDD ${index + 1}`,
      size: formatBytes(sectors * sectorSize),
      temp: "未知",
      status: "已检测",
      device: name,
      model: read(`${SYS}/block/${name}/device/model`),
    };
  });
}

function systemEvents({ storageInfo, driveList, serviceList }) {
  const alerts = [];
  const notifications = [];
  const storagePercent = storageInfo.totalTb
    ? Math.round((Number(storageInfo.usedTb || 0) / Number(storageInfo.totalTb || 1)) * 100)
    : 0;

  if (storagePercent >= 90) alerts.push({ title: "存储空间不足", level: "warning" });
  for (const drive of driveList) {
    if (!isOkState(drive.status)) alerts.push({ title: `${drive.name} 状态异常`, level: "critical" });
  }
  for (const service of serviceList) {
    if (!isOkState(service.state)) alerts.push({ title: `${service.name} 未正常运行`, level: "warning" });
  }

  if (driveList.length) notifications.push({ title: `检测到 ${driveList.length} 块物理硬盘`, level: "info" });
  if (serviceList.length) notifications.push({ title: `实时检测 ${serviceList.length} 项服务`, level: "info" });
  return { alerts, notifications };
}

function isOkState(value) {
  return ["正常", "良好", "运行中", "OK", "已检测", "未知", "不支持"].includes(String(value || "").trim());
}

function calculateHealth({ cpu, ram, temp, storageInfo, driveList, serviceList, fan }) {
  let score = 100;
  const knownTemps = [temp.cpu, temp.board].filter((value) => Number.isFinite(Number(value)));
  const maxTemp = knownTemps.length ? Math.max(...knownTemps.map(Number)) : 0;
  const storagePercent = storageInfo.totalTb
    ? Math.round((Number(storageInfo.usedTb || 0) / Number(storageInfo.totalTb || 1)) * 100)
    : 0;

  if (cpu >= 95) score -= 18;
  else if (cpu >= 85) score -= 12;
  else if (cpu >= 75) score -= 6;

  if (ram >= 90) score -= 15;
  else if (ram >= 80) score -= 8;

  if (maxTemp >= 85) score -= 25;
  else if (maxTemp >= 75) score -= 15;
  else if (maxTemp >= 65) score -= 8;

  if (storagePercent >= 95) score -= 20;
  else if (storagePercent >= 90) score -= 12;
  else if (storagePercent >= 80) score -= 5;

  for (const drive of driveList) {
    if (!isOkState(drive.status)) score -= 18;
  }

  for (const service of serviceList) {
    if (!isOkState(service.state)) score -= 12;
  }

  if (fan !== null && fan > 0 && fan < 500) score -= 6;

  return Math.max(0, Math.min(100, Math.round(score)));
}

async function metrics() {
  const mem = memInfo();
  const temp = temperatures();
  const up = uptime();
  const cpu = cpuUsage();
  const net = networkSpeed();
  const fan = fanRpm();
  const storageInfo = await storage();
  const driveList = await drives();
  const serviceList = await dockerServices();
  const events = systemEvents({ storageInfo, driveList, serviceList });
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return {
    online: true,
    cpu,
    ram: mem.pct,
    down: net.down,
    up: net.up,
    networkName: net.interfaceName,
    uptime: up.text,
    since: up.since,
    health: calculateHealth({ cpu, ram: mem.pct, temp, storageInfo, driveList, serviceList, fan }),
    cpuTemp: temp.cpu,
    boardTemp: temp.board,
    fanRpm: fan,
    memoryUsed: mem.used,
    memoryTotal: mem.total,
    cpuModel: cpuModel(),
    cpuClock: cpuClock(),
    cpuCores: cpuCores(),
    model: process.env.NAS_MODEL || "Atlas NAS",
    board: process.env.NAS_BOARD || "NAS 主板",
    bios: process.env.NAS_BIOS || "系统默认",
    voltage: {
      supported: false,
      cpu: "不支持",
      memory: "不支持",
      v33: "不支持",
      v5: "不支持",
      v12: "不支持",
    },
    storage: storageInfo,
    drives: driveList,
    services: serviceList,
    alerts: events.alerts,
    notifications: events.notifications,
    lastSync: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, service: "atlas-nas-agent" }));
    return;
  }
  if (req.url === "/api/metrics") {
    try {
      const data = await metrics();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: String(error && error.message || error) }));
    }
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, error: "not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`atlas-nas-agent listening on ${PORT}`);
});
