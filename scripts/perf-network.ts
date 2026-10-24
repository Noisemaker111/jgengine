import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { type CdpSession, ensureDevServer, openPageSession, withBrowserSession } from "./browser-lib";

/**
 * Per-game network audit, printed as one JSON line per game.
 *
 *   bun run perf:network <game...> [--seconds n] [--all] [--json out.jsonl]
 *
 * Each game is loaded in play mode, left running for `--seconds`, then reloaded
 * with the cache on. Bytes and requests come from CDP `Network` events, so a
 * cache hit shows up as a 304 or a `fromDiskCache` response rather than a guess.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export const ALL_GAMES = [
  "harbor-heat",
  "scrap-signal",
  "drift-foundry",
  "beacon-bastion",
  "brightway-park",
  "ember-command",
  "odd-orbit",
  "deepward",
] as const;

const USAGE = `usage: bun run perf:network <game...> [--seconds n] [--all] [--json path]

  <game...>       one or more game ids from Games/
  --all           every reference game (${ALL_GAMES.join(", ")})
  --seconds n     play window per game (default 120)
  --json path     also append the JSON lines to a file
  --url base      measure an absolute base instead of the local dev runner
                  (for example https://jgengine.com/play/)
  --dump path     write every request row for the last game to a JSON file
  --timeout n     seconds to wait for a game to reach its first ready frame (default 120)`;

type Phase = "load" | "play" | "reload";

interface Tally {
  bytes: number;
  requests: number;
  cacheHits: number;
  devOnly: number;
  devBytes: number;
  statuses: Record<string, number>;
  cacheControl: Record<string, number>;
  types: Record<string, number>;
}

interface Row {
  url: string;
  method: string;
  type: string;
  bytes: number;
  contentLength: number | null;
  status: number | null;
  cached: boolean;
  phase: Phase;
  cacheControl: string | null;
}

interface WsTally {
  connections: number;
  sent: number;
  received: number;
  bytes: number;
}

function emptyTally(): Tally {
  return { bytes: 0, requests: 0, cacheHits: 0, devOnly: 0, devBytes: 0, statuses: {}, cacheControl: {}, types: {} };
}

/** The dev runner's own telemetry round-trip; diagnostics, never game traffic. */
function isDevOnly(url: string): boolean {
  return url.includes("/__jgengine/");
}

function bump(record: Record<string, number>, key: string, by = 1): void {
  record[key] = (record[key] ?? 0) + by;
}

function headerValue(headers: Record<string, unknown> | undefined, name: string): string | null {
  if (headers === undefined) return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return typeof value === "string" ? value : null;
  }
  return null;
}

/** CDP `Network` counters split by phase, so a cold load, idle play and a reload stay separable. */
class NetworkRecorder {
  phase: Phase = "load";
  readonly totals: Record<Phase, Tally> = { load: emptyTally(), play: emptyTally(), reload: emptyTally() };
  readonly ws: WsTally = { connections: 0, sent: 0, received: 0, bytes: 0 };
  private readonly rows = new Map<string, Row>();
  private readonly countedCacheHit = new Set<string>();
  private readonly failuresByUrl = new Map<string, string>();
  private readonly gameRequests: Record<Phase, number> = { load: 0, play: 0, reload: 0 };
  private readonly unsubscribers: Array<() => void> = [];

  attach(session: CdpSession): void {
    this.unsubscribers.push(
      session.on("Network.requestWillBeSent", (params) => {
        const requestId = String(params.requestId ?? "");
        const request = params.request as { url?: string; method?: string } | undefined;
        const url = request?.url ?? "";
        if (url.startsWith("data:") || url.startsWith("blob:")) return;
        const type = String(params.type ?? "Other");
        this.rows.set(requestId, {
          url,
          method: request?.method ?? "GET",
          type,
          bytes: 0,
          contentLength: null,
          status: null,
          cached: false,
          phase: this.phase,
          cacheControl: null,
        });
        const tally = this.totals[this.phase];
        tally.requests += 1;
        if (isDevOnly(url)) tally.devOnly += 1;
        else this.gameRequests[this.phase] += 1;
        bump(tally.types, type);
      }),
      session.on("Network.responseReceived", (params) => {
        const requestId = String(params.requestId ?? "");
        const row = this.rows.get(requestId);
        const response = params.response as
          | { status?: number; headers?: Record<string, unknown>; fromDiskCache?: boolean; fromMemoryCache?: boolean }
          | undefined;
        if (row === undefined || response === undefined) return;
        row.status = typeof response.status === "number" ? response.status : null;
        row.cacheControl = headerValue(response.headers, "cache-control");
        const declared = Number(headerValue(response.headers, "content-length") ?? "");
        row.contentLength = Number.isFinite(declared) && declared > 0 ? declared : null;
        const cached = response.fromDiskCache === true || response.fromMemoryCache === true || response.status === 304;
        row.cached = cached;
        const tally = this.totals[row.phase];
        bump(tally.statuses, String(row.status ?? "failed"));
        bump(tally.cacheControl, row.cacheControl ?? "(none)");
        if (cached) this.markCacheHit(requestId, row.phase);
      }),
      session.on("Network.requestServedFromCache", (params) => {
        const requestId = String(params.requestId ?? "");
        const row = this.rows.get(requestId);
        if (row === undefined) return;
        row.cached = true;
        this.markCacheHit(requestId, row.phase);
      }),
      session.on("Network.loadingFinished", (params) => {
        const requestId = String(params.requestId ?? "");
        const row = this.rows.get(requestId);
        if (row === undefined) return;
        const encoded = typeof params.encodedDataLength === "number" ? params.encodedDataLength : 0;
        row.bytes = encoded;
        this.totals[row.phase].bytes += encoded;
        if (isDevOnly(row.url)) this.totals[row.phase].devBytes += encoded;
        if (row.contentLength !== null && row.contentLength > 1024 && encoded <= 1024) this.markCacheHit(requestId, row.phase);
      }),
      session.on("Network.loadingFailed", (params) => {
        const row = this.rows.get(String(params.requestId ?? ""));
        if (row === undefined) return;
        this.failuresByUrl.set(row.url, String(params.errorText ?? params.blockedReason ?? "failed"));
      }),
      session.on("Network.webSocketCreated", () => {
        this.ws.connections += 1;
      }),
      session.on("Network.webSocketFrameSent", (params) => {
        this.ws.sent += 1;
        this.ws.bytes += frameBytes(params);
      }),
      session.on("Network.webSocketFrameReceived", (params) => {
        this.ws.received += 1;
        this.ws.bytes += frameBytes(params);
      }),
    );
  }

  private markCacheHit(requestId: string, phase: Phase): void {
    if (this.countedCacheHit.has(requestId)) return;
    this.countedCacheHit.add(requestId);
    this.totals[phase].cacheHits += 1;
  }

  largest(count = 8): Array<{ url: string; bytes: number; type: string; cacheControl: string | null }> {
    return [...this.rows.values()]
      .filter((row) => row.bytes > 0)
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, count)
      .map((row) => ({
        url: row.url.replace(/^https?:\/\/[^/]+/, ""),
        bytes: row.bytes,
        type: row.type,
        cacheControl: row.cacheControl,
      }));
  }

  /** Every recorded request, for a one-off look at a suspicious URL. */
  dump(): Array<{ url: string; method: string; type: string; status: number | null; bytes: number; cached: boolean; phase: Phase; cacheControl: string | null }> {
    return [...this.rows.values()].map((row) => ({
      url: row.url.replace(/^https?:\/\/[^/]+/, ""),
      method: row.method,
      type: row.type,
      status: row.status,
      bytes: row.bytes,
      cached: row.cached,
      phase: row.phase,
      cacheControl: row.cacheControl,
    }));
  }

  /** URLs whose body was transferred more than once in one phase — paid for again. */
  duplicates(phase: Phase, count = 8): Array<{ url: string; requests: number; bytes: number }> {
    const byUrl = new Map<string, { requests: number; bytes: number }>();
    for (const row of this.rows.values()) {
      if (row.phase !== phase || row.bytes <= 1024) continue;
      const path = row.url.replace(/^https?:\/\/[^/]+/, "");
      const entry = byUrl.get(path) ?? { requests: 0, bytes: 0 };
      entry.requests += 1;
      entry.bytes += row.bytes;
      byUrl.set(path, entry);
    }
    return [...byUrl.entries()]
      .filter(([, entry]) => entry.requests > 1)
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .slice(0, count)
      .map(([url, entry]) => ({ url, requests: entry.requests, bytes: entry.bytes }));
  }

  /** Requests that never produced a body: 4xx/5xx statuses and failed loads. */
  failures(count = 8): Array<{ url: string; status: number | null; error: string | null }> {
    return [...this.rows.values()]
      .filter((row) => (row.status !== null && row.status >= 400) || this.failuresByUrl.has(row.url))
      .slice(0, count)
      .map((row) => ({
        url: row.url.replace(/^https?:\/\/[^/]+/, ""),
        status: row.status,
        error: this.failuresByUrl.get(row.url) ?? null,
      }));
  }

  /** Game request count in one phase (telemetry round-trips excluded), for quiet-window detection. */
  phaseRequests(phase: Phase): number {
    return this.gameRequests[phase];
  }

  detached(): void {    for (const off of this.unsubscribers) off();
    this.unsubscribers.length = 0;
  }
}

function frameBytes(params: Record<string, unknown>): number {
  const response = params.response as { payloadData?: string } | undefined;
  return response?.payloadData?.length ?? 0;
}

function round(n: number): number {
  return Math.round(n);
}

export function parseArgs(argv: readonly string[]): { games: string[]; seconds: number; json?: string; timeoutSeconds: number; dump?: string; url?: string } {
  const games: string[] = [];
  let seconds = 120;
  let json: string | undefined;
  let timeoutSeconds = 120;
  let dump: string | undefined;
  let url: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    if (arg === "--all") {
      games.push(...ALL_GAMES);
      continue;
    }
    if (arg === "--seconds" || arg === "--json" || arg === "--timeout" || arg === "--dump" || arg === "--url") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      index += 1;
      if (arg === "--seconds") seconds = Math.max(1, Math.floor(Number(value)));
      else if (arg === "--timeout") timeoutSeconds = Math.max(5, Math.floor(Number(value)));
      else if (arg === "--json") json = value;
      else if (arg === "--url") url = value;
      else dump = value;
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`unknown flag ${arg}`);
    games.push(arg);
  }
  if (games.length === 0) throw new Error(`a game id is required\n\n${USAGE}`);
  for (const game of games) {
    if (url !== undefined) break;
    if (!existsSync(join(repoRoot, "Games", game, "src", "index.tsx"))) {
      throw new Error(`no game "${game}" in Games/ — run \`bun run games:clone\` first, then retry`);
    }
  }
  return { games, seconds, json, timeoutSeconds, ...(dump === undefined ? {} : { dump }), ...(url === undefined ? {} : { url }) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for model/texture streaming to stop before the play window starts, so
 * cold-load bytes are not counted as play traffic. Gives up after `capMs`.
 */
async function waitForQuiet(recorder: NetworkRecorder, phase: Phase, quietMs = 2_500, capMs = 45_000): Promise<void> {
  const startedAt = Date.now();
  let seen = -1;
  let stableSince = Date.now();
  while (Date.now() - startedAt < capMs) {
    const now = recorder.phaseRequests(phase);
    if (now !== seen) {
      seen = now;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= quietMs) {
      return;
    }
    await sleep(250);
  }
}

/**
 * A game that reloads itself (save migration, error-boundary retry) detaches the
 * page's execution context, and CDP answers "Inspected target navigated or
 * closed" for a read in flight. That is a navigation, not a measurement failure:
 * the recorder keeps counting across it, so reads stay best-effort.
 */
async function tryEvaluate<T>(session: CdpSession, expression: string): Promise<T | undefined> {
  try {
    return await session.evaluate<T>(expression);
  } catch {
    return undefined;
  }
}

async function waitForReady(session: CdpSession, timeoutMs: number): Promise<"ready" | "error" | "timeout"> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await tryEvaluate<{ status: string | null; error: string | null }>(
      session,
      `({
        status: document.documentElement.dataset.jgCapture ?? null,
        error: document.documentElement.dataset.jgCaptureError ?? null
      })`,
    );
    if (state?.status === "ready") return "ready";
    if (state?.status === "error") return "error";
    await sleep(250);
  }
  return "timeout";
}

async function shellValue(session: CdpSession, expression: string): Promise<unknown> {
  return tryEvaluate<unknown>(session, expression);
}

/** Resource Timing totals for the current document — a cross-check on the CDP byte counters. */
async function resourceTiming(session: CdpSession): Promise<{ count: number; transferBytes: number; bodyBytes: number; fromCache: number } | null> {
  return (await tryEvaluate<{ count: number; transferBytes: number; bodyBytes: number; fromCache: number }>(
    session,
    `(() => {
      const entries = performance.getEntriesByType("resource");
      let transferBytes = 0;
      let bodyBytes = 0;
      let fromCache = 0;
      for (const entry of entries) {
        transferBytes += entry.transferSize ?? 0;
        bodyBytes += entry.encodedBodySize ?? 0;
        if ((entry.transferSize ?? 0) === 0) fromCache += 1;
      }
      return { count: entries.length, transferBytes, bodyBytes, fromCache };
    })()`,
  )) ?? null;
}

interface GameMeasurement {
  game: string;
  seconds: number;
  bytes: number;
  requests: number;
  wsFrames: number;
  cacheHits: number;
  /** Requests the dev server answered for its own modules: the number a production build removes. */
  devRequests: number;
  devBytes: number;
  perMinuteRequests: number;
  perMinuteBytes: number;
  largest: Array<{ url: string; bytes: number; type: string; cacheControl: string | null }>;
  duplicates: Array<{ url: string; requests: number; bytes: number }>;
  failures: Array<{ url: string; status: number | null; error: string | null }>;
  load: Stats;
  reload: Stats;
  ws: WsTally;
  ready: boolean;
  note?: string;
}

interface Stats {
  bytes: number;
  requests: number;
  cacheHits: number;
  devOnly: number;
  devBytes: number;
  statuses: Record<string, number>;
  cacheControl: Record<string, number>;
  types: Record<string, number>;
  resourceTiming?: { count: number; transferBytes: number; bodyBytes: number; fromCache: number } | null;
}

function stats(tally: Tally): Stats {
  return {
    bytes: round(tally.bytes),
    requests: tally.requests,
    cacheHits: tally.cacheHits,
    devOnly: tally.devOnly,
    devBytes: round(tally.devBytes),
    statuses: tally.statuses,
    cacheControl: tally.cacheControl,
    types: tally.types,
  };
}

async function measureGame(
  session: CdpSession,
  options: { base: string; game: string; seconds: number; timeoutMs: number; dump?: string },
): Promise<GameMeasurement> {
  const { base, game, seconds, timeoutMs, dump } = options;
  const recorder = new NetworkRecorder();
  await session.send("Network.enable", { maxTotalBufferSize: 64 * 1024 * 1024 });
  await session.send("Network.setCacheDisabled", { cacheDisabled: false });
  await session.send("Page.enable");
  recorder.attach(session);

  const url = new URL(base);
  url.searchParams.set("game", game);
  url.searchParams.set("mode", "play");
  url.searchParams.set("device", "desktop");
  url.searchParams.set("capture", "1");

  try {
    await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  } catch {
    /* older Chrome: focus emulation is a nicety, not a measurement requirement */
  }

  recorder.phase = "load";
  await session.send("Network.clearBrowserCache");
  await session.send("Page.navigate", { url: url.toString() });
  const loadState = await waitForReady(session, timeoutMs);
  await waitForQuiet(recorder, "load");
  const loadStats = { ...stats(recorder.totals.load), resourceTiming: await resourceTiming(session) };

  recorder.phase = "play";
  const startedAt = Date.now();
  await sleep(seconds * 1000);
  const playStats = stats(recorder.totals.play);
  const elapsed = (Date.now() - startedAt) / 1000;
  const telemetry = await shellValue(
    session,
    `(() => {
      const report = typeof window.__JG !== "undefined" && typeof window.__JG.report === "function"
        ? window.__JG.report()
        : null;
      return report === null ? null : {
        game: typeof report.game === "string" ? report.game : null,
        severe: Array.isArray(report.logs?.severe) ? report.logs.severe.length : null
      };
    })()`,
  ) as { game: string | null; severe: number | null } | null;

  recorder.phase = "reload";
  await session.send("Page.reload", {});
  const reloadState = await waitForReady(session, timeoutMs);
  await waitForQuiet(recorder, "reload");
  const reloadStats = { ...stats(recorder.totals.reload), resourceTiming: await resourceTiming(session) };

  const minutes = elapsed / 60;
  const playGameBytes = playStats.bytes - playStats.devBytes;
  const playGameRequests = playStats.requests - playStats.devOnly;
  if (dump !== undefined) writeFileSync(dump, `${JSON.stringify(recorder.dump())}\n`);
  return {
    game,
    seconds: Math.round(elapsed),
    bytes: playGameBytes,
    requests: playGameRequests,
    wsFrames: recorder.ws.sent + recorder.ws.received,
    cacheHits: reloadStats.cacheHits,
    devRequests: playStats.devOnly,
    devBytes: playStats.devBytes,
    perMinuteRequests: minutes > 0 ? Math.round((playGameRequests / minutes) * 10) / 10 : 0,
    perMinuteBytes: minutes > 0 ? Math.round(playGameBytes / minutes) : 0,
    largest: recorder.largest(),
    duplicates: recorder.duplicates("load"),
    failures: recorder.failures(),
    load: loadStats,
    reload: reloadStats,
    ws: { ...recorder.ws },
    ready: loadState === "ready" && reloadState === "ready",
    ...(telemetry !== null && telemetry.game !== null && telemetry.game !== game
      ? { note: `page reported game "${telemetry.game}", expected "${game}"` }
      : {}),
    ...(loadState === "ready" && reloadState === "ready" ? {} : { note: `load=${loadState} reload=${reloadState}` }),
  };
}

async function main(): Promise<void> {
  const { games, seconds, json, timeoutSeconds, dump, url } = parseArgs(process.argv.slice(2));
  const server = url === undefined ? await ensureDevServer(repoRoot) : null;
  const base = url ?? server!.base;
  const browserTimeoutMs = (seconds + timeoutSeconds * 2 + 120) * 1000 * games.length;
  const lines: string[] = [];

  const exitCode = await withBrowserSession(
    { keep: false, timeoutMs: browserTimeoutMs, server: server?.child ?? null, serverPid: server?.pid },
    async ({ debugPort }) => {
      const session = await openPageSession(debugPort);
      try {
        for (const game of games) {
          console.error(`perf:network ${game} — ${seconds}s play to measure…`);
          const measurement = await measureGame(session, {
            base,
            game,
            seconds,
            timeoutMs: timeoutSeconds * 1000,
            ...(dump === undefined ? {} : { dump }),
          });
          const line = JSON.stringify(measurement);
          lines.push(line);
          console.log(line);
          if (!measurement.ready) console.error(`perf:network ${game}: ${measurement.note ?? "not ready"}`);
        }
      } finally {
        await session.close();
      }
    },
  );

  if (json !== undefined && lines.length > 0) {
    writeFileSync(json, `${lines.join("\n")}\n`);
    console.error(`perf:network wrote ${lines.length} games to ${json}`);
  }
  if (exitCode !== 0) process.exit(exitCode);
}

if (import.meta.main) {
  await main();
}
