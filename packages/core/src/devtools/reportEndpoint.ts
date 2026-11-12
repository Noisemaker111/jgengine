import type { PerfReport } from "./report";

/**
 * The dev-only route a running game pushes its in-page report to, and that
 * `bun run perf live <game>` reads back. One process: the page gathers, the dev server
 * holds the newest record per game, the CLI fetches it. Nothing here ships in a
 * production build — the Vite plugin mounts it under `apply: "serve"`.
 */
export const REPORT_ENDPOINT_PATH = "/__jgengine/report";

/**
 * Cookie the dev servers set on the pages they serve, so a page asks for the report route only
 * where it exists. A shipped game (jgengine.com's /play runner, a desktop build) never has it and
 * makes no request, where a probe answered 404 and every load logged a console error.
 */
export const DEV_REPORT_COOKIE = "jg_report_route";

/** Whether `cookie` (a `document.cookie` string) carries {@link DEV_REPORT_COOKIE}. */
export function servedByDevServer(cookie: string): boolean {
  return cookie.split(";").some((part) => part.trim() === `${DEV_REPORT_COOKIE}=1`);
}

/** Body the page POSTs: the game it measured and the record itself. */
export interface ReportPushBody {
  gameId: string;
  report: PerfReport;
}

/** Body sent when there is nothing to return yet. */
export interface ReportRouteError {
  error: string;
}
