import { spawn, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { headRevision } from "./captureRevision";
import { checkoutIdentity } from "./devServerMarker";
import { BROKER_PROTOCOL, brokerEnabled, brokerPort, type BrokerStatus, type CaptureGrant, type ServerGrant, type ServerKind } from "./devBroker";
import { localPostJson, localRequest } from "./localhostHttp";
import { servedGameDir } from "./servedGame";

/**
 * The client half of `scripts/devBroker.ts`: find or start the machine's broker, then ask it for a
 * server, the shared browser or a capture turn. Leases are tied to this process's pid, so a run
 * that dies gives them back without calling anything.
 */

function brokerBase(env: NodeJS.ProcessEnv = process.env): string {
  return `http://127.0.0.1:${brokerPort(env)}`;
}

export async function brokerStatusOrNull(timeoutMs = 1_500): Promise<BrokerStatus | null> {
  try {
    const response = await localRequest(`${brokerBase()}/v1/status`, { timeoutMs });
    if (response.status !== 200) return null;
    const status = JSON.parse(response.body) as BrokerStatus;
    return typeof status.protocol === "number" ? status : null;
  } catch {
    return null;
  }
}

export async function stopBroker(): Promise<boolean> {
  if ((await brokerStatusOrNull()) === null) return false;
  await localPostJson(`${brokerBase()}/v1/stop`, {}, 5_000).catch(() => null);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await brokerStatusOrNull(500)) === null) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function powershellQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Start the broker so it outlives this run and holds none of its handles. On Windows a child Bun
 * spawns, even detached with stdio ignored, can inherit the caller's pipes and keep an agent's
 * shell command open for hours, so it goes through `Start-Process`, which inherits nothing.
 */
function launchBroker(script: string): void {
  if (process.platform === "win32") {
    const command = `Start-Process -FilePath ${powershellQuote(process.execPath)} -ArgumentList @(${powershellQuote(script)},'serve') -WorkingDirectory ${powershellQuote(tmpdir())} -WindowStyle Hidden`;
    spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 15_000,
    });
    return;
  }
  const child = spawn(process.execPath, [script, "serve"], { cwd: tmpdir(), stdio: "ignore", detached: true });
  child.unref();
}

let unavailable: string | null = null;

/**
 * The running broker, started when none answers. Returns null (and says why, once) when the broker
 * is off or cannot be had; callers then launch their own server as before.
 */
export async function ensureBroker(options: { log?: (line: string) => void; waitMs?: number } = {}): Promise<BrokerStatus | null> {
  if (!brokerEnabled()) return null;
  if (unavailable !== null) return null;
  const log = options.log ?? ((line: string) => console.error(line));
  let status = await brokerStatusOrNull();
  if (status !== null && status.protocol !== BROKER_PROTOCOL) {
    const busy = status.leases > 0;
    if (busy) {
      unavailable = `broker on :${brokerPort()} speaks protocol ${status.protocol}, this checkout ${BROKER_PROTOCOL}, and it is busy`;
      log(`broker: ${unavailable} — launching directly`);
      return null;
    }
    await stopBroker();
    status = null;
  }
  if (status !== null) return status;
  launchBroker(join(import.meta.dir, "devBroker.ts"));
  const deadline = Date.now() + (options.waitMs ?? 20_000);
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    status = await brokerStatusOrNull(1_000);
    if (status !== null) return status;
  }
  unavailable = `broker did not answer on :${brokerPort()} within ${Math.round((options.waitMs ?? 20_000) / 1000)}s (log: ${join(tmpdir(), "jgengine-broker.log")})`;
  log(`broker: ${unavailable} — launching directly`);
  return null;
}

/**
 * What a running server froze at boot: the commit and the game list (Vite computes
 * `@games/<id>` aliases once). A change restarts an unleased server.
 */
export function treeFingerprint(root: string, gameDir: string | null): string {
  const parts = [headRevision(root) ?? "no-head"];
  try {
    parts.push(readdirSync(join(root, "games")).sort().join(","));
  } catch {
    parts.push("no-games");
  }
  if (gameDir !== null) parts.push(gameDir);
  return parts.join("|");
}

const leases = new Set<string>();
let exitHookArmed = false;

function rememberLease(leaseId: string): void {
  leases.add(leaseId);
  if (exitHookArmed) return;
  exitHookArmed = true;
  // The broker frees a dead pid's leases on its next sweep; this only makes a clean exit instant.
  process.once("beforeExit", () => void releaseAll());
}

export async function releaseLease(leaseId: string): Promise<void> {
  leases.delete(leaseId);
  await localPostJson(`${brokerBase()}/v1/release`, { leaseId }, 3_000).catch(() => null);
}

export async function releaseAll(): Promise<void> {
  await Promise.all([...leases].map((leaseId) => releaseLease(leaseId)));
}

function label(cwd: string): string {
  const script = process.argv[1]?.replace(/^.*[\\/]/, "") ?? "bun";
  return `${script} in ${cwd}`;
}

export interface BrokerServer {
  port: number;
  base: string;
  reused: boolean;
}

/**
 * This checkout's dev server (website or runner), reused or started by the broker. Null when the
 * broker is unavailable. Throws when the broker answered but the server failed to start.
 */
export async function brokerServer(
  cwd: string,
  kind: ServerKind,
  preferredPort?: number,
  log: (line: string) => void = (line) => console.error(line),
): Promise<BrokerServer | null> {
  if ((await ensureBroker({ log })) === null) return null;
  const root = checkoutIdentity(cwd);
  const gameDir = servedGameDir();
  const response = await localPostJson<ServerGrant & { error?: string }>(
    `${brokerBase()}/v1/server`,
    {
      root,
      gameDir,
      kind,
      fingerprint: treeFingerprint(root, gameDir),
      clientPid: process.pid,
      label: label(cwd),
      ...(preferredPort === undefined ? {} : { preferredPort }),
    },
    200_000,
  );
  if (response.status !== 200) throw new Error(`broker: ${response.body.error ?? `server request answered ${response.status}`}`);
  const grant = response.body;
  rememberLease(grant.leaseId);
  log(`broker: ${grant.reused ? "reused" : "started"} ${kind} ${grant.base} for ${root}${gameDir === null ? "" : ` (game dir ${gameDir})`}`);
  if (grant.stale !== undefined) log(`broker: ${grant.stale}`);
  return { port: grant.port, base: grant.base, reused: grant.reused };
}

/** The shared browser's debug port, or null when the broker is unavailable. */
export async function brokerChrome(cwd: string, log: (line: string) => void = (line) => console.error(line)): Promise<{ chromePort: number; started: boolean } | null> {
  if ((await ensureBroker({ log })) === null) return null;
  const response = await localPostJson<{ leaseId: string; chromePort: number; started: boolean; error?: string }>(
    `${brokerBase()}/v1/chrome`,
    { clientPid: process.pid, label: label(cwd) },
    90_000,
  );
  if (response.status !== 200) throw new Error(`broker: ${response.body.error ?? `browser request answered ${response.status}`}`);
  rememberLease(response.body.leaseId);
  return { chromePort: response.body.chromePort, started: response.body.started };
}

/**
 * Default wait for a turn in the shared browser: 5 minutes, `JG_CAPTURE_WAIT_MINUTES` overrides. It
 * stays under `bun run shoot`'s 420 s guard, so a long queue fails naming the holder, not as a kill.
 */
export function captureWaitMs(env: NodeJS.ProcessEnv = process.env): number {
  const minutes = Number(env["JG_CAPTURE_WAIT_MINUTES"]);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 5) * 60_000;
}

/**
 * Wait for this run's turn in the shared browser. Resolves with a release function; the turn also
 * ends when this process exits. Throws, naming the holder, when the wait runs out.
 */
export async function brokerCaptureTurn(
  cwd = process.cwd(),
  options: { waitMs?: number; log?: (line: string) => void } = {},
): Promise<{ release(): Promise<void>; waitedMs: number; chromePort: number }> {
  const log = options.log ?? ((line: string) => console.error(line));
  const waitMs = options.waitMs ?? captureWaitMs();
  const response = await localPostJson<CaptureGrant & { error?: string }>(
    `${brokerBase()}/v1/capture`,
    { clientPid: process.pid, label: label(cwd), waitMs },
    waitMs + 10_000,
  );
  if (response.status !== 200) throw new Error(`capture turn: ${response.body.error ?? `answered ${response.status}`}`);
  const grant = response.body;
  rememberLease(grant.leaseId);
  if (grant.waitedMs >= 1_000) log(`broker: waited ${(grant.waitedMs / 1000).toFixed(1)}s for the shared browser`);
  return { release: () => releaseLease(grant.leaseId), waitedMs: grant.waitedMs, chromePort: grant.chromePort };
}
