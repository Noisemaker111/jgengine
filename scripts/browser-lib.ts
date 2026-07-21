import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { retrySettleMs, shouldRetryCapture } from "./capture-retry";

/**
 * Default port when no worktree key is needed — kept for docs/bench that still
 * want a predictable single-session port. Prefer {@link resolveDevPort}.
 */
export const DEV_PORT = 4517;
/** @deprecated Prefer {@link resolveDevBase} — fixed URL collides across worktrees. */
export const DEV_BASE = `http://127.0.0.1:${DEV_PORT}`;

/**
 * Default warm Chrome debug port. Prefer {@link resolveWarmChromePort} so
 * parallel worktrees do not share one CDP endpoint.
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

/** Native GPU locally; deterministic software GL only when explicitly requested or in CI. */
export function chromeGraphicsArgs(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const software = env.JG_CAPTURE_SOFTWARE_GL === "1" ||
    (env.JG_CAPTURE_SOFTWARE_GL !== "0" && (env.CI !== undefined || platform === "linux"));
  return software
    ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    : ["--ignore-gpu-blocklist"];
}

/**
 * Rewrite a `localhost` URL host to `127.0.0.1`. Node/Bun `fetch` (and the
 * capture allowlist) treat the two as distinct: `fetch` resolves `localhost`
 * to IPv6 `::1` first, so a dev server bound only to IPv4 `127.0.0.1` reads as
 * down even while it is serving, and the allowlist only accepts `127.0.0.1`.
 * Normalizing at the CLI entry point makes `--url http://localhost:…` behave
 * identically to `--url http://127.0.0.1:…`. Non-URL or non-localhost inputs
 * pass through untouched.
 */
export function normalizeLoopbackUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
      return url.toString();
    }
  } catch {
    /* not a parseable URL — leave it for downstream handling */
  }
  return raw;
}

export async function isUp(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Stable identity for this checkout (worktree path or monorepo root). */
export function checkoutIdentity(cwd = process.cwd()): string {
  try {
    const top = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      windowsHide: true,
    });
    if (top.status === 0 && top.stdout.trim().length > 0) return top.stdout.trim();
  } catch {
    /* fall through */
  }
  return resolve(cwd);
}

function hashPortOffset(identity: string, span: number): number {
  const digest = createHash("sha256").update(identity).digest();
  return digest.readUInt32BE(0) % span;
}

/**
 * Per-checkout dev port so parallel worktrees do not share one Vite.
 * Override with `JG_DEV_PORT`. Range 4517–4999 (483 ports).
 */
export function resolveDevPort(cwd = process.cwd()): number {
  const override = process.env.JG_DEV_PORT;
  if (override !== undefined && override.length > 0) {
    const n = Number(override);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 4517 + hashPortOffset(checkoutIdentity(cwd), 483);
}

export function resolveDevBase(cwd = process.cwd()): string {
  return `http://127.0.0.1:${resolveDevPort(cwd)}`;
}

/** Per-checkout website port used by managed `shoot --site` captures. */
export function resolveWebPort(cwd = process.cwd()): number {
  const override = process.env.JG_WEB_PORT;
  if (override !== undefined && override.length > 0) {
    const n = Number(override);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  // Stay clear of Chrome's blocked-port list (notably 5060/5061 SIP and 6000 X11).
  return 5517 + hashPortOffset(checkoutIdentity(cwd), 400);
}

export function resolveWebBase(cwd = process.cwd()): string {
  return `http://127.0.0.1:${resolveWebPort(cwd)}`;
}

/**
 * Per-checkout warm Chrome debug port (`--keep` / `--connect` loop).
 * Override with `JG_CHROME_PORT`. Range 9223–9322.
 */
export function resolveWarmChromePort(cwd = process.cwd()): number {
  const override = process.env.JG_CHROME_PORT;
  if (override !== undefined && override.length > 0) {
    const n = Number(override);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 9223 + hashPortOffset(checkoutIdentity(cwd), 100);
}

interface DevServerMarker {
  identity: string;
  port: number;
  pid?: number;
}

function markerPath(port: number): string {
  return join(tmpdir(), `jgengine-dev-${port}.json`);
}

function readMarker(port: number): DevServerMarker | null {
  try {
    const raw = readFileSync(markerPath(port), "utf8");
    return JSON.parse(raw) as DevServerMarker;
  } catch {
    return null;
  }
}

function writeMarker(port: number, identity: string, pid?: number): void {
  const body: DevServerMarker = { identity, port, pid };
  writeFileSync(markerPath(port), `${JSON.stringify(body)}\n`);
}

/** True when something is listening *and* its marker matches this checkout. */
export async function isOurDevServer(port: number, identity: string): Promise<boolean> {
  const base = `http://127.0.0.1:${port}`;
  if (!(await isUp(base))) return false;
  const marker = readMarker(port);
  return marker !== null && marker.identity === identity;
}

export interface EnsureDevServerResult {
  child: ChildProcess | null;
  /** PID only when this invocation launched and therefore owns the server. */
  pid?: number;
  port: number;
  base: string;
}

function launchPersistentCommand(
  file: string,
  args: readonly string[],
  cwd: string,
  env: Record<string, string>,
): number {
  const assignments = Object.entries(env)
    .map(([key, value]) => `$env:${key}=${powershellQuote(value)}`)
    .join(";");
  const command = `${assignments};$p=Start-Process -FilePath ${powershellQuote(file)} -ArgumentList @(${powershellArgumentList(args)}) -WorkingDirectory ${powershellQuote(cwd)} -WindowStyle Hidden -PassThru; [Console]::Out.Write($p.Id)`;
  const encoded = Buffer.from(command, "utf16le").toString("base64");
  const launched = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encoded],
    { encoding: "utf8", windowsHide: true, timeout: 10_000 },
  );
  const pid = Number(launched.stdout.trim());
  if (launched.status !== 0 || !Number.isFinite(pid) || pid <= 0) {
    throw new Error(`Persistent process launch failed: ${launched.stderr.trim() || `exit ${launched.status}`}`);
  }
  return pid;
}

/**
 * Boot (or reuse) the apps/dev Vite server for **this** checkout only.
 * Port is derived from the worktree path; a live server on that port is
 * reused only when a marker file proves it belongs to this identity.
 */
export async function ensureDevServer(cwd = process.cwd()): Promise<EnsureDevServerResult> {
  const identity = checkoutIdentity(cwd);
  let port = resolveDevPort(cwd);
  const base = `http://127.0.0.1:${port}`;

  if (await isOurDevServer(port, identity)) {
    return { child: null, port, base };
  }

  if (await isUp(base)) {
    // Something else owns this port — try a few offsets rather than attach wrong.
    for (let step = 1; step <= 20; step += 1) {
      const candidate = 4517 + ((port - 4517 + step * 17) % 483);
      if (await isOurDevServer(candidate, identity)) {
        return { child: null, port: candidate, base: `http://127.0.0.1:${candidate}` };
      }
      if (!(await isUp(`http://127.0.0.1:${candidate}`))) {
        port = candidate;
        break;
      }
    }
  }

  const args = ["--cwd=apps/dev", "run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"];
  const child = process.platform === "win32"
    ? null
    : spawn(process.execPath, args, {
        cwd,
        stdio: "ignore",
        detached: true,
        env: { ...process.env, JG_DEV_PORT: String(port) },
        windowsHide: true,
      });
  const pid = child?.pid ?? launchPersistentCommand(process.execPath, args, cwd, { JG_DEV_PORT: String(port) });
  child?.unref();
  writeMarker(port, identity, pid);

  const finalBase = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isUp(finalBase)) return { child, pid, port, base: finalBase };
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`Dev server exited with code ${child.exitCode} before becoming reachable on :${port}`);
    }
  }
  if (child !== null) child.kill();
  else killPid(pid, true);
  const viteInstalled =
    existsSync(join(cwd, "node_modules", ".bin", "vite")) ||
    existsSync(join(cwd, "node_modules", "vite"));
  const hint = viteInstalled
    ? "the apps/dev Vite server never became reachable — check for a port conflict or a Vite boot error"
    : "node_modules looks incomplete (vite is missing) — run `bun scripts/ensure-ready.ts` (or `bun install`) first";
  throw new Error(`Dev server failed to start on :${port} for ${identity} — ${hint}`);
}

/** Boot or reuse this checkout's website Vite server for `shoot --site` captures. */
export async function ensureWebServer(cwd = process.cwd()): Promise<EnsureDevServerResult> {
  const identity = checkoutIdentity(cwd);
  let port = resolveWebPort(cwd);
  const base = `http://127.0.0.1:${port}`;
  if (await isOurDevServer(port, identity)) return { child: null, port, base };

  if (await isUp(base)) {
    for (let step = 1; step <= 20; step += 1) {
      const candidate = 5517 + ((port - 5517 + step * 17) % 400);
      if (await isOurDevServer(candidate, identity)) {
        return { child: null, port: candidate, base: `http://127.0.0.1:${candidate}` };
      }
      if (!(await isUp(`http://127.0.0.1:${candidate}`))) {
        port = candidate;
        break;
      }
    }
  }

  const args = ["--cwd=apps/web", "run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"];
  const child = process.platform === "win32"
    ? null
    : spawn(process.execPath, args, {
        cwd,
        stdio: "ignore",
        detached: true,
        env: { ...process.env, JG_WEB_PORT: String(port), JG_CAPTURE_SITE: "1" },
        windowsHide: true,
      });
  const pid = child?.pid ?? launchPersistentCommand(process.execPath, args, cwd, {
    JG_WEB_PORT: String(port),
    JG_CAPTURE_SITE: "1",
  });
  child?.unref();
  writeMarker(port, identity, pid);

  const finalBase = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await isUp(finalBase)) return { child, pid, port, base: finalBase };
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`Website dev server exited with code ${child.exitCode} before becoming reachable on :${port}`);
    }
  }
  if (child !== null) killProcessTree(child);
  else killPid(pid, true);
  throw new Error(`Website dev server failed to start on :${port} for ${identity}`);
}

/**
 * Force-kill a single pid across platforms. `tree` also reaps the process
 * group on posix (SIGKILL to `-pid`) before falling back to the bare pid —
 * used when we own a detached launcher whose children must die with it.
 */
export function killPid(pid: number | undefined, tree = false): void {
  if (pid === undefined || !Number.isFinite(pid) || pid <= 0) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  if (tree) {
    try {
      process.kill(-pid, "SIGKILL");
      return;
    } catch {
      /* group gone or ungrouped — fall through to the bare pid */
    }
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}

export function killProcessTree(child: ChildProcess | null): void {
  killPid(child?.pid, true);
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
  private readonly ownedTarget?: { debugPort: number; targetId: string };
  private readonly eventHandlers = new Map<string, Array<(params: Record<string, unknown>) => void>>();

  private constructor(ws: WebSocket, ownedTarget?: { debugPort: number; targetId: string }) {
    this.ws = ws;
    this.ownedTarget = ownedTarget;
    this.ws.addEventListener("message", (event) => {
      const data = typeof event.data === "string" ? event.data : undefined;
      if (data === undefined) return;
      let message: CdpMessage;
      try {
        message = JSON.parse(data) as CdpMessage;
      } catch {
        return;
      }
      if (message.id === undefined) {
        if (message.method !== undefined) {
          for (const handler of this.eventHandlers.get(message.method) ?? []) {
            handler(message.params ?? {});
          }
        }
        return;
      }
      const waiter = this.pending.get(message.id);
      if (waiter === undefined) return;
      this.pending.delete(message.id);
      if (message.error !== undefined) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result ?? {});
    });
  }

  static connect(
    url: string,
    timeoutMs: number,
    ownedTarget?: { debugPort: number; targetId: string },
  ): Promise<CdpSession> {
    return new Promise((resolvePromise, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`CDP WebSocket connect timeout: ${url}`));
      }, timeoutMs);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolvePromise(new CdpSession(ws, ownedTarget));
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error(`CDP WebSocket error: ${url}`));
      });
    });
  }

  /** Subscribe to a CDP event and return an unsubscribe callback. */
  on(method: string, handler: (params: Record<string, unknown>) => void): () => void {
    const handlers = this.eventHandlers.get(method) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(method, handlers);
    return () => {
      const current = this.eventHandlers.get(method);
      if (current === undefined) return;
      const index = current.indexOf(handler);
      if (index >= 0) current.splice(index, 1);
      if (current.length === 0) this.eventHandlers.delete(method);
    };
  }

  send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = ++this.nextId;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Runtime.evaluate an expression with `returnByValue`, unwrapping
   * `result.result.value` to the caller's `T`. Returns `undefined` when the
   * page yields no value. Pass `awaitPromise` for async expressions.
   */
  async evaluate<T>(expression: string, opts: { awaitPromise?: boolean } = {}): Promise<T | undefined> {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      ...(opts.awaitPromise === true ? { awaitPromise: true } : {}),
    });
    return (result.result as { value?: T } | undefined)?.value;
  }

  async close(): Promise<void> {
    if (this.ownedTarget !== undefined) {
      const closed = await closePageTarget(
        this.ownedTarget.debugPort,
        this.ownedTarget.targetId,
      );
      if (!closed) {
        console.error(`browser session: failed to close page target ${this.ownedTarget.targetId}`);
      }
    }
    for (const [, waiter] of this.pending) waiter.reject(new Error("CDP session closed"));
    this.pending.clear();
    this.ws.close();
  }
}

/** Close one Chrome page target through the debugger HTTP endpoint. */
export async function closePageTarget(debugPort: number, targetId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `http://127.0.0.1:${debugPort}/json/close/${encodeURIComponent(targetId)}`,
      { signal: AbortSignal.timeout(2_000) },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function openPageSession(debugPort: number): Promise<CdpSession> {
  let info: { id?: string; webSocketDebuggerUrl?: string } | undefined;
  for (const method of ["PUT", "GET"] as const) {
    try {
      const created = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
        method,
        signal: AbortSignal.timeout(10_000),
      });
      if (created.ok) {
        info = (await created.json()) as { id?: string; webSocketDebuggerUrl?: string };
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
  return CdpSession.connect(
    info.webSocketDebuggerUrl,
    15_000,
    info.id === undefined ? undefined : { debugPort, targetId: info.id },
  );
}

export function launchChrome(
  debugPort: number,
  prefix = "jg-drive-",
  options: { persistent?: boolean } = {},
): ChildProcess {
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
      // Without these three, a long-lived headless Chrome can throttle rAF on
      // pages it considers occluded/backgrounded — frame times read as seconds
      // and perf evidence from the debug snapshot becomes garbage.
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-component-update",
      "--disable-sync",
      "--disable-extensions",
      "--disable-default-apps",
      "--mute-audio",
      "--hide-scrollbars",
      ...chromeGraphicsArgs(),
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "about:blank",
    ],
    {
      stdio: "ignore",
      windowsHide: true,
      // A daemon Chrome must outlive the Bun command that starts it. Chrome is a GUI-subsystem
      // executable on Windows, so detaching it does not create a console window.
      detached: options.persistent === true || process.platform !== "win32",
    },
  );
}

function powershellQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function windowsCommandLineArg(value: string): string {
  if (!/[\s"]/.test(value)) return value;
  const escaped = value.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/g, "$1$1");
  return `"${escaped}"`;
}

function powershellArgumentList(args: readonly string[]): string {
  return args.map((arg) => powershellQuote(windowsCommandLineArg(arg))).join(",");
}

/** Hidden native Windows launcher used when Chrome must outlive the Bun process that starts it. */
export function windowsPersistentChromeCommand(chrome: string, args: readonly string[]): string {
  const argumentList = powershellArgumentList(args);
  return `$p=Start-Process -FilePath ${powershellQuote(chrome)} -ArgumentList @(${argumentList}) -WindowStyle Hidden -PassThru; [Console]::Out.Write($p.Id)`;
}

/** Launch persistent headless Chrome without retaining a Windows child-process handle in Bun. */
export function launchPersistentChrome(
  debugPort: number,
  prefix = "jg-shoot-daemon-",
): { pid: number; child: ChildProcess | null } {
  if (process.platform !== "win32") {
    const child = launchChrome(debugPort, prefix, { persistent: true });
    child.unref();
    if (child.pid === undefined) throw new Error("Persistent Chrome launcher returned no pid");
    return { pid: child.pid, child };
  }

  const chrome = findChromeExecutable();
  const userDataDir = mkdtempSync(join(tmpdir(), prefix));
  const args = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-component-update",
    "--disable-sync",
    "--disable-extensions",
    "--disable-default-apps",
    "--mute-audio",
    "--hide-scrollbars",
    ...chromeGraphicsArgs(),
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "about:blank",
  ];
  const encoded = Buffer.from(windowsPersistentChromeCommand(chrome, args), "utf16le").toString("base64");
  const launched = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encoded],
    { encoding: "utf8", windowsHide: true, timeout: 10_000 },
  );
  const pid = Number(launched.stdout.trim());
  if (launched.status !== 0 || !Number.isFinite(pid) || pid <= 0) {
    throw new Error(`Persistent Chrome launch failed: ${launched.stderr.trim() || `exit ${launched.status}`}`);
  }
  return { pid, child: null };
}

/**
 * Poll `data-jg-capture` until the page reports an honest frame (`ready`) or
 * surfaces an error, shared by shoot and drive. Throws with the page-reported
 * detail on error, or on timeout.
 */
export async function waitCaptureReady(session: CdpSession, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remote = await session.evaluate<{ status: string | null; error: string | null }>(`({
      status: document.documentElement.dataset.jgCapture ?? null,
      error: document.documentElement.dataset.jgCaptureError ?? null
    })`);
    const status = remote?.status;
    if (status === "ready") return;
    if (status === "error") throw new Error(`capture error: ${remote?.error ?? "unknown"}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for data-jg-capture=ready (${timeoutMs}ms)`);
}

function exceptionMessage(params: Record<string, unknown>): string {
  const details = params.exceptionDetails as
    | { text?: unknown; exception?: { description?: unknown; value?: unknown }; url?: unknown; lineNumber?: unknown }
    | undefined;
  const description = details?.exception?.description;
  const value = details?.exception?.value;
  const text = details?.text;
  const message =
    typeof description === "string"
      ? description
      : typeof value === "string"
        ? value
        : typeof text === "string"
          ? text
          : "unknown exception";
  const location =
    typeof details?.url === "string" && details.url.length > 0
      ? ` (${details.url}${typeof details.lineNumber === "number" ? `:${details.lineNumber + 1}` : ""})`
      : "";
  return `page exception: ${message}${location}`;
}

/** Navigate and surface browser/page failures instead of waiting for the capture timeout. */
export async function navigateCapturePage(
  session: CdpSession,
  url: string,
  timeoutMs: number,
): Promise<void> {
  let pageFailure: string | undefined;
  let frameId: string | undefined;
  const requestFrames = new Map<string, string>();
  const pendingDocumentFailures: Array<{ frameId?: string; message: string }> = [];
  const offException = session.on("Runtime.exceptionThrown", (params) => {
    pageFailure ??= exceptionMessage(params);
  });
  const offRequest = session.on("Network.requestWillBeSent", (params) => {
    if (params.type !== "Document") return;
    if (typeof params.requestId === "string" && typeof params.frameId === "string") {
      requestFrames.set(params.requestId, params.frameId);
    }
  });
  const offLoadingFailed = session.on("Network.loadingFailed", (params) => {
    if (params.type !== "Document") return;
    const errorText = typeof params.errorText === "string" ? params.errorText : "unknown error";
    const failedFrameId = typeof params.requestId === "string" ? requestFrames.get(params.requestId) : undefined;
    const message = `page load failed: ${errorText}`;
    if (frameId === undefined) pendingDocumentFailures.push({ frameId: failedFrameId, message });
    else if (failedFrameId === undefined || failedFrameId === frameId) pageFailure ??= message;
  });
  try {
    await session.send("Network.enable");
    const navigation = await session.send("Page.navigate", { url });
    if (typeof navigation.errorText === "string" && navigation.errorText.length > 0) {
      throw new Error(`navigation failed for ${url}: ${navigation.errorText}`);
    }
    frameId = typeof navigation.frameId === "string" ? navigation.frameId : undefined;
    const matchingFailure = pendingDocumentFailures.find(
      (failure) => frameId === undefined || failure.frameId === undefined || failure.frameId === frameId,
    );
    if (matchingFailure !== undefined) pageFailure ??= matchingFailure.message;

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (pageFailure !== undefined) throw new Error(pageFailure);
      const remote = await session.evaluate<{ status: string | null; error: string | null }>(`({
        status: document.documentElement.dataset.jgCapture ?? null,
        error: document.documentElement.dataset.jgCaptureError ?? null
      })`);
      if (remote?.status === "ready") return;
      if (remote?.status === "error") throw new Error(`capture error: ${remote.error ?? "unknown"}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (pageFailure !== undefined) throw new Error(pageFailure);
    throw new Error(`timed out waiting for data-jg-capture=ready (${timeoutMs}ms)`);
  } finally {
    offException();
    offRequest();
    offLoadingFailed();
  }
}

/** Navigate with one cache-bypassed retry for a transient post-HMR stale page. */
export async function navigateCapturePageWithRetry(
  session: CdpSession,
  url: string,
  serverBase: string,
  timeoutMs: number,
  maxAttempts = 2,
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await navigateCapturePage(session, url, timeoutMs);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!shouldRetryCapture({ attempt, maxAttempts, message })) throw error;
      const settleMs = retrySettleMs(attempt);
      console.error(
        `capture attempt ${attempt} hit a stale page after HMR (${message}) - settling ${settleMs}ms, then reloading fresh`,
      );
      await new Promise((resolve) => setTimeout(resolve, settleMs));
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline && !(await isUp(serverBase))) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      await session.send("Network.setCacheDisabled", { cacheDisabled: true });
    }
  }
}

/**
 * Persistence a game boots a save from — cleared before an honest capture so a
 * warm/daemon/`--connect` Chrome (which keeps one `--user-data-dir` alive across
 * drives) doesn't restore a prior run's session and read stale `capture.probe`
 * metrics (issue #1505). Everything a game could save into: keep this in sync
 * with any new save backend a game adopts.
 */
const CAPTURE_STORAGE_TYPES = "local_storage,indexeddb,websql,cache_storage,service_workers";

/**
 * Wipe the target origin's persisted game state before the capture navigation so
 * every drive/shoot boots from a clean slate. A no-op-cheap safety on a fresh
 * profile; the fix that matters on a warm profile, where a prior drive's
 * `localStorage` save would otherwise auto-restore and silently corrupt probe
 * evidence. Best-effort: a failure warns rather than aborting the capture.
 * `originOrUrl` may be a full URL — only its origin is used.
 */
export async function clearCaptureStorage(session: CdpSession, originOrUrl: string): Promise<void> {
  let origin: string;
  try {
    origin = new URL(originOrUrl).origin;
  } catch {
    origin = originOrUrl;
  }
  try {
    await session.send("Storage.clearDataForOrigin", { origin, storageTypes: CAPTURE_STORAGE_TYPES });
  } catch (error) {
    console.error(
      `capture: could not clear storage for ${origin} (${error instanceof Error ? error.message : String(error)}) — ` +
        `a warm profile may restore a stale save and corrupt probe evidence`,
    );
  }
}

/** Write bytes to a temp path then atomically swap into place (never a torn PNG). */
export function writePngAtomic(outPath: string, bytes: Buffer): void {
  const tmpPath = `${outPath}.tmp`;
  writeFileSync(tmpPath, bytes);
  if (existsSync(outPath)) unlinkSync(outPath);
  renameSync(tmpPath, outPath);
}

/** Filename suffix marking a half-res judge shot. */
export function sizeSuffix(size: SizeMode): string {
  return size === "half" ? "-half" : "";
}

/** Validate a raw `--size` argument, throwing the shared usage error. */
export function parseSizeArg(value: string | undefined): SizeMode {
  if (value !== "full" && value !== "half") {
    throw new Error(`--size must be full or half (got ${value ?? "nothing"})`);
  }
  return value;
}

export interface BrowserSession {
  /** CDP debug port the page target lives on. */
  debugPort: number;
  /** The Chrome we launched, or null when attached to an existing/daemon one. */
  chrome: ChildProcess | null;
}

export interface WithBrowserSessionOptions {
  /** Leave the derived warm debug port instead of a random one. */
  keep: boolean;
  /** Attach to an already-running Chrome on this port (skips launch/kill). */
  connect?: number;
  /** Base per-shot timeout; the hard watchdog defaults to this + 120s. */
  timeoutMs: number;
  /** Dev server to tear down alongside Chrome when not left warm. */
  server?: ChildProcess | null;
  /** Native persistent server pid when no ChildProcess handle is retained on Windows. */
  serverPid?: number;
  /** Pre-resolved debug port (daemon attach) — overrides keep/connect derivation. */
  debugPort?: number;
  /** Attach without launching even without `--connect` (daemon). */
  attach?: boolean;
  /** Leave Chrome + server running after `fn` resolves (warm loop / daemon). */
  leaveWarm?: boolean;
  /** user-data-dir prefix passed to {@link launchChrome}. */
  chromePrefix?: string;
  /** Override the hard watchdog budget (default `timeoutMs + 120_000`). */
  hardDeadlineMs?: number;
  /** Override the derived warm debug port. */
  warmPort?: number;
}

/**
 * Own the browser-driver shell shared by shoot and drive: derive the debug
 * port, launch-or-attach Chrome, arm the hard-deadline watchdog, run `fn`,
 * then force-kill Chrome + dev server unless left warm. `fn` returns the
 * process exit code (defaults to 0); a throw is reported and yields 1.
 */
export async function withBrowserSession(
  options: WithBrowserSessionOptions,
  fn: (session: BrowserSession) => Promise<number | void>,
): Promise<number> {
  const warmPort = options.warmPort ?? resolveWarmChromePort();
  const attach = options.attach ?? false;
  const debugPort =
    options.debugPort ?? options.connect ?? (options.keep ? warmPort : pickDebugPort());
  const leaveWarm = options.leaveWarm ?? options.keep;
  const hardDeadlineMs = options.hardDeadlineMs ?? options.timeoutMs + 120_000;

  let chrome: ChildProcess | null = null;
  let exitCode = 0;

  const watchdog = setTimeout(() => {
    console.error(
      `browser session: still running after the ${Math.round(hardDeadlineMs / 1000)}s hard deadline — force-killing Chrome and dev server`,
    );
    // Daemon-owned Chrome/server are never handed to us (both null here), so
    // these are no-ops when attached — safe to run unconditionally.
    killProcessTree(chrome);
    killProcessTree(options.server ?? null);
    killPid(options.serverPid, true);
    process.exit(124);
  }, hardDeadlineMs);
  watchdog.unref();

  try {
    if (options.connect !== undefined || attach) {
      await waitForDebugger(debugPort, 5_000);
    } else {
      chrome = launchChrome(debugPort, options.chromePrefix);
      await waitForDebugger(debugPort, 30_000);
    }
    const result = await fn({ debugPort, chrome });
    if (typeof result === "number") exitCode = result;
  } catch (error) {
    exitCode = 1;
    console.error(error instanceof Error ? error.message : error);
  } finally {
    clearTimeout(watchdog);
    if (!leaveWarm) {
      killProcessTree(chrome);
      killProcessTree(options.server ?? null);
      killPid(options.serverPid, true);
    }
  }
  return exitCode;
}
