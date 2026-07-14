import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const DEV_PORT = 4517;
export const DEV_BASE = `http://127.0.0.1:${DEV_PORT}`;

/**
 * Fixed debug port a `--keep` launch binds to, so a later `--connect` call
 * never has to parse the previous call's stdout to find it — the warm-loop
 * pattern is `--keep` once, then `--connect 9223` for every re-shot.
 */
export const WARM_CHROME_PORT = 9223;

export type Device = "desktop" | "mobile" | "mobile-landscape";
export type DeviceProfile = { width: number; height: number; deviceScaleFactor: number; mobile: boolean };
export type SizeMode = "full" | "half";

export const DEVICES: Record<Device, DeviceProfile> = {
  desktop: { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  "mobile-landscape": { width: 844, height: 390, deviceScaleFactor: 2, mobile: true },
};

export const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/**
 * Half-res mid-loop judge shots run ~1/4 the pixels of a full-res shot
 * (both dimensions halved) — cheaper to encode and cheaper for a vision
 * model to read back. Full-res stays the default for final/PR evidence.
 */
export function scaleProfile(profile: DeviceProfile, size: SizeMode): DeviceProfile {
  if (size === "full") return profile;
  return {
    width: Math.round(profile.width / 2),
    height: Math.round(profile.height / 2),
    deviceScaleFactor: profile.deviceScaleFactor,
    mobile: profile.mobile,
  };
}

export async function applyDevice(session: CdpSession, device: Device, size: SizeMode = "full"): Promise<void> {
  const profile = scaleProfile(DEVICES[device], size);
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: profile.deviceScaleFactor,
    mobile: profile.mobile,
  });
  if (profile.mobile) {
    await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await session.send("Emulation.setUserAgentOverride", { userAgent: MOBILE_UA });
  } else {
    await session.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  }
}

export function findChromeExecutable(): string {
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

export async function isUp(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureDevServer(): Promise<ChildProcess | null> {
  if (await isUp(DEV_BASE)) return null;
  const child = spawn("bunx", ["vite", "--port", String(DEV_PORT), "--host", "127.0.0.1"], {
    cwd: resolve(import.meta.dir, "../apps/dev"),
    stdio: "ignore",
    detached: process.platform !== "win32",
  });
  child.unref();
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isUp(DEV_BASE)) return child;
  }
  child.kill();
  throw new Error(`Dev server failed to start on :${DEV_PORT}`);
}

export function killProcessTree(child: ChildProcess | null): void {
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

export function pickDebugPort(): number {
  return 9200 + Math.floor(Math.random() * 700);
}

export async function waitForDebugger(port: number, timeoutMs: number): Promise<void> {
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

export class CdpSession {
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

export async function openPageSession(debugPort: number): Promise<CdpSession> {
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

export function launchChrome(debugPort: number, prefix = "jg-drive-"): ChildProcess {
  const chrome = findChromeExecutable();
  const userDataDir = mkdtempSync(join(tmpdir(), prefix));
  return spawn(
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
}
