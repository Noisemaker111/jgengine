/**
 * Shoot: launch system Chrome, wait for page `data-jg-capture=ready` (tiny
 * handshake), pull pixels via CDP Page.captureScreenshot, write binary PNG.
 * No Playwright. PNG never travels through the page console.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type Mode = "ui" | "play" | "poster";
type Device = "desktop" | "mobile";
type DeviceArg = Device | "both";

type Args = {
  game: string;
  mode: Mode;
  device: DeviceArg;
  out?: string;
  url?: string;
  connect?: number;
  timeoutMs: number;
};

type DeviceProfile = {
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
};

const DEVICES: Record<Device, DeviceProfile> = {
  desktop: { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
};

const PORT = 4517;
const BASE = `http://127.0.0.1:${PORT}`;
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function parseArgs(argv: string[]): Args {
  const args: Args = { game: "world-of-warcraft", mode: "ui", device: "desktop", timeoutMs: 60_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--game") args.game = argv[++index] ?? args.game;
    else if (value === "--mode") args.mode = (argv[++index] as Mode) ?? args.mode;
    else if (value === "--device") {
      const device = argv[++index] as DeviceArg | undefined;
      if (device !== "desktop" && device !== "mobile" && device !== "both") {
        throw new Error(`--device must be desktop, mobile, or both (got ${device ?? "nothing"})`);
      }
      args.device = device;
    } else if (value === "--out") args.out = argv[++index];
    else if (value === "--url") args.url = argv[++index];
    else if (value === "--connect") args.connect = Number(argv[++index]);
    else if (value === "--timeout") args.timeoutMs = Number(argv[++index]) * 1000;
    else if (!value.startsWith("--")) args.game = value;
  }
  return args;
}

function devicesFor(arg: DeviceArg): Device[] {
  return arg === "both" ? ["desktop", "mobile"] : [arg];
}

function outPathFor(args: Args, device: Device, outDir: string): string {
  if (args.out !== undefined) {
    const resolved = resolve(args.out);
    if (args.device !== "both") return resolved;
    if (device === "desktop") return resolved;
    const dot = resolved.lastIndexOf(".");
    if (dot <= 0) return `${resolved}-mobile`;
    return `${resolved.slice(0, dot)}-mobile${resolved.slice(dot)}`;
  }
  const suffix = device === "mobile" ? "-mobile" : "";
  return join(outDir, `${args.game}-${args.mode}${suffix}.png`);
}

function findChromeExecutable(): string {
  for (const candidate of [
    process.env.CHROME_PATH,
    process.env.JG_CHROME,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ]) {
    if (candidate !== undefined && existsSync(candidate)) return candidate;
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (existsSync(root)) {
    const direct = join(root, "chromium");
    if (existsSync(direct) && statSync(direct).isFile()) return direct;
    for (const entry of readdirSync(root)) {
      if (!entry.startsWith("chromium")) continue;
      for (const candidate of [
        join(root, entry, "chrome-linux", "chrome"),
        join(root, entry, "chrome-linux", "headless_shell"),
      ]) {
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  throw new Error("No Chrome/Chromium found. Set CHROME_PATH or install Chrome.");
}

async function isUp(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer(): Promise<ChildProcess | null> {
  if (await isUp(BASE)) return null;
  const child = spawn("bunx", ["vite", "--port", String(PORT), "--host", "127.0.0.1"], {
    cwd: resolve(import.meta.dir, "../apps/dev"),
    stdio: "ignore",
    detached: process.platform !== "win32",
  });
  child.unref();
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isUp(BASE)) return child;
  }
  child.kill();
  throw new Error("Dev server failed to start on :4517");
}

function killProcessTree(child: ChildProcess | null): void {
  if (child?.pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }
}

function pickDebugPort(): number {
  return 9200 + Math.floor(Math.random() * 700);
}

async function waitForDebugger(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Chrome debugger not ready on :${port} within ${timeoutMs}ms`);
}

type CdpMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string };
};

class CdpSession {
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }
  >();
  private readonly ws: WebSocket;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.addEventListener("message", (event) => {
      const data = typeof event.data === "string" ? event.data : undefined;
      if (data === undefined) return;
      let message: CdpMessage;
      try {
        message = JSON.parse(data) as CdpMessage;
      } catch {
        return;
      }
      if (message.id === undefined) return;
      const waiter = this.pending.get(message.id);
      if (waiter === undefined) return;
      this.pending.delete(message.id);
      if (message.error !== undefined) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result ?? {});
    });
  }

  static connect(url: string, timeoutMs: number): Promise<CdpSession> {
    return new Promise((resolvePromise, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`CDP WebSocket connect timeout: ${url}`));
      }, timeoutMs);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolvePromise(new CdpSession(ws));
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error(`CDP WebSocket error: ${url}`));
      });
    });
  }

  send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = ++this.nextId;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close(): void {
    for (const [, waiter] of this.pending) waiter.reject(new Error("CDP session closed"));
    this.pending.clear();
    this.ws.close();
  }
}

async function openPageSession(debugPort: number): Promise<CdpSession> {
  let info: { webSocketDebuggerUrl?: string } | undefined;
  for (const method of ["PUT", "GET"] as const) {
    try {
      const created = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
        method,
        signal: AbortSignal.timeout(10_000),
      });
      if (created.ok) {
        info = (await created.json()) as { webSocketDebuggerUrl?: string };
        break;
      }
    } catch {
      /* try next */
    }
  }
  if (info?.webSocketDebuggerUrl === undefined) {
    const list = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(5_000) });
    const pages = (await list.json()) as Array<{ type: string; webSocketDebuggerUrl?: string }>;
    const page = pages.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl !== undefined);
    if (page?.webSocketDebuggerUrl === undefined) throw new Error("No CDP page target available");
    return CdpSession.connect(page.webSocketDebuggerUrl, 15_000);
  }
  return CdpSession.connect(info.webSocketDebuggerUrl, 15_000);
}

async function applyDevice(session: CdpSession, device: Device): Promise<void> {
  const profile = DEVICES[device];
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: profile.deviceScaleFactor,
    mobile: profile.mobile,
  });
  if (profile.mobile) {
    await session.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
    await session.send("Emulation.setUserAgentOverride", { userAgent: MOBILE_UA });
  } else {
    await session.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  }
}

async function waitCaptureReady(session: CdpSession, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await session.send("Runtime.evaluate", {
      expression: `({
        status: document.documentElement.dataset.jgCapture ?? null,
        error: document.documentElement.dataset.jgCaptureError ?? null
      })`,
      returnByValue: true,
    });
    const remote = result.result as { value?: { status: string | null; error: string | null } } | undefined;
    const status = remote?.value?.status;
    if (status === "ready") return;
    if (status === "error") {
      throw new Error(`capture error: ${remote?.value?.error ?? "unknown"}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for data-jg-capture=ready (${timeoutMs}ms)`);
}

function targetUrl(args: Args, device: Device): string {
  if (args.url !== undefined) {
    const url = new URL(args.url);
    url.searchParams.set("capture", "1");
    url.searchParams.set("device", device);
    return url.toString();
  }
  const url = new URL(BASE);
  url.searchParams.set("game", args.game);
  url.searchParams.set("mode", args.mode);
  url.searchParams.set("device", device);
  url.searchParams.set("capture", "1");
  return url.toString();
}

async function shootOne(
  debugPort: number,
  args: Args,
  device: Device,
  outPath: string,
): Promise<void> {
  const session = await openPageSession(debugPort);
  try {
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await applyDevice(session, device);
    const url = targetUrl(args, device);
    await session.send("Page.navigate", { url });
    await waitCaptureReady(session, args.timeoutMs);
    await new Promise((r) => setTimeout(r, 100));
    const shot = await session.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const data = shot.data;
    if (typeof data !== "string" || data.length === 0) {
      throw new Error("Page.captureScreenshot returned empty data");
    }
    const bytes = Buffer.from(data, "base64");
    const tmpPath = `${outPath}.tmp`;
    writeFileSync(tmpPath, bytes);
    if (existsSync(outPath)) unlinkSync(outPath);
    renameSync(tmpPath, outPath);
    console.log(outPath);
  } finally {
    session.close();
  }
}

function launchChrome(debugPort: number): ChildProcess {
  const chrome = findChromeExecutable();
  const userDataDir = mkdtempSync(join(tmpdir(), "jg-shoot-"));
  const child = spawn(
    chrome,
    [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--disable-extensions",
      "--disable-default-apps",
      "--mute-audio",
      "--hide-scrollbars",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  return child;
}

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(import.meta.dir, "../shots");
try {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
} catch (error) {
  const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
  if (code !== "EEXIST" || !existsSync(outDir)) throw error;
}
const targets = devicesFor(args.device);

const server = args.url !== undefined ? null : await ensureServer();
let chrome: ChildProcess | null = null;
const debugPort = args.connect ?? pickDebugPort();
let exitCode = 0;

try {
  if (args.connect === undefined) {
    chrome = launchChrome(debugPort);
    await waitForDebugger(debugPort, 30_000);
  } else {
    await waitForDebugger(debugPort, 5_000);
  }

  for (const device of targets) {
    await shootOne(debugPort, args, device, outPathFor(args, device, outDir));
  }
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
} finally {
  killProcessTree(chrome);
  killProcessTree(server);
}
process.exit(exitCode);
