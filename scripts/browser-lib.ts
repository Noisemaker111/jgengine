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
  watch,
  writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { retrySettleMs, shouldRetryCapture } from "./capture-retry";
import { clearViteCaches, headRevision, revisionDrifted, shortRevision } from "./captureRevision";
import { decodePng } from "./png-reader";

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
  /** Commit this server booted from; absent for markers written before revision keying. */
  head?: string;
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

function writeMarker(port: number, identity: string, pid?: number, head?: string): void {
  const body: DevServerMarker = { identity, port, pid, head };
  writeFileSync(markerPath(port), `${JSON.stringify(body)}\n`);
}

/** True when something is listening *and* its marker matches this checkout. */
export async function isOurDevServer(port: number, identity: string): Promise<boolean> {
  const base = `http://127.0.0.1:${port}`;
  if (!(await isUp(base))) return false;
  const marker = readMarker(port);
  return marker !== null && marker.identity === identity;
}

/**
 * Retire a warm server whose commit no longer matches the tree. Reusing it would
 * serve the previous commit's module graph — the "start menu still on screen"
 * / readiness-timeout failure that made every checkout-then-shoot loop flaky.
 * Killing it here means the caller's normal boot path starts a clean one.
 */
export async function retireDriftedDevServer(port: number, cwd = process.cwd()): Promise<boolean> {
  const marker = readMarker(port);
  if (marker === null || marker.identity !== checkoutIdentity(cwd)) return false;
  if (!revisionDrifted(marker.head, headRevision(cwd))) return false;
  if (!(await isUp(`http://127.0.0.1:${port}`))) return false;
  if (marker.pid === undefined) throw new Error(`capture: stale Vite on :${port} has no owned process identity`);
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`capture: stale Vite on :${port} did not close its connection`));
    }, 10_000);
    socket.once("connect", () => killPid(marker.pid, true));
    socket.once("error", reject);
    socket.once("close", () => { clearTimeout(timer); resolve(); });
  });
  if (await isUp(`http://127.0.0.1:${port}`)) throw new Error(`capture: stale Vite still serves :${port} after its owned process exited`);
  const cleared = clearViteCaches(cwd);
  console.error(
    `capture: warm Vite on :${port} booted from ${shortRevision(marker.head)} but HEAD is ${shortRevision(headRevision(cwd))} — restarting it${cleared.length > 0 ? " and clearing the dep cache" : ""}`,
  );
  return true;
}

export interface EnsureDevServerResult {
  child: ChildProcess | null;
  /** PID only when this invocation launched and therefore owns the server. */
  pid?: number;
  port: number;
  base: string;
}

function waitForStartupOutput(
  subscribe: (output: (text: string) => void, fail: (error: Error) => void) => () => void,
  matches: (output: string) => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = "";
    let settled = false;
    let cleanup = () => {};
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      if (error !== undefined) reject(error); else resolve();
    };
    const timer = setTimeout(() => finish(new Error(`${label} did not announce readiness within ${timeoutMs}ms\n${output}`)), timeoutMs);
    try {
      cleanup = subscribe(text => {
        output += text.replace(/\x1b\[[0-9;]*m/g, "");
        if (matches(output)) finish();
      }, error => finish(new Error(`${label}: ${error.message}\n${output}`)));
    } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    if (settled) cleanup();
  });
}

/** @internal Await the launched process's announcement, failure, or one deadline. */
export function waitForProcessOutput(child: ChildProcess, matches: (output: string) => boolean, timeoutMs: number, label: string): Promise<void> {
  return waitForStartupOutput((output, fail) => {
    const data = (chunk: Buffer) => output(chunk.toString());
    const exited = (code: number | null) => fail(new Error(`process exited before readiness (code ${code})`));
    child.stdout?.on("data", data);
    child.stderr?.on("data", data);
    child.once("error", fail);
    child.once("exit", exited);
    return () => {
      child.stdout?.off("data", data).resume();
      child.stderr?.off("data", data).resume();
      child.off("error", fail);
      child.off("exit", exited);
    };
  }, matches, timeoutMs, label);
}

function launchPersistentCommand(
  file: string,
  args: readonly string[],
  cwd: string,
  env: Record<string, string>,
  matches: (output: string) => boolean,
  timeoutMs: number,
  label: string,
): { pid: number; ready: Promise<void> } {
  const logs = mkdtempSync(join(tmpdir(), "jg-startup-"));
  const stdout = join(logs, "stdout.log");
  const stderr = join(logs, "stderr.log");
  let failStartup = (_error: Error) => {};
  let scanAfterLaunch = () => {};
  let observer: ChildProcess | undefined;
  const ready = waitForStartupOutput((output, fail) => {
    failStartup = fail;
    const positions = new Map<string, number>();
    const scan = () => {
      try {
        for (const path of [stdout, stderr]) {
          if (!existsSync(path)) continue;
          const bytes = readFileSync(path);
          output(bytes.subarray(positions.get(path) ?? 0).toString());
          positions.set(path, bytes.length);
        }
      } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
    };
    const watcher = watch(logs, scan);
    watcher.once("error", fail);
    scanAfterLaunch = scan;
    scan();
    return () => { watcher.close(); observer?.kill(); };
  }, matches, timeoutMs, label);
  ready.catch(() => {});
  const assignments = Object.entries(env)
    .map(([key, value]) => `$env:${key}=${powershellQuote(value)}`)
    .join(";");
  // Windows does not notify file watchers for writes through an open redirect handle.
  // Closing each event's append keeps warm output intact and makes readiness observable.
  const relay = `${assignments};try { Add-Type -ErrorAction Stop -TypeDefinition @'
using System;
using System.Diagnostics;
using System.IO;
public static class JgStartupOutput {
  public static int Run(string file, string args, string cwd, string stdout, string stderr) {
    var gate = new object();
    using (var process = new Process()) {
      process.StartInfo = new ProcessStartInfo(file, args) {
        WorkingDirectory = cwd, UseShellExecute = false, CreateNoWindow = true,
        RedirectStandardOutput = true, RedirectStandardError = true
      };
      process.OutputDataReceived += (sender, line) => {
        if (line.Data != null) lock (gate) File.AppendAllText(stdout, line.Data + "\\n");
      };
      process.ErrorDataReceived += (sender, line) => {
        if (line.Data != null) lock (gate) File.AppendAllText(stderr, line.Data + "\\n");
      };
      process.Start();
      process.BeginOutputReadLine();
      process.BeginErrorReadLine();
      process.WaitForExit();
      return process.ExitCode;
    }
  }
}
'@
exit ([JgStartupOutput]::Run(${powershellQuote(file)}, ${powershellQuote(args.map(windowsCommandLineArg).join(" "))}, ${powershellQuote(cwd)}, ${powershellQuote(stdout)}, ${powershellQuote(stderr)}))
} catch { [IO.File]::AppendAllText(${powershellQuote(stderr)}, $_.ToString()); exit 1 }`;
  const relayArgs = ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", Buffer.from(relay, "utf16le").toString("base64")];
  const command = `$p=Start-Process -FilePath 'powershell.exe' -ArgumentList @(${powershellArgumentList(relayArgs)}) -WorkingDirectory ${powershellQuote(cwd)} -WindowStyle Hidden -PassThru; [Console]::Out.Write($p.Id)`;
  const encoded = Buffer.from(command, "utf16le").toString("base64");
  const launched = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encoded],
    { encoding: "utf8", windowsHide: true, timeout: 10_000 },
  );
  const pid = Number(launched.stdout?.trim());
  if (launched.status !== 0 || !Number.isFinite(pid) || pid <= 0) {
    failStartup(new Error(`Persistent process launch failed: ${launched.stderr.trim() || `exit ${launched.status}`}`));
    throw new Error(`Persistent process launch failed: ${launched.stderr.trim() || `exit ${launched.status}`}`);
  }
  scanAfterLaunch();
  observer = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$p=Get-Process -Id ${pid} -ErrorAction Stop;$p.WaitForExit()`], { stdio: "ignore", windowsHide: true });
  observer.once("error", failStartup);
  observer.once("exit", () => failStartup(new Error("process exited before readiness")));
  void ready.then(() => observer?.kill(), () => observer?.kill());
  return { pid, ready };
}

async function bootManagedServer(args: string[], cwd: string, env: Record<string, string>, port: number, timeoutMs: number, label: string): Promise<EnsureDevServerResult> {
  const base = `http://127.0.0.1:${port}`;
  const child = process.platform === "win32" ? null : spawn(process.execPath, args, {
    cwd, stdio: ["ignore", "pipe", "pipe"], detached: true,
    env: { ...process.env, ...env }, windowsHide: true,
  });
  const persistent = child === null ? launchPersistentCommand(process.execPath, args, cwd, env, output => output.includes(base), timeoutMs, label) : null;
  const pid = child?.pid ?? persistent!.pid;
  try {
    await (persistent?.ready ?? waitForProcessOutput(child!, output => output.includes(base), timeoutMs, label));
    if (!(await isUp(base))) throw new Error(`${label} announced readiness but did not serve ${base}`);
    writeMarker(port, checkoutIdentity(cwd), pid, headRevision(cwd));
    child?.unref();
    return { child, pid, port, base };
  } catch (error) {
    killPid(pid, true);
    throw error;
  }
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

  await retireDriftedDevServer(port, cwd);
  const live = await isUp(base);
  if (live && readMarker(port)?.identity === identity) {
    return { child: null, port, base };
  }

  if (live) {
    // Something else owns this port — try a few offsets rather than attach wrong.
    for (let step = 1; step <= 20; step += 1) {
      const candidate = 4517 + ((port - 4517 + step * 17) % 483);
      const candidateLive = await isUp(`http://127.0.0.1:${candidate}`);
      if (candidateLive && readMarker(candidate)?.identity === identity) {
        return { child: null, port: candidate, base: `http://127.0.0.1:${candidate}` };
      }
      if (!candidateLive) {
        port = candidate;
        break;
      }
    }
  }

  const args = ["--cwd=apps/dev", "run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"];
  return bootManagedServer(args, cwd, { JG_DEV_PORT: String(port) }, port, 30_000, "Dev server");
}

/** Boot or reuse this checkout's website Vite server for `shoot --site` captures. */
export async function ensureWebServer(cwd = process.cwd()): Promise<EnsureDevServerResult> {
  const identity = checkoutIdentity(cwd);
  let port = resolveWebPort(cwd);
  const base = `http://127.0.0.1:${port}`;
  await retireDriftedDevServer(port, cwd);
  const live = await isUp(base);
  if (live && readMarker(port)?.identity === identity) return { child: null, port, base };

  if (live) {
    for (let step = 1; step <= 20; step += 1) {
      const candidate = 5517 + ((port - 5517 + step * 17) % 400);
      const candidateLive = await isUp(`http://127.0.0.1:${candidate}`);
      if (candidateLive && readMarker(candidate)?.identity === identity) {
        return { child: null, port: candidate, base: `http://127.0.0.1:${candidate}` };
      }
      if (!candidateLive) {
        port = candidate;
        break;
      }
    }
  }

  const args = ["--cwd=apps/web", "run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"];
  return bootManagedServer(args, cwd, {
    JG_WEB_PORT: String(port),
    JG_CAPTURE_SITE: "1",
  }, port, 60_000, "Website dev server");
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

const debuggerStartup = new Map<number, Promise<void>>();

export async function waitForDebugger(port: number, timeoutMs: number): Promise<void> {
  const startup = debuggerStartup.get(port);
  if (startup !== undefined) {
    try { await startup; } finally { debuggerStartup.delete(port); }
  }
  const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Chrome debugger unavailable on :${port}: HTTP ${response.status}`);
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
  const child = spawn(
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
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
      // A daemon Chrome must outlive the Bun command that starts it. Chrome is a GUI-subsystem
      // executable on Windows, so detaching it does not create a console window.
      detached: options.persistent === true || process.platform !== "win32",
    },
  );
  const ready = waitForProcessOutput(child, output => output.includes(`DevTools listening on ws://127.0.0.1:${debugPort}/`), 30_000, "Chrome debugger");
  ready.catch(() => {});
  debuggerStartup.set(debugPort, ready);
  return child;
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
  const launched = launchPersistentCommand(chrome, args, process.cwd(), {}, output => output.includes(`DevTools listening on ws://127.0.0.1:${debugPort}/`), 30_000, "Chrome debugger");
  debuggerStartup.set(debugPort, launched.ready);
  return { pid: launched.pid, child: null };
}

export type CaptureVia = "screencast" | "screenshot";

export interface ViewportPng {
  bytes: Buffer;
  /** Which CDP path produced the pixels — recorded in the shot's timing line. */
  via: CaptureVia;
}

/** Screencast wait before falling back; below the ~20s a software-GL captureScreenshot costs. */
export const SCREENCAST_CAPTURE_TIMEOUT_MS = 15_000;

/**
 * Whether the screencast pump reproduces this profile's pixels exactly. It emits CSS-pixel
 * frames, so a `deviceScaleFactor` above 1 would silently halve a mobile shot's resolution.
 */
export function screencastCapturesFully(profile: DeviceProfile): boolean {
  return profile.deviceScaleFactor === 1;
}

/**
 * Flat screencast frames tolerated before the pump is written off for this shot. The pump
 * composites the page's *last committed* layers, and a WebGL canvas that has not committed
 * one since the screencast started is simply absent from them — so the frame arrives fast,
 * correctly sized, correctly timestamped, and carries a black hole where the 3D view is.
 * A few frames is enough to tell "the canvas has not committed yet" from "this page never
 * will"; past that, the forced re-raster is the only honest capture.
 */
export const MAX_FLAT_SCREENCAST_FRAMES = 4;

/** Distinct sampled colours at or below which a region carries no picture. */
const FLAT_REGION_COLOURS = 2;

/**
 * Whether `region` of a captured PNG holds a picture at all, sampled on a stride grid.
 *
 * This is the acceptance test the fast capture path lacked: size, timestamp, and encoding
 * all passed on a frame whose viewport was one flat colour, so a blank 3D view shipped as
 * a real shot. Scoped to the region because a busy HUD alone clears any whole-frame check.
 */
export function regionCarriesPicture(
  bytes: Uint8Array,
  region: { x: number; y: number; width: number; height: number },
): boolean {
  let decoded: { width: number; height: number; data: Uint8Array };
  try {
    decoded = decodePng(bytes);
  } catch {
    return true; // undecodable here is the size guard's or the scorer's call, not this one
  }
  const { width, height, data } = decoded;
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(width, Math.ceil(region.x + region.width));
  const y1 = Math.min(height, Math.ceil(region.y + region.height));
  if (x1 - x0 < 2 || y1 - y0 < 2) return true;
  const stride = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 24));
  const seen = new Set<number>();
  for (let y = y0; y < y1; y += stride) {
    for (let x = x0; x < x1; x += stride) {
      const i = (y * width + x) * 4;
      seen.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
      if (seen.size > FLAT_REGION_COLOURS) return true;
    }
  }
  return false;
}

/** IHDR width/height without inflating the image data. */
function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes[0] !== 137 || bytes[1] !== 80) return null;
  const read = (offset: number): number =>
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  return { width: read(16), height: read(20) };
}

/**
 * Take the next composited frame off the screencast pump that actually shows the page, or
 * null when none arrives in time. `notBefore` drops a frame the compositor presented before
 * this request, and `liveRegion` drops one whose 3D viewport is a flat colour — the pump can
 * hand back a well-formed frame the canvas has not committed into yet.
 */
async function nextScreencastPng(
  session: CdpSession,
  timeoutMs: number,
  expect?: { width: number; height: number },
  liveRegion?: { x: number; y: number; width: number; height: number },
): Promise<Buffer | null> {
  const notBefore = Date.now() / 1000;
  let flatFrames = 0;
  return await new Promise<Buffer | null>((resolvePromise) => {
    let settled = false;
    const finish = (value: Buffer | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      off();
      void session.send("Page.stopScreencast").catch(() => {});
      resolvePromise(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const off = session.on("Page.screencastFrame", (params) => {
      const sessionId = params.sessionId;
      if (typeof sessionId === "number" || typeof sessionId === "string") {
        void session.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      }
      const data = params.data;
      if (typeof data !== "string" || data.length === 0) return;
      const timestamp = (params.metadata as { timestamp?: number } | undefined)?.timestamp;
      if (typeof timestamp === "number" && timestamp < notBefore) return;
      const bytes = Buffer.from(data, "base64");
      const size = pngSize(bytes);
      // A downscaled or unreadable frame is not this shot — take the slow honest path.
      if (size === null || (expect !== undefined && (size.width !== expect.width || size.height !== expect.height))) {
        finish(null);
        return;
      }
      if (liveRegion !== undefined && !regionCarriesPicture(bytes, liveRegion)) {
        flatFrames += 1;
        if (flatFrames >= MAX_FLAT_SCREENCAST_FRAMES) finish(null);
        return;
      }
      finish(bytes);
    });
    void session.send("Page.startScreencast", { format: "png", everyNthFrame: 1 }).catch(() => finish(null));
  });
}

/**
 * Pull the viewport as a lossless PNG.
 *
 * `Page.captureScreenshot` re-rasters and re-composites the whole frame synchronously;
 * on software GL that costs several frame times (measured ~22s against a 1600x900 WebGL
 * scene whose own cadence is ~4s/frame). The screencast pump hands over the next
 * composited frame instead — same compositor, same PNG encoder, same dimensions — for
 * roughly one frame time. Anything that does not deliver a fresh, correctly-sized frame
 * within `timeoutMs` falls back to `Page.captureScreenshot`, so a page that never
 * commits another frame still captures. `JG_CAPTURE_SCREENCAST=0` forces the old path.
 *
 * Pass `liveRegion` (the 3D viewport in captured pixels) whenever the caller knows it: the
 * pump composites the page's last committed layers, so a canvas that has not committed one
 * since the screencast started is missing from an otherwise valid frame. Without the region
 * that frame is indistinguishable from a good one, and a blank 3D view ships as a real shot.
 *
 * The pump emits CSS-pixel frames — it ignores `deviceScaleFactor` — so a shot under a
 * dsf>1 profile (mobile) must pass `screencast: false` and keep the full-resolution path.
 * {@link screencastCapturesFully} decides that from the device profile.
 */
export async function captureViewportPng(
  session: CdpSession,
  options: {
    timeoutMs?: number;
    expect?: { width: number; height: number };
    screencast?: boolean;
    liveRegion?: { x: number; y: number; width: number; height: number };
  } = {},
): Promise<ViewportPng> {
  if (options.screencast !== false && process.env.JG_CAPTURE_SCREENCAST !== "0") {
    try {
      const bytes = await nextScreencastPng(
        session,
        options.timeoutMs ?? SCREENCAST_CAPTURE_TIMEOUT_MS,
        options.expect,
        options.liveRegion,
      );
      if (bytes !== null) return { bytes, via: "screencast" };
    } catch {
      /* fall back to the synchronous capture */
    }
  }
  const shot = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    optimizeForSpeed: true,
  });
  const data = shot.data;
  if (typeof data !== "string" || data.length === 0) {
    throw new Error("Page.captureScreenshot returned empty data");
  }
  return { bytes: Buffer.from(data, "base64"), via: "screenshot" };
}

/** Wait for a page readiness mutation once; no browser round-trip polling. */
export async function waitCaptureReady(session: CdpSession, timeoutMs: number): Promise<void> {
  const remote = await session.evaluate<{ status: string; error: string | null }>(`new Promise((resolve) => {
    const root = document.documentElement;
    const finish = (status) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve({ status, error: root.dataset.jgCaptureError ?? null });
    };
    const check = () => {
      const status = root.dataset.jgCapture;
      if (status === "ready" || status === "error") finish(status);
    };
    const observer = new MutationObserver(check);
    observer.observe(root, { attributes: true, attributeFilter: ["data-jg-capture"] });
    const timer = setTimeout(() => finish("timeout"), ${timeoutMs});
    check();
  })`, { awaitPromise: true });
  if (remote?.status === "ready") return;
  if (remote?.status === "error") throw new Error(`capture error: ${remote.error ?? "unknown"}`);
  throw new Error(`timed out waiting for data-jg-capture=ready (${timeoutMs}ms)`);
}

/** Clear saved worlds before shoot/drive navigation; a warm browser must still start a clean run. */
export async function clearOriginStorage(session: CdpSession, origin: string): Promise<void> {
  await session.send("Storage.clearDataForOrigin", {
    origin,
    storageTypes: "local_storage,indexeddb,websql,cache_storage,service_workers",
  });
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

export interface CaptureRegions {
  /** The WebGL canvas in device pixels — the 3D viewport, not the whole frame. */
  region?: { x: number; y: number; width: number; height: number };
  /** HUD rectangles drawn over it, in the same space. */
  masks: { x: number; y: number; width: number; height: number }[];
}

/** Cap on returned mask rects; the largest are kept, so the tail costs nothing to drop. */
const MAX_CAPTURE_MASKS = 200;

/** Layout status the shot is judged against, read in the same pass as the regions. */
export interface CapturePageState extends CaptureRegions {
  overflow: string | null;
  collision: string | null;
}

/**
 * Locate the 3D viewport, everything painted over it (in captured-image pixels), and the
 * HUD layout status — everything a shot needs off the page, in **one** `Runtime.evaluate`.
 * Scoring the whole frame lets a busy HUD carry a dead viewport past every threshold — a
 * buried camera still scored `nonblank` because the panels alone supplied the entropy.
 *
 * Masks are discovered by what an element *paints*, not by what it opts into: a game whose
 * HUD is raw divs is the common case, and an opt-in marker would have covered exactly the
 * games that already use the shipped panels. `data-jg-capture-mask` forces an element in.
 * Over-masking is safe — the viewport verdict is withheld once too little of the region
 * survives (see `MIN_SAMPLED_SHARE`).
 *
 * One evaluate, not two: each round trip queues behind the page's own rAF work, so a second
 * read cost another whole frame time (measured 14.2s for the pair on a scene rendering at
 * ~4s/frame).
 */
export async function readCapturePageState(session: CdpSession): Promise<CapturePageState> {
  const raw = await session.evaluate<CapturePageState | null>(`(() => {
    const dpr = window.devicePixelRatio || 1;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x * dpr, y: r.y * dpr, width: r.width * dpr, height: r.height * dpr };
    };
    const canvas = document.querySelector("canvas");
    const canvasRect = canvas === null ? null : canvas.getBoundingClientRect();
    const paints = (style) => {
      if (style.backgroundImage !== "none") return true;
      const match = /rgba?\\(([^)]+)\\)/.exec(style.backgroundColor);
      if (match === null) return false;
      const parts = match[1].split(",").map((v) => Number.parseFloat(v));
      return parts.length < 4 || parts[3] > 0.05;
    };
    const masks = [];
    const accepted = [];
    // A rect wholly inside an accepted mask adds nothing to the union, so it never needs a
    // getComputedStyle — the per-element style resolution is what makes this pass expensive on
    // a deep HUD (measured ~10s on one game, most of it style work on nested panel children).
    const covered = (r) => {
      for (let i = 0; i < accepted.length; i += 1) {
        const m = accepted[i];
        if (r.left >= m.left && r.right <= m.right && r.top >= m.top && r.bottom <= m.bottom) return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll("body *")) {
      if (el.tagName === "CANVAS") continue;
      const forced = el.hasAttribute("data-jg-capture-mask") || el.hasAttribute("data-hud-panel");
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) continue;
      if (canvasRect !== null && (r.right < canvasRect.left || r.left > canvasRect.right ||
          r.bottom < canvasRect.top || r.top > canvasRect.bottom)) continue;
      // An ancestor of the canvas is the page frame, not an overlay drawn on top of it.
      if (canvas !== null && el.contains(canvas)) continue;
      if (covered(r)) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) <= 0.1) continue;
      if (!forced && !paints(style)) continue;
      accepted.push(r);
      masks.push(box(el));
    }
    masks.sort((a, b) => b.width * b.height - a.width * a.height);
    const attr = (selector, name) => {
      const value = document.querySelector(selector)?.getAttribute(name) ?? null;
      return typeof value === "string" && value.length > 0 ? value : null;
    };
    return {
      ...(canvasRect === null ? {} : { region: box(canvas) }),
      masks: masks.slice(0, ${MAX_CAPTURE_MASKS}),
      overflow: attr("[data-hud-overflow]", "data-hud-overflow"),
      collision: attr("[data-jg-layout-collision]", "data-jg-layout-collision"),
    };
  })()`);
  return { masks: [], overflow: null, collision: null, ...(raw ?? {}) };
}

/**
 * Echo the page's own `console.warn`/`console.error` to stderr for the life of a capture.
 * The engine already explains most bad frames in the page console — the camera far-plane
 * warning, asset diagnostics — and none of it reached the agent driving the capture.
 */
export function forwardPageConsole(session: CdpSession, prefix: string): () => void {
  return session.on("Runtime.consoleAPICalled", (params) => {
    const level = params.type;
    if (level !== "warning" && level !== "error") return;
    const args = Array.isArray(params.args) ? params.args : [];
    const text = args
      .map((arg: { value?: unknown; description?: unknown }) =>
        typeof arg?.value === "string" || typeof arg?.value === "number"
          ? String(arg.value)
          : typeof arg?.description === "string"
            ? arg.description
            : "",
      )
      .filter((part) => part.length > 0)
      .join(" ")
      .slice(0, 500);
    if (text.length > 0) console.error(`${prefix} page ${level}: ${text}`);
  });
}

const CAPTURE_SIGNAL_BINDING = "__jgCaptureSignal";

/** Observe metadata in the new document before navigation can replace the old one. @internal */
export async function navigateForPageAttribute(session: CdpSession, url: string, attribute: string, timeoutMs: number): Promise<string> {
  const binding = "__jgMetadataSignal";
  let finish!: (value?: string) => void;
  const value = new Promise<string | undefined>(resolve => { finish = resolve; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const off = session.on("Runtime.bindingCalled", params => {
    if (params.name === binding && typeof params.payload === "string") finish(params.payload);
  });
  try {
    await session.send("Runtime.addBinding", { name: binding });
    await session.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
      const attach = () => {
        const root = document.documentElement;
        if (root === null) return false;
        const check = () => {
          const value = root.getAttribute(${JSON.stringify(attribute)});
          if (value === null) return false;
          window.${binding}(value);
          return true;
        };
        if (!check()) {
          const observer = new MutationObserver(() => { if (check()) observer.disconnect(); });
          observer.observe(root, { attributes: true, attributeFilter: [${JSON.stringify(attribute)}] });
        }
        return true;
      };
      if (attach()) return;
      const pending = new MutationObserver(() => { if (attach()) pending.disconnect(); });
      pending.observe(document, { childList: true });
    })()` });
    timer = setTimeout(() => finish(), timeoutMs);
    const navigation = await session.send("Page.navigate", { url });
    if (typeof navigation.errorText === "string" && navigation.errorText.length > 0) throw new Error(`navigation failed: ${navigation.errorText}`);
    const result = await value;
    if (result === undefined) throw new Error(`timed out waiting for ${attribute} (${timeoutMs}ms)`);
    return result;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    off();
  }
}
/** Sessions whose readiness binding is already installed — re-registering duplicates it per navigation. */
const readinessInstalled = new WeakSet<CdpSession>();

/**
 * Push readiness instead of polling for it. Every `Runtime.evaluate` poll queues behind the
 * page's own rAF work, so on a heavy WebGL page the flag is seen up to a frame time after it
 * is set; a MutationObserver reports it in the task that sets it.
 */
async function installReadinessSignal(session: CdpSession): Promise<void> {
  if (readinessInstalled.has(session)) return;
  // Runs at document start, before <html> exists — hence the two-stage attach.
  const source = `(() => {
    const check = () => {
      const root = document.documentElement;
      if (root === null) return false;
      const status = root.dataset.jgCapture ?? null;
      if (status !== "ready" && status !== "error") return false;
      const state = { status, error: root.dataset.jgCaptureError ?? null };
      try { window.${CAPTURE_SIGNAL_BINDING}(JSON.stringify(state)); } catch { /* binding gone */ }
      return true;
    };
    const attach = () => {
      const root = document.documentElement;
      if (root === null) return false;
      if (!check()) {
        new MutationObserver(check).observe(root, {
          attributes: true,
          attributeFilter: ["data-jg-capture"]
        });
      }
      return true;
    };
    if (attach()) return;
    const pending = new MutationObserver(() => { if (attach()) pending.disconnect(); });
    pending.observe(document, { childList: true });
  })()`;
  await session.send("Runtime.addBinding", { name: CAPTURE_SIGNAL_BINDING });
  await session.send("Page.addScriptToEvaluateOnNewDocument", { source });
  readinessInstalled.add(session);
}

/** Navigate and surface browser/page failures instead of waiting for the capture timeout. */
export async function navigateCapturePage(
  session: CdpSession,
  url: string,
  timeoutMs: number,
): Promise<void> {
  let pageFailure: string | undefined;
  let frameId: string | undefined;
  let settle!: () => void;
  const changed = new Promise<void>((resolve) => { settle = resolve; });
  let signalled: { status: string | null; error: string | null } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const requestFrames = new Map<string, string>();
  const requests = new Map<string, { url: string; type: string; startedAt: number; status?: number }>();
  const failedResources: Array<{ url: string; status?: number; error?: string }> = [];
  const pendingDocumentFailures: Array<{ frameId?: string; message: string }> = [];
  const offSignal = session.on("Runtime.bindingCalled", (params) => {
    if (params.name !== CAPTURE_SIGNAL_BINDING || typeof params.payload !== "string") return;
    try {
      signalled = JSON.parse(params.payload) as { status: string | null; error: string | null };
      if (signalled.status === "ready" || signalled.status === "error") settle();
    } catch {
      /* ignore malformed binding payloads */
    }
  });
  const offException = session.on("Runtime.exceptionThrown", (params) => {
    pageFailure ??= exceptionMessage(params);
    settle();
  });
  const offRequest = session.on("Network.requestWillBeSent", (params) => {
    const request = params.request as { url?: string } | undefined;
    if (typeof params.requestId === "string" && typeof request?.url === "string") {
      requests.set(params.requestId, { url: request.url, type: String(params.type ?? "unknown"), startedAt: performance.now() });
    }
    if (params.type !== "Document") return;
    if (typeof params.requestId === "string" && typeof params.frameId === "string") {
      requestFrames.set(params.requestId, params.frameId);
    }
  });
  const offResponse = session.on("Network.responseReceived", (params) => {
    const response = params.response as { status?: number } | undefined;
    const request = typeof params.requestId === "string" ? requests.get(params.requestId) : undefined;
    if (request !== undefined && typeof response?.status === "number") {
      request.status = response.status;
      if (response.status >= 400) failedResources.push({ url: request.url, status: response.status });
    }
  });
  const offFinished = session.on("Network.loadingFinished", (params) => {
    if (typeof params.requestId === "string") requests.delete(params.requestId);
  });
  const offLoadingFailed = session.on("Network.loadingFailed", (params) => {
    const errorText = typeof params.errorText === "string" ? params.errorText : "unknown error";
    if (typeof params.requestId === "string") {
      const request = requests.get(params.requestId);
      if (request !== undefined) failedResources.push({ url: request.url, error: errorText });
      requests.delete(params.requestId);
    }
    if (params.type !== "Document") return;
    const failedFrameId = typeof params.requestId === "string" ? requestFrames.get(params.requestId) : undefined;
    const message = `page load failed: ${errorText}`;
    if (frameId === undefined) pendingDocumentFailures.push({ frameId: failedFrameId, message });
    else if (failedFrameId === undefined || failedFrameId === frameId) {
      pageFailure ??= message;
      settle();
    }
  });
  try {
    await session.send("Network.enable");
    await installReadinessSignal(session);
    const navigation = await session.send("Page.navigate", { url });
    if (typeof navigation.errorText === "string" && navigation.errorText.length > 0) {
      throw new Error(`navigation failed for ${url}: ${navigation.errorText}`);
    }
    frameId = typeof navigation.frameId === "string" ? navigation.frameId : undefined;
    const matchingFailure = pendingDocumentFailures.find(
      (failure) => frameId === undefined || failure.frameId === undefined || failure.frameId === frameId,
    );
    if (matchingFailure !== undefined) pageFailure ??= matchingFailure.message;

    if (pageFailure !== undefined) throw new Error(pageFailure);
    timer = setTimeout(settle, timeoutMs);
    await changed;
    if (pageFailure !== undefined) throw new Error(pageFailure);
    if (signalled?.status === "ready") return;
    if (signalled?.status === "error") throw new Error(`capture error: ${signalled.error ?? "unknown"}`);
    throw new Error(`timed out waiting for data-jg-capture=ready (${timeoutMs}ms)`);
  } catch (error) {
    // Network events remain available even when a software-GL draw blocks page JavaScript.
    console.error("[jgengine:capture-network]", JSON.stringify({
      url, timeoutMs,
      pending: Array.from(requests.values(), request => ({ ...request, ageMs: performance.now() - request.startedAt })),
      failed: failedResources,
    }));
    console.error("[jgengine:capture-frame]", JSON.stringify(await captureFailureFrame(session)));
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    offSignal();
    offException();
    offRequest();
    offResponse();
    offFinished();
    offLoadingFailed();
  }
}

/** One bounded diagnostic read; a blocked renderer must not hold failure cleanup open. */
async function captureFailureFrame(session: CdpSession): Promise<unknown> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ unavailable: "page diagnostic read exceeded 2000ms" }), 2_000);
    session.evaluate(`(() => ({
      capture: document.documentElement.dataset.jgCapture ?? null,
      phase: document.documentElement.dataset.jgPhase ?? null,
      canvases: Array.from(document.querySelectorAll("canvas"), canvas => ({
        width: canvas.width, height: canvas.height,
        cssWidth: canvas.getBoundingClientRect().width, cssHeight: canvas.getBoundingClientRect().height,
        ready: canvas.hasAttribute("data-jg-frame-ready"),
        frame: typeof canvas.__jgFrameReadiness === "function" ? canvas.__jgFrameReadiness() : null
      }))
    }))()`).then(value => {
      clearTimeout(timer);
      resolve(value ?? { unavailable: "page returned no diagnostics" });
    }, error => {
      clearTimeout(timer);
      resolve({ unavailable: String(error) });
    });
  });
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
      if (!(await isUp(serverBase))) throw new Error(`capture dev server unavailable after HMR: ${serverBase}`);
      await session.send("Network.setCacheDisabled", { cacheDisabled: true });
    }
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
