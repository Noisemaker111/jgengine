import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * The marker every checkout's dev server writes, so a command can find a server
 * that is already running instead of launching one. `bun run debug` depends on it:
 * reading a live game's report must never start a process of its own.
 */

export interface DevServerMarker {
  identity: string;
  port: number;
  pid?: number;
  /** Commit this server booted from; absent for markers written before revision keying. */
  head?: string;
}

const MARKER_PREFIX = "jgengine-dev-";

export function markerPath(port: number): string {
  return join(tmpdir(), `${MARKER_PREFIX}${port}.json`);
}

export function readMarker(port: number): DevServerMarker | null {
  try {
    return JSON.parse(readFileSync(markerPath(port), "utf8")) as DevServerMarker;
  } catch {
    return null;
  }
}

export function writeMarker(port: number, identity: string, pid?: number, head?: string): void {
  const body: DevServerMarker = { identity, port, pid, head };
  writeFileSync(markerPath(port), `${JSON.stringify(body)}\n`);
}

/** Every marker on this machine, newest file first is irrelevant — callers filter by identity. */
export function listMarkers(): DevServerMarker[] {
  const out: DevServerMarker[] = [];
  let names: string[];
  try {
    names = readdirSync(tmpdir());
  } catch {
    return out;
  }
  for (const name of names) {
    if (!name.startsWith(MARKER_PREFIX) || !name.endsWith(".json")) continue;
    const port = Number(name.slice(MARKER_PREFIX.length, -".json".length));
    if (!Number.isFinite(port)) continue;
    const marker = readMarker(port);
    if (marker !== null) out.push(marker);
  }
  return out;
}

/** True when something answers HTTP with a 2xx or 3xx at `url`. */
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
    const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", windowsHide: true, timeout: 5_000 });
    if (top.status === 0 && top.stdout.trim().length > 0) return top.stdout.trim();
  } catch {
    /* fall through */
  }
  return resolve(cwd);
}

/**
 * The dev server already serving this checkout, or null. Never starts one: a
 * `bun run debug` that launched its own server would have no game to read.
 */
export async function findRunningDevServer(cwd = process.cwd()): Promise<{ port: number; base: string } | null> {
  const identity = checkoutIdentity(cwd);
  const candidates = listMarkers()
    .filter((marker) => marker.identity === identity)
    .sort((a, b) => (b.port === Number(process.env.JG_DEV_PORT) ? 1 : 0) - (a.port === Number(process.env.JG_DEV_PORT) ? 1 : 0));
  for (const marker of candidates) {
    const base = `http://127.0.0.1:${marker.port}`;
    if (await isUp(base)) return { port: marker.port, base };
  }
  return null;
}
