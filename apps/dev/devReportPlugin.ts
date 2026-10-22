import type { IncomingMessage, ServerResponse } from "node:http";

import {
  REPORT_ENDPOINT_PATH,
  type ReportPushBody,
  type ReportRouteError,
} from "../../packages/core/src/devtools/reportEndpoint";
import type { PerfReport, ReportLogLine } from "../../packages/core/src/devtools/report";

/** One report as the dev server holds it: which game, the record, and when it arrived. */
export interface StoredReport {
  gameId: string;
  at: number;
  report: PerfReport;
}

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_WAIT_MS = 5_000;
const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
/** How many warning/error lines the route keeps per game across pushes. */
const KEPT_SEVERE = 12;
/** A kept line older than this stops being carried forward. */
const SEVERE_MAX_AGE_MS = 5 * 60_000;

export interface ReportStore {
  put(gameId: string, report: PerfReport, at?: number): StoredReport;
  get(gameId: string): StoredReport | null;
  /** Resolve with the next report for `gameId`, or the current one after `timeoutMs`. */
  next(gameId: string, timeoutMs: number): Promise<StoredReport | null>;
  games(): readonly string[];
}

/**
 * Merge the previous warnings/errors into a fresh push. A page that crashes or
 * reloads starts an empty log ring, so without this the line explaining the crash
 * would be overwritten about a second later by a clean report.
 */
export function mergeSevere(
  previous: readonly ReportLogLine[],
  incoming: readonly ReportLogLine[],
  now: number,
  kept = KEPT_SEVERE,
): ReportLogLine[] {
  const merged = new Map<string, ReportLogLine>();
  for (const line of [...previous, ...incoming]) {
    if (now - line.at > SEVERE_MAX_AGE_MS) continue;
    // Same level, system and text is the same line: every push would otherwise re-add it.
    merged.set(`${line.level}|${line.system}|${line.message}`, line);
  }
  return [...merged.values()].sort((a, b) => a.at - b.at).slice(-kept);
}

/**
 * Newest report per game. The page pushes about once a second, so a read is
 * normally immediate; `next` only waits when a caller arrives before the first push.
 */
export function createReportStore(now: () => number = Date.now): ReportStore {
  const byGame = new Map<string, StoredReport>();
  const waiters = new Set<() => void>();

  const notify = (): void => {
    for (const waiter of [...waiters]) waiter();
  };

  return {
    put(gameId, report, at = now()) {
      const previous = byGame.get(gameId);
      const kept = previous === undefined ? [] : previous.report.logs?.severe ?? [];
      const severe = mergeSevere(kept, report.logs?.severe ?? [], at);
      const stored: StoredReport = {
        gameId,
        at,
        report: severe.length === 0 || report.logs === null
          ? report
          : { ...report, logs: { ...report.logs, severe } },
      };
      byGame.set(gameId, stored);
      notify();
      return stored;
    },
    get: (gameId) => byGame.get(gameId) ?? null,
    next(gameId, timeoutMs) {
      const current = byGame.get(gameId);
      if (current !== undefined || timeoutMs <= 0) return Promise.resolve(current ?? null);
      return new Promise((resolve) => {
        const done = (): void => {
          clearTimeout(timer);
          waiters.delete(check);
          resolve(byGame.get(gameId) ?? null);
        };
        const check = (): void => {
          if (byGame.get(gameId) !== undefined) done();
        };
        const timer = setTimeout(done, Math.min(timeoutMs, MAX_WAIT_MS));
        waiters.add(check);
      });
    },
    games: () => [...byGame.keys()],
  };
}

/** Validate and store one pushed report; returns the HTTP status and body to send. */
export function handleReportPush(store: ReportStore, body: string): { status: number; body: object } {
  let parsed: ReportPushBody;
  try {
    parsed = JSON.parse(body) as ReportPushBody;
  } catch (error) {
    return { status: 400, body: { error: `report body is not JSON (${(error as Error).message})` } };
  }
  if (typeof parsed?.gameId !== "string" || !GAME_ID_PATTERN.test(parsed.gameId)) {
    return { status: 400, body: { error: "report needs a gameId like \"harbor-heat\"" } };
  }
  const report = parsed.report;
  if (report === null || typeof report !== "object" || typeof report.game !== "string" || report.frame === undefined) {
    return { status: 400, body: { error: "report body needs the perf record (game, frame, render, gl)" } };
  }
  const stored = store.put(parsed.gameId, report);
  return { status: 200, body: { ok: true, at: stored.at } };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("report body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: object): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

/**
 * Dev-only Vite middleware: the page pushes its in-page report here and
 * `bun run debug <game>` reads it back as the same JSON `bun run perf` prints.
 */
export function devReportPlugin(options: { store?: ReportStore } = {}): {
  name: string;
  apply: "serve";
  configureServer(server: {
    middlewares: {
      use(
        route: string,
        handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void,
      ): void;
    };
  }): void;
} {
  const store = options.store ?? createReportStore();
  return {
    name: "jgengine-dev-report",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(REPORT_ENDPOINT_PATH, (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (req.method === "POST") {
          void readBody(req)
            .then((body) => {
              const result = handleReportPush(store, body);
              send(res, result.status, result.body);
            })
            .catch((error: unknown) => {
              send(res, 400, { error: error instanceof Error ? error.message : String(error) } satisfies ReportRouteError);
            });
          return;
        }
        if (req.method !== "GET") {
          next();
          return;
        }
        const gameId = url.searchParams.get("game") ?? "";
        if (!GAME_ID_PATTERN.test(gameId)) {
          send(res, 400, { error: "report needs ?game=<game-id>" } satisfies ReportRouteError);
          return;
        }
        const waitMs = Number(url.searchParams.get("wait") ?? 0);
        void store.next(gameId, Number.isFinite(waitMs) ? Math.max(0, waitMs) : 0).then((stored) => {
          if (stored === null) {
            send(res, 404, {
              error: `no report for "${gameId}" yet — open it in the browser and play for a second`,
            } satisfies ReportRouteError);
            return;
          }
          send(res, 200, stored.report);
        });
      });
    },
  };
}
