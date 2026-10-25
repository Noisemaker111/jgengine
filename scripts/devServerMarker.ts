import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { headRevision } from "./captureRevision";
import { localOk, localRequest } from "./localhostHttp";

/**
 * The marker every checkout's dev server writes, so a command can find a server
 * that is already running instead of launching one. `bun run debug` depends on it:
 * reading a live game's report must never start a process of its own.
 *
 * Three writers publish it: `scripts/browser-lib.ts` when it launches a server for a
 * capture, and the `bun dev` Vite configs of `apps/web` and `apps/dev` through
 * {@link devServerMarkerPlugin}. Running `bun dev` and opening the game is the
 * workflow this exists for.
 */

export interface DevServerMarker {
  identity: string;
  port: number;
  pid?: number;
  /** Commit this server booted from; absent for markers written before revision keying. */
  head?: string;
  /** Which config published it; absent on older markers, resolved by probing `/games`. */
  kind?: "website" | "runner";
  /** Host that answers: Vite's default `localhost` can be IPv6-only, where `127.0.0.1` hangs. */
  host?: string;
}

const MARKER_PREFIX = "jgengine-dev-";

export function markerPath(port: number, dir = tmpdir()): string {
  return join(dir, `${MARKER_PREFIX}${port}.json`);
}

export function readMarker(port: number, dir = tmpdir()): DevServerMarker | null {
  try {
    return JSON.parse(readFileSync(markerPath(port, dir), "utf8")) as DevServerMarker;
  } catch {
    return null;
  }
}

export function writeMarker(marker: DevServerMarker, dir = tmpdir()): void {
  writeFileSync(markerPath(marker.port, dir), `${JSON.stringify(marker)}\n`);
}

/**
 * Remove one marker, but only when it belongs to `identity` — a checkout must never
 * delete a marker another checkout published on the same port.
 */
export function removeMarker(port: number, identity?: string, dir = tmpdir()): boolean {
  const marker = readMarker(port, dir);
  if (marker === null) return false;
  if (identity !== undefined && marker.identity !== identity) return false;
  try {
    unlinkSync(markerPath(port, dir));
    return true;
  } catch {
    return false;
  }
}

/** Every marker on this machine — callers filter by identity. */
export function listMarkers(dir = tmpdir()): DevServerMarker[] {
  const out: DevServerMarker[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (!name.startsWith(MARKER_PREFIX) || !name.endsWith(".json")) continue;
    const port = Number(name.slice(MARKER_PREFIX.length, -".json".length));
    if (!Number.isFinite(port)) continue;
    const marker = readMarker(port, dir);
    if (marker !== null) out.push(marker);
  }
  return out;
}

/** True when something answers HTTP with a 2xx or 3xx at `url`. */
export async function isUp(url: string): Promise<boolean> {
  try {
    const response = await localRequest(url, { timeoutMs: 1_000 });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

/**
 * The base URL a server on `port` actually answers on. Vite's default host is
 * `localhost`, which on Windows can bind IPv6 only, so a `127.0.0.1` probe alone can
 * hang until it times out. The marker's recorded host is tried first; the report route
 * is probed before `/` because it answers in milliseconds while an SSR page compiles.
 */
export async function reachableBase(port: number, preferredHost?: string): Promise<string | null> {
  const hosts = [...(preferredHost === undefined ? [] : [preferredHost]), "127.0.0.1", "localhost"];
  for (const host of new Set(hosts)) {
    const base = `http://${host}:${port}`;
    if (await answers(base)) return base;
  }
  return null;
}

async function answers(base: string, timeoutMs = 3_000): Promise<boolean> {
  for (const path of ["/__jgengine/report?game=probe", "/"]) {
    try {
      await localRequest(`${base}${path}`, { timeoutMs });
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

/** Stable identity for this checkout (worktree path or monorepo root). */
export function checkoutIdentity(cwd = process.cwd()): string {
  try {
    const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", windowsHide: true, timeout: 5_000 });
    if (top.status === 0 && top.stdout.trim().length > 0) return top.stdout.trim();
  } catch {
    /* fall through */
  }
  return resolve(cwd);
}

export interface RunningDevServer {
  port: number;
  base: string;
  /** Which config published it: the website (`bun dev`) or the game runner (`dev:runner`, captures). */
  kind: "website" | "runner";
  head?: string;
}

/**
 * Every dev server already serving this checkout, website first. A marker whose server
 * does not answer is skipped, never deleted: a live server can look dead during a slow
 * boot, and a deleted marker would hide it from every later read. Never starts a
 * server — a `bun run debug` that launched its own would have no game to read.
 */
export async function listRunningDevServers(cwd = process.cwd(), dir = tmpdir()): Promise<RunningDevServer[]> {
  const identity = checkoutIdentity(cwd);
  const preferredPort = Number(process.env.JG_DEV_PORT);
  const candidates = listMarkers(dir)
    .filter((marker) => marker.identity === identity)
    .sort((a, b) => (b.port === preferredPort ? 1 : 0) - (a.port === preferredPort ? 1 : 0));
  const running: RunningDevServer[] = [];
  for (const marker of candidates) {
    const base = await reachableBase(marker.port, marker.host);
    if (base === null) continue;
    // The website dev server serves games at /games/<id>; the runner serves them at /?game=<id>.
    const kind = marker.kind ?? ((await servesWebsite(base)) ? "website" : "runner");
    running.push({ port: marker.port, base, kind, ...(marker.head === undefined ? {} : { head: marker.head }) });
  }
  return running.sort((a, b) => (a.kind === b.kind ? a.port - b.port : a.kind === "website" ? -1 : 1));
}

async function servesWebsite(base: string): Promise<boolean> {
  return localOk(`${base}/games`, 1_000);
}

/**
 * The dev server already serving this checkout, or null — website dev first, then the
 * runner. Kept for callers that only need one.
 */
export async function findRunningDevServer(cwd = process.cwd(), dir = tmpdir()): Promise<RunningDevServer | null> {
  const servers = await listRunningDevServers(cwd, dir);
  return servers[0] ?? null;
}

type SocketLike = { once(event: "close", listener: () => void): void };

type ViteServerLike = {
  config: { root: string };
  httpServer?: {
    listening: boolean;
    address(): { port: number } | string | null;
    once(event: string, listener: () => void): void;
    on?(event: "connection", listener: (socket: SocketLike) => void): void;
  } | null;
  middlewares?: unknown;
};

/** Minutes a dev server may sit with no open connection before it exits. */
export const DEFAULT_IDLE_EXIT_MINUTES = 20;

/** `JG_DEV_IDLE_MINUTES`, else 20; `0` keeps the server up forever. */
export function resolveIdleExitMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.JG_DEV_IDLE_MINUTES;
  if (raw === undefined || raw.trim() === "") return DEFAULT_IDLE_EXIT_MINUTES * 60_000;
  const minutes = Number(raw);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 0;
}

export type IdleVerdict = "keep" | "idle" | "orphaned";

/**
 * Whether a dev server should stay up. Captures and agents start servers that nothing
 * ever stops, so they piled up by the dozen; a server now leaves on its own once its
 * checkout is deleted, or once no browser, HMR socket or request has touched it for
 * `idleMs`. An open connection (a tab, a capture) always keeps it.
 */
export function idleVerdict(state: {
  now: number;
  lastActivity: number;
  openSockets: number;
  rootExists: boolean;
  idleMs: number;
}): IdleVerdict {
  if (!state.rootExists) return "orphaned";
  if (state.idleMs <= 0 || state.openSockets > 0) return "keep";
  return state.now - state.lastActivity >= state.idleMs ? "idle" : "keep";
}

/** Watch one server's sockets and exit the process when {@link idleVerdict} says so. */
export function startIdleWatchdog(
  server: ViteServerLike,
  options: {
    idleMs?: number;
    checkEveryMs?: number;
    now?: () => number;
    rootExists?: (root: string) => boolean;
    exit?: (verdict: Exclude<IdleVerdict, "keep">) => void;
  } = {},
): { check(): IdleVerdict; stop(): void } | null {
  const idleMs = options.idleMs ?? resolveIdleExitMs();
  const httpServer = server.httpServer;
  if (httpServer?.on === undefined) return null;
  const now = options.now ?? Date.now;
  const rootExists = options.rootExists ?? existsSync;
  const exit =
    options.exit ??
    ((verdict) => {
      console.error(
        verdict === "orphaned"
          ? `jgengine dev: ${server.config.root} is gone, stopping this server`
          : `jgengine dev: no connection for ${Math.round(idleMs / 60_000)} min, stopping (JG_DEV_IDLE_MINUTES=0 keeps it up)`,
      );
      process.exit(0);
    });
  let lastActivity = now();
  let openSockets = 0;
  httpServer.on("connection", (socket) => {
    openSockets += 1;
    lastActivity = now();
    socket.once("close", () => {
      openSockets -= 1;
      lastActivity = now();
    });
  });
  const check = (): IdleVerdict => {
    const verdict = idleVerdict({ now: now(), lastActivity, openSockets, rootExists: rootExists(server.config.root), idleMs });
    if (verdict !== "keep") exit(verdict);
    return verdict;
  };
  const timer = setInterval(check, options.checkEveryMs ?? 60_000);
  timer.unref?.();
  return { check, stop: () => clearInterval(timer) };
}

/**
 * Dev-only Vite plugin: publish this server's marker once it is listening and remove
 * it on shutdown. `apply: "serve"` keeps it out of every production build, so a
 * deployed site never advertises a debug port.
 */
export function devServerMarkerPlugin(options: { kind: RunningDevServer["kind"]; dir?: string }): {
  name: string;
  apply: "serve";
  configureServer(server: ViteServerLike): void;
} {
  const dir = options.dir;
  let published: { port: number; identity: string } | null = null;
  const cleanup = (): void => {
    if (published === null) return;
    const { port, identity } = published;
    published = null;
    removeMarker(port, identity, dir);
  };
  return {
    name: "jgengine-dev-server-marker",
    apply: "serve",
    configureServer(server) {
      const httpServer = server.httpServer;
      if (httpServer === null || httpServer === undefined) return;
      const publish = (): void => {
        const address = httpServer.address();
        if (address === null || typeof address === "string") return;
        const identity = checkoutIdentity(server.config.root);
        // Record the host that actually answers: `localhost` may be IPv6-only, where a
        // 127.0.0.1 read hangs until it times out.
        const host = "family" in address && address.family === "IPv6" ? "localhost" : "127.0.0.1";
        published = { port: address.port, identity };
        writeMarker(
          {
            identity,
            port: address.port,
            pid: process.pid,
            head: headRevision(server.config.root),
            kind: options.kind,
            host,
          },
          dir,
        );
      };
      if (httpServer.listening) publish();
      else httpServer.once("listening", publish);
      const watchdog = startIdleWatchdog(server);
      httpServer.once("close", () => {
        watchdog?.stop();
        cleanup();
      });
      for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, cleanup);
      process.once("exit", cleanup);
    },
  };
}
