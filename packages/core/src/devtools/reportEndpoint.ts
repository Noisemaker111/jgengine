import type { PerfReport } from "./report";

/**
 * The dev-only route a running game pushes its in-page report to, and that
 * `bun run debug <game>` reads back. One process: the page gathers, the dev server
 * holds the newest record per game, the CLI fetches it. Nothing here ships in a
 * production build — the Vite plugin mounts it under `apply: "serve"`.
 */
export const REPORT_ENDPOINT_PATH = "/__jgengine/report";

/** Body the page POSTs: the game it measured and the record itself. */
export interface ReportPushBody {
  gameId: string;
  report: PerfReport;
}

/** Body sent when there is nothing to return yet. */
export interface ReportRouteError {
  error: string;
}
