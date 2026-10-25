/**
 * One dev-server and capture broker per machine. Every shoot, drive and perf run on this PC asks it
 * for the Vite server of its checkout (and `--game-dir`), and for a turn in the one shared browser:
 *
 * - a server is started once per checkout + game dir + kind and reused by every later run, so
 *   parallel agents never boot duplicates or attach to another checkout's server;
 * - the broker owns those servers as its own children and stops one nobody has leased for
 *   `JG_BROKER_IDLE_MINUTES` (10), and exits itself once nothing is left;
 * - a lease belongs to the client's pid, so a run that is killed gives its lease back within seconds;
 * - captures take turns in one headless Chrome (`JG_CAPTURE_SLOTS`, default 1), so pages never
 *   compete for the frame clock and a dead run's tabs are closed when its turn ends.
 *
 *   bun scripts/devBroker.ts status   # what is running, who holds what
 *   bun scripts/devBroker.ts stop     # stop every server, the browser and the broker
 *
 * `JG_BROKER=0` turns it off: runs launch their own servers as before.
 */
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { clearViteCaches } from "./captureRevision";
import { localRequest } from "./localhostHttp";

/** Bumped when the HTTP contract changes, so a client never talks to a broker it cannot read. */
export const BROKER_PROTOCOL = 1;

export type ServerKind = "runner" | "website";

export function brokerPort(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.JG_BROKER_PORT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 4498;
}

export function brokerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.JG_BROKER !== "0";
}

function minutesEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const n = Number(env[name]);
  return (Number.isFinite(n) && n > 0 ? n : fallback) * 60_000;
}

export function brokerIdleMs(env: NodeJS.ProcessEnv = process.env): number {
  return minutesEnv(env, "JG_BROKER_IDLE_MINUTES", 10);
}

export function brokerStatePath(dir = tmpdir()): string {
  return join(dir, "jgengine-broker.json");
}

export function brokerLogPath(dir = tmpdir()): string {
  return join(dir, "jgengine-broker.log");
}

/** The identity the dev server's own `/__jgengine/server` route reports for this root and game dir. */
export function servedIdentity(root: string, gameDir: string | null): string {
  return gameDir === null ? root : `${root}|game-dir:${gameDir}`;
}

export function serverKey(request: { root: string; gameDir: string | null; kind: ServerKind }): string {
  return `${request.kind}:${servedIdentity(request.root, request.gameDir)}`;
}

export interface ServerRequest {
  root: string;
  gameDir: string | null;
  kind: ServerKind;
  /** Commit plus games world; a change restarts an unleased server instead of serving stale aliases. */
  fingerprint: string;
  clientPid: number;
  label: string;
  /** Port the checkout's hash prefers, so a server lands where older tooling expects it. */
  preferredPort?: number;
}

export interface ServerGrant {
  leaseId: string;
  port: number;
  base: string;
  reused: boolean;
  /** Set when the tree moved but other runs still hold the server, so it was reused anyway. */
  stale?: string;
}

export interface CaptureGrant {
  leaseId: string;
  chromePort: number;
  waitedMs: number;
}

export interface LaunchedProcess {
  pid: number;
  /** Resolves when the process exits, for whatever reason. */
  exited: Promise<void>;
  stop(): Promise<void>;
}

export interface LaunchedServer extends LaunchedProcess {
  port: number;
  logPath?: string;
}

export interface LaunchedChrome extends LaunchedProcess {
  port: number;
}

export interface BrokerDeps {
  now(): number;
  isAlive(pid: number): boolean;
  /** Start a server on `port` and resolve once it answers as `servedIdentity(root, gameDir)`. */
  startServer(request: ServerRequest, port: number): Promise<LaunchedServer>;
  startChrome(): Promise<LaunchedChrome>;
  /** A free port, `preferred` when it is free and not in `taken`. */
  pickPort(preferred: number | undefined, taken: ReadonlySet<number>): Promise<number>;
  rootExists(path: string): boolean;
  /** Close every page a finished capture left in the shared browser. */
  closeStrayPages(chromePort: number): Promise<number>;
  log(line: string): void;
  /** Drop the dep-optimizer cache a restarted server would otherwise reuse from the old tree. */
  clearCaches?(root: string): void;
  idleMs: number;
  maxServers: number;
  captureSlots: number;
  /** A capture turn older than this is revoked so one hung run cannot hold the browser forever. */
  captureMaxMs: number;
}

interface Lease {
  id: string;
  kind: "server" | "chrome" | "capture";
  clientPid: number;
  label: string;
  key?: string;
  createdAt: number;
}

interface ServerEntry {
  key: string;
  request: ServerRequest;
  port: number;
  fingerprint: string;
  launched: LaunchedServer | null;
  starting: Promise<LaunchedServer> | null;
  leases: Set<string>;
  lastUsed: number;
}

interface Waiter {
  leaseId: string;
  clientPid: number;
  label: string;
  since: number;
  resolve(grant: CaptureGrant): void;
  reject(error: Error): void;
}

export interface BrokerStatus {
  protocol: number;
  pid: number;
  servers: { key: string; port: number; pid: number | null; leases: string[]; idleSeconds: number; state: "starting" | "ready" }[];
  chrome: { port: number; pid: number } | null;
  capture: { holders: string[]; queued: string[] };
  leases: number;
}

/** A capture turn is revoked after 20 minutes unless `JG_CAPTURE_MAX_MINUTES` says otherwise. */
export function captureMaxMs(env: NodeJS.ProcessEnv = process.env): number {
  return minutesEnv(env, "JG_CAPTURE_MAX_MINUTES", 20);
}

export function captureSlots(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.JG_CAPTURE_SLOTS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/**
 * The broker's decisions, with every process, port and clock behind {@link BrokerDeps} so the
 * policy is tested without starting anything.
 */
export class BrokerCore {
  private readonly servers = new Map<string, ServerEntry>();
  private readonly leases = new Map<string, Lease>();
  private readonly holders = new Map<string, { label: string; clientPid: number; since: number }>();
  private readonly queue: Waiter[] = [];
  private chrome: LaunchedChrome | null = null;
  private chromeStarting: Promise<LaunchedChrome> | null = null;
  private gate: Promise<void> = Promise.resolve();
  private chromeLastUsed: number;
  private lastActivity: number;

  constructor(private readonly deps: BrokerDeps) {
    this.chromeLastUsed = deps.now();
    this.lastActivity = deps.now();
  }

  async acquireServer(request: ServerRequest): Promise<ServerGrant> {
    this.lastActivity = this.deps.now();
    // Find-or-create runs one request at a time, so parallel runs of one checkout never both start a
    // server and two new servers never pick the same port. Waiting for the boot happens outside it.
    const { entry, lease, reused, stale } = await this.serialize(() => this.claimServer(request));
    try {
      const launched = entry.launched ?? (await entry.starting!);
      return {
        leaseId: lease.id,
        port: launched.port,
        base: `http://127.0.0.1:${launched.port}`,
        reused,
        ...(stale === undefined ? {} : { stale }),
      };
    } catch (error) {
      this.release(lease.id);
      throw error;
    }
  }

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.gate.then(fn);
    this.gate = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async claimServer(request: ServerRequest): Promise<{ entry: ServerEntry; lease: Lease; reused: boolean; stale?: string }> {
    const key = serverKey(request);
    let entry = this.servers.get(key);
    let stale: string | undefined;
    if (entry !== undefined && entry.fingerprint !== request.fingerprint && entry.starting === null) {
      if (this.liveLeases(entry) === 0) {
        this.deps.log(`server ${key}: tree moved (${entry.fingerprint} -> ${request.fingerprint}), restarting`);
        await this.stopServer(entry);
        this.deps.clearCaches?.(request.root);
        entry = undefined;
      } else {
        stale = `tree moved since this server started, but ${this.liveLeases(entry)} other run(s) still hold it`;
      }
    }
    const reused = entry !== undefined;
    if (entry === undefined) {
      await this.evictForRoom();
      const taken = new Set([...this.servers.values()].map((server) => server.port));
      const port = await this.deps.pickPort(request.preferredPort, taken);
      const fresh: ServerEntry = {
        key,
        request,
        port,
        fingerprint: request.fingerprint,
        launched: null,
        starting: null,
        leases: new Set(),
        lastUsed: this.deps.now(),
      };
      fresh.starting = this.deps.startServer(request, port).then(
        (launched) => {
          fresh.launched = launched;
          fresh.starting = null;
          void launched.exited.then(() => {
            if (this.servers.get(key) === fresh) {
              this.deps.log(`server ${key} on :${port} exited`);
              this.servers.delete(key);
            }
          });
          return launched;
        },
        (error: unknown) => {
          if (this.servers.get(key) === fresh) this.servers.delete(key);
          throw error;
        },
      );
      this.servers.set(key, fresh);
      this.deps.log(`server ${key}: starting on :${port} for ${request.label}`);
      entry = fresh;
    }
    const lease = this.addLease("server", request.clientPid, request.label, key);
    entry.leases.add(lease.id);
    entry.lastUsed = this.deps.now();
    return { entry, lease, reused, ...(stale === undefined ? {} : { stale }) };
  }

  /** The shared browser's debug port, started on first use. The lease keeps it up. */
  async acquireChrome(clientPid: number, label: string): Promise<{ leaseId: string; chromePort: number; started: boolean }> {
    this.lastActivity = this.deps.now();
    const lease = this.addLease("chrome", clientPid, label);
    try {
      const started = this.chrome === null;
      const chrome = await this.ensureChrome();
      return { leaseId: lease.id, chromePort: chrome.port, started };
    } catch (error) {
      this.release(lease.id);
      throw error;
    }
  }

  /** Wait for a turn in the shared browser. Rejects after `waitMs` naming who holds it. */
  acquireCapture(clientPid: number, label: string, waitMs: number): { grant: Promise<CaptureGrant>; cancel(): void } {
    this.lastActivity = this.deps.now();
    const lease = this.addLease("capture", clientPid, label);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const grant = new Promise<CaptureGrant>((resolve, reject) => {
      this.queue.push({
        leaseId: lease.id,
        clientPid,
        label,
        since: this.deps.now(),
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      timer = setTimeout(() => {
        const index = this.queue.findIndex((waiter) => waiter.leaseId === lease.id);
        if (index < 0) return;
        this.queue.splice(index, 1);
        this.leases.delete(lease.id);
        reject(new Error(`waited ${Math.round(waitMs / 1000)}s for the shared browser; ${this.describeHolders()}`));
      }, waitMs);
      timer.unref?.();
    });
    void this.grantTurns();
    return { grant, cancel: () => this.release(lease.id) };
  }

  release(leaseId: string): boolean {
    const lease = this.leases.get(leaseId);
    if (lease === undefined) return false;
    this.leases.delete(leaseId);
    this.lastActivity = this.deps.now();
    if (lease.key !== undefined) {
      const entry = this.servers.get(lease.key);
      if (entry !== undefined) {
        entry.leases.delete(leaseId);
        entry.lastUsed = this.deps.now();
      }
    }
    if (lease.kind === "chrome" || lease.kind === "capture") this.chromeLastUsed = this.deps.now();
    if (lease.kind === "capture") {
      const index = this.queue.findIndex((waiter) => waiter.leaseId === leaseId);
      if (index >= 0) {
        const [waiter] = this.queue.splice(index, 1);
        waiter!.reject(new Error("capture request released before its turn"));
      }
      if (this.holders.delete(leaseId)) {
        if (this.holders.size === 0 && this.chrome !== null) {
          const port = this.chrome.port;
          void this.deps.closeStrayPages(port).then((closed) => {
            if (closed > 0) this.deps.log(`chrome :${port}: closed ${closed} page(s) ${lease.label} left open`);
          });
        }
        void this.grantTurns();
      }
    }
    return true;
  }

  /**
   * One pass of housekeeping: drop leases whose client died, revoke a turn held too long, stop
   * servers and the browser nobody has used for the idle window. Returns true once the broker has
   * nothing left and has been idle that long, so it should exit.
   */
  async sweep(): Promise<boolean> {
    const now = this.deps.now();
    for (const lease of [...this.leases.values()]) {
      if (!this.deps.isAlive(lease.clientPid)) {
        this.deps.log(`lease ${lease.kind} for ${lease.label} (pid ${lease.clientPid}): client gone, released`);
        this.release(lease.id);
      }
    }
    for (const [leaseId, holder] of [...this.holders.entries()]) {
      if (now - holder.since >= this.deps.captureMaxMs) {
        this.deps.log(`capture turn for ${holder.label} held ${Math.round((now - holder.since) / 1000)}s, revoked`);
        this.release(leaseId);
      }
    }
    for (const entry of [...this.servers.values()]) {
      if (entry.starting !== null) continue;
      if (!this.deps.rootExists(entry.request.root)) {
        this.deps.log(`server ${entry.key}: checkout is gone, stopping`);
        await this.stopServer(entry);
        continue;
      }
      if (this.liveLeases(entry) === 0 && now - entry.lastUsed >= this.deps.idleMs) {
        this.deps.log(`server ${entry.key}: idle ${Math.round((now - entry.lastUsed) / 60_000)}m, stopping`);
        await this.stopServer(entry);
      }
    }
    if (this.chrome !== null && this.chromeLeases() === 0 && now - this.chromeLastUsed >= this.deps.idleMs) {
      this.deps.log(`chrome :${this.chrome.port}: idle, stopping`);
      await this.stopChrome();
    }
    const empty = this.servers.size === 0 && this.chrome === null && this.chromeStarting === null && this.leases.size === 0;
    return empty && now - this.lastActivity >= this.deps.idleMs;
  }

  status(pid = process.pid): BrokerStatus {
    const now = this.deps.now();
    return {
      protocol: BROKER_PROTOCOL,
      pid,
      servers: [...this.servers.values()].map((entry) => ({
        key: entry.key,
        port: entry.port,
        pid: entry.launched?.pid ?? null,
        leases: [...entry.leases].map((id) => this.leases.get(id)?.label ?? id),
        idleSeconds: this.liveLeases(entry) > 0 ? 0 : Math.round((now - entry.lastUsed) / 1000),
        state: entry.launched === null ? "starting" : "ready",
      })),
      chrome: this.chrome === null ? null : { port: this.chrome.port, pid: this.chrome.pid },
      capture: {
        holders: [...this.holders.values()].map((holder) => `${holder.label} (pid ${holder.clientPid})`),
        queued: this.queue.map((waiter) => `${waiter.label} (pid ${waiter.clientPid})`),
      },
      leases: this.leases.size,
    };
  }

  /** Stop everything this broker started. */
  async shutdown(): Promise<void> {
    for (const waiter of this.queue.splice(0)) waiter.reject(new Error("broker shutting down"));
    this.holders.clear();
    this.leases.clear();
    await Promise.all([...this.servers.values()].map((entry) => this.stopServer(entry)));
    await this.stopChrome();
  }

  private addLease(kind: Lease["kind"], clientPid: number, label: string, key?: string): Lease {
    const lease: Lease = { id: randomUUID(), kind, clientPid, label, createdAt: this.deps.now(), ...(key === undefined ? {} : { key }) };
    this.leases.set(lease.id, lease);
    return lease;
  }

  private liveLeases(entry: ServerEntry): number {
    let count = 0;
    for (const id of entry.leases) if (this.leases.has(id)) count += 1;
    return count;
  }

  private chromeLeases(): number {
    let count = 0;
    for (const lease of this.leases.values()) if (lease.kind !== "server") count += 1;
    return count;
  }

  private describeHolders(): string {
    const now = this.deps.now();
    const held = [...this.holders.values()].map(
      (holder) => `${holder.label} (pid ${holder.clientPid}) for ${Math.round((now - holder.since) / 1000)}s`,
    );
    return held.length === 0 ? "nobody holds it, the browser may be failing to start" : `held by ${held.join(", ")}`;
  }

  private async grantTurns(): Promise<void> {
    while (this.queue.length > 0 && this.holders.size < this.deps.captureSlots) {
      const waiter = this.queue.shift()!;
      if (!this.leases.has(waiter.leaseId)) continue;
      this.holders.set(waiter.leaseId, { label: waiter.label, clientPid: waiter.clientPid, since: this.deps.now() });
      try {
        const chrome = await this.ensureChrome();
        waiter.resolve({ leaseId: waiter.leaseId, chromePort: chrome.port, waitedMs: this.deps.now() - waiter.since });
      } catch (error) {
        this.holders.delete(waiter.leaseId);
        this.leases.delete(waiter.leaseId);
        waiter.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  private async ensureChrome(): Promise<LaunchedChrome> {
    if (this.chrome !== null) return this.chrome;
    this.chromeStarting ??= this.deps.startChrome().then(
      (chrome) => {
        this.chrome = chrome;
        this.chromeStarting = null;
        this.chromeLastUsed = this.deps.now();
        this.deps.log(`chrome :${chrome.port} started (pid ${chrome.pid})`);
        void chrome.exited.then(() => {
          if (this.chrome === chrome) {
            this.deps.log(`chrome :${chrome.port} exited`);
            this.chrome = null;
          }
        });
        return chrome;
      },
      (error: unknown) => {
        this.chromeStarting = null;
        throw error;
      },
    );
    return this.chromeStarting;
  }

  private async stopChrome(): Promise<void> {
    const chrome = this.chrome;
    this.chrome = null;
    if (chrome !== null) await chrome.stop();
  }

  private async stopServer(entry: ServerEntry): Promise<void> {
    if (this.servers.get(entry.key) === entry) this.servers.delete(entry.key);
    for (const id of entry.leases) this.leases.delete(id);
    const launched = entry.launched ?? (await entry.starting?.catch(() => null)) ?? null;
    if (launched !== null) await launched.stop();
  }

  /** Make room under `maxServers` by stopping the least recently used unleased server. */
  private async evictForRoom(): Promise<void> {
    if (this.servers.size < this.deps.maxServers) return;
    const idle = [...this.servers.values()]
      .filter((entry) => entry.starting === null && this.liveLeases(entry) === 0)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    const victim = idle[0];
    if (victim === undefined) {
      this.deps.log(`${this.servers.size} servers all leased; starting one more past the cap of ${this.deps.maxServers}`);
      return;
    }
    this.deps.log(`server ${victim.key}: stopped to make room (cap ${this.deps.maxServers})`);
    await this.stopServer(victim);
  }
}

/** Environment a broker-owned server gets: the broker's own minus anything one client set for itself. */
export function serverEnv(base: NodeJS.ProcessEnv, request: ServerRequest, port: number, idleMs: number, brokerPid: number): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (/^(VITE_)?JG_GAME_DIR$|^JG_GAMES_DIR$|^JG_(DEV|WEB)_PORT$|^JG_CAPTURE_SITE$|^JG_STEP_FILE$|^JG_DEV_IDLE_MINUTES$/.test(key)) continue;
    env[key] = value;
  }
  if (request.gameDir !== null) {
    env.JG_GAME_DIR = request.gameDir;
    env.VITE_JG_GAME_DIR = request.gameDir.replace(/\\/g, "/");
    env.JG_GAMES_DIR = join(request.gameDir, "..");
  }
  if (request.kind === "runner") env.JG_DEV_PORT = String(port);
  else {
    env.JG_WEB_PORT = String(port);
    env.JG_CAPTURE_SITE = "1";
  }
  // The server's own watchdog is the backstop for a broker that died: it outlasts the broker's idle
  // window, and exits within a minute once the broker pid is gone.
  env.JG_DEV_IDLE_MINUTES = String(Math.ceil(idleMs / 60_000) + 10);
  env.JG_BROKER_PID = String(brokerPid);
  return env;
}

function pidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function killTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const child = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, 15_000);
      child.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* gone */
    }
  }
}

export function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once("error", () => resolve(false));
    probe.listen({ port, host: "127.0.0.1", exclusive: true }, () => probe.close(() => resolve(true)));
  });
}

async function anyFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen({ port: 0, host: "127.0.0.1" }, () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function pickPort(preferred: number | undefined, taken: ReadonlySet<number>): Promise<number> {
  if (preferred !== undefined && !taken.has(preferred) && (await portFree(preferred))) return preferred;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = await anyFreePort();
    if (!taken.has(port)) return port;
  }
  throw new Error("no free port for a dev server");
}

function logTail(path: string, lines = 12): string {
  try {
    return readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line.trim() !== "").slice(-lines).join("\n");
  } catch {
    return "";
  }
}

/** Start a Vite server as this broker's child and wait until it answers as the requested checkout. */
async function startRealServer(request: ServerRequest, port: number, idleMs: number, log: (line: string) => void): Promise<LaunchedServer> {
  const logDir = join(tmpdir(), "jgengine-broker-logs");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `${createHash("sha256").update(serverKey(request)).digest("hex").slice(0, 12)}.log`);
  const fd = openSync(logPath, "w");
  const app = request.kind === "runner" ? "apps/dev" : "apps/web";
  const child = spawn(
    process.execPath,
    [`--cwd=${app}`, "run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: request.root,
      env: serverEnv(process.env, request, port, idleMs, process.pid),
      stdio: ["ignore", fd, fd],
      windowsHide: true,
      detached: process.platform !== "win32",
    },
  );
  closeSync(fd);
  const pid = child.pid;
  if (pid === undefined) throw new Error(`could not spawn the ${app} dev server for ${request.root}`);
  let exitCode: number | null | undefined;
  const exited = new Promise<void>((resolve) => {
    child.once("exit", (code) => {
      exitCode = code;
      resolve();
    });
    child.once("error", () => resolve());
  });
  const stop = async (): Promise<void> => {
    if (exitCode !== undefined) return;
    await killTree(pid);
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
  };
  const expected = servedIdentity(request.root, request.gameDir);
  const budgetMs = request.kind === "runner" ? 120_000 : 180_000;
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (exitCode !== undefined) {
      throw new Error(`the ${app} dev server for ${request.root} exited (code ${exitCode}) before answering on :${port}\n${logTail(logPath)}`);
    }
    try {
      const response = await localRequest(`http://127.0.0.1:${port}/__jgengine/server`, { timeoutMs: 2_000 });
      if (response.status === 200) {
        const report = JSON.parse(response.body) as { identity?: string };
        if (report.identity === expected) {
          log(`server ${serverKey(request)}: ready on :${port} (pid ${pid})`);
          return { pid, port, exited, stop, logPath };
        }
        await stop();
        throw new Error(`:${port} answered as ${report.identity ?? "unknown"}, not ${expected}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(`:${port} answered`)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  await stop();
  throw new Error(`the ${app} dev server for ${request.root} did not answer on :${port} within ${budgetMs / 1000}s\n${logTail(logPath)}`);
}

async function startRealChrome(): Promise<LaunchedChrome> {
  const { startBrowser, removeProfileDir, waitForPidExit } = await import("./browser-lib");
  const port = await pickPort(undefined, new Set());
  const started = await startBrowser({ debugPort: port, prefix: "jg-broker-" });
  const browser = started.browser;
  const pid = browser.pid!;
  const exited = new Promise<void>((resolve) => {
    if (browser.exitCode !== null) resolve();
    else browser.once("exit", () => resolve());
  });
  return {
    pid,
    port,
    exited,
    async stop() {
      await killTree(pid);
      await waitForPidExit(pid);
      removeProfileDir(browser.userDataDir);
    },
  };
}

async function closeStrayPages(chromePort: number): Promise<number> {
  try {
    const response = await localRequest(`http://127.0.0.1:${chromePort}/json/list`, { timeoutMs: 3_000 });
    const targets = JSON.parse(response.body) as { id: string; type: string; url: string }[];
    const pages = targets.filter((target) => target.type === "page");
    let closed = 0;
    for (const page of pages) {
      if (page.url === "about:blank") continue;
      await localRequest(`http://127.0.0.1:${chromePort}/json/close/${encodeURIComponent(page.id)}`, { timeoutMs: 3_000 }).catch(() => null);
      closed += 1;
    }
    if (closed > 0 && closed === pages.length) {
      await localRequest(`http://127.0.0.1:${chromePort}/json/new?about:blank`, { method: "PUT", timeoutMs: 3_000 }).catch(() => null);
    }
    return closed;
  } catch {
    return 0;
  }
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (raw === "") return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") throw new Error(`missing ${name}`);
  return value;
}

function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`missing ${name}`);
  return value;
}

/** The broker's HTTP face. `onStop` runs after `/v1/stop` has answered. */
export function brokerHandler(core: BrokerCore, onStop: () => void) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/v1/status") return send(res, 200, core.status());
      if (req.method !== "POST") return send(res, 404, { error: `no route ${req.method} ${url.pathname}` });
      const body = await readBody(req);
      if (url.pathname === "/v1/server") {
        const kind = body.kind === "website" ? "website" : "runner";
        const request: ServerRequest = {
          root: text(body.root, "root"),
          gameDir: typeof body.gameDir === "string" && body.gameDir !== "" ? body.gameDir : null,
          kind,
          fingerprint: typeof body.fingerprint === "string" ? body.fingerprint : "",
          clientPid: number(body.clientPid, "clientPid"),
          label: typeof body.label === "string" ? body.label : "client",
          ...(typeof body.preferredPort === "number" ? { preferredPort: body.preferredPort } : {}),
        };
        return send(res, 200, await core.acquireServer(request));
      }
      if (url.pathname === "/v1/chrome") {
        return send(res, 200, await core.acquireChrome(number(body.clientPid, "clientPid"), String(body.label ?? "client")));
      }
      if (url.pathname === "/v1/capture") {
        const waitMs = typeof body.waitMs === "number" && body.waitMs > 0 ? body.waitMs : 15 * 60_000;
        const turn = core.acquireCapture(number(body.clientPid, "clientPid"), String(body.label ?? "client"), waitMs);
        // A client that gave up while queued must not be granted a turn nobody will release.
        res.once("close", () => {
          if (!res.writableEnded) turn.cancel();
        });
        try {
          return send(res, 200, await turn.grant);
        } catch (error) {
          return send(res, 408, { error: error instanceof Error ? error.message : String(error) });
        }
      }
      if (url.pathname === "/v1/release") return send(res, 200, { released: core.release(text(body.leaseId, "leaseId")) });
      if (url.pathname === "/v1/stop") {
        send(res, 200, { stopping: true });
        onStop();
        return;
      }
      return send(res, 404, { error: `no route POST ${url.pathname}` });
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  };
}

function writeLog(line: string): void {
  const stamped = `${new Date().toISOString()} ${line}\n`;
  try {
    appendFileSync(brokerLogPath(), stamped);
  } catch {
    /* logging never takes the broker down */
  }
}

/** Run the broker in this process until it goes idle or is stopped. Exits 0 when another broker owns the port. */
export async function serveBroker(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const idleMs = brokerIdleMs(env);
  const core = new BrokerCore({
    now: Date.now,
    isAlive: pidAlive,
    startServer: (request, port) => startRealServer(request, port, idleMs, writeLog),
    startChrome: startRealChrome,
    pickPort,
    rootExists: existsSync,
    closeStrayPages,
    log: writeLog,
    clearCaches: (root) => void clearViteCaches(root),
    idleMs,
    maxServers: Number(env.JG_BROKER_MAX_SERVERS) > 0 ? Number(env.JG_BROKER_MAX_SERVERS) : 6,
    captureSlots: captureSlots(env),
    captureMaxMs: captureMaxMs(env),
  });
  let stopping = false;
  const stop = async (reason: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    writeLog(`broker stopping: ${reason}`);
    await core.shutdown();
    try {
      const state = JSON.parse(readFileSync(brokerStatePath(), "utf8")) as { pid?: number };
      if (state.pid === process.pid) unlinkSync(brokerStatePath());
    } catch {
      /* no state to clear */
    }
    process.exit(0);
  };
  const http = createHttpServer(brokerHandler(core, () => void stop("asked to stop")));
  http.requestTimeout = 0;
  const port = brokerPort(env);
  await new Promise<void>((resolve) => {
    http.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") process.exit(0);
      writeLog(`broker could not listen on :${port}: ${error.message}`);
      process.exit(1);
    });
    http.listen(port, "127.0.0.1", () => resolve());
  });
  writeFileSync(brokerStatePath(), JSON.stringify({ pid: process.pid, port, protocol: BROKER_PROTOCOL, startedAt: new Date().toISOString() }));
  writeLog(`broker ready on :${port} (pid ${process.pid}, idle ${Math.round(idleMs / 60_000)}m)`);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, () => void stop(signal));
  const sweepMs = Number(env.JG_BROKER_SWEEP_MS) > 0 ? Number(env.JG_BROKER_SWEEP_MS) : 2_000;
  const timer = setInterval(() => {
    void core.sweep().then((idle) => {
      if (idle) {
        clearInterval(timer);
        void stop("idle with nothing running");
      }
    }, (error: unknown) => writeLog(`sweep failed: ${error instanceof Error ? error.message : String(error)}`));
  }, sweepMs);
}

if (import.meta.main) {
  const verb = process.argv[2] ?? "status";
  if (verb === "serve") {
    await serveBroker();
  } else if (verb === "status" || verb === "stop") {
    const { brokerStatusOrNull, stopBroker } = await import("./devBrokerClient");
    if (verb === "stop") {
      console.log((await stopBroker()) ? "broker: stopped" : "broker: not running");
    } else {
      const status = await brokerStatusOrNull();
      console.log(status === null ? "broker: not running" : JSON.stringify(status, null, 2));
    }
  } else {
    console.log(`usage: bun scripts/devBroker.ts <status|stop|serve>

  status   servers, the shared browser and who holds a capture turn
  stop     stop every broker-owned server, the browser and the broker
  serve    run the broker in this terminal (clients start it on demand)

JG_BROKER=0 turns the broker off; JG_BROKER_IDLE_MINUTES (10) sets the idle stop.`);
    process.exit(verb === "--help" || verb === "-h" || verb === "help" ? 0 : 1);
  }
}
