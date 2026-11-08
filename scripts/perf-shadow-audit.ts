import { fileURLToPath } from "node:url";

import { ensureDevServer, killPid, killProcessTree, openPageSession, withBrowserSession } from "./browser-lib";
import { FRAME_GAMES } from "./ci-scope";
import { debugPortFor, GATE_SIZE } from "./perf-gate";
import type { PerfPath } from "./perf-breakdown";
import { measureGame, parseSettingSpec } from "./perf-play";

/**
 * Proves the shadow cache draws the same shadow maps as three's uncached pass.
 *
 *   bun run perf shadow-audit [--games a,b] [--seconds n] [--path walk|still]
 *
 * Each game is played at the frame gate's conditions with `?shadowAudit=1`: after every pass the
 * cache serves from its static layer, the page draws the same map the uncached way into a spare
 * target and counts texels whose depth bits differ. Any differing texel fails the run.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const USAGE = `usage: bun run perf shadow-audit [--games a,b] [--seconds n] [--path walk|still]

  Plays each game (${GATE_SIZE.width}x${GATE_SIZE.height}, high tier, automatic quality off) with the shadow cache's audit on:
  every shadow map the cache serves from its static layer is compared, depth bit for depth bit, with a
  full redraw of the same pass. Prints the passes per game and fails on any differing texel.

  --games    comma-separated game ids (default: every game the frame gate measures)
  --seconds  measured window per game (default 8)
  --path     walk (default) or still`;

export interface ShadowAuditArgs {
  games: string[];
  seconds: number;
  path: PerfPath;
}

export function parseShadowAuditArgs(argv: readonly string[]): ShadowAuditArgs | "help" {
  let games: string[] | undefined;
  let seconds = 8;
  let path: PerfPath = "walk";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--help" || arg === "-h") return "help";
    const value = argv[index + 1];
    if (arg === "--games" || arg === "--seconds" || arg === "--path") {
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      index += 1;
      if (arg === "--games") games = value.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
      else if (arg === "--path") {
        if (value !== "walk" && value !== "still") throw new Error(`--path must be walk or still (got ${value})`);
        path = value;
      } else {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--seconds must be a positive number (got ${value})`);
        seconds = parsed;
      }
      continue;
    }
    throw new Error(`unknown argument ${arg}`);
  }
  if (games !== undefined && games.length === 0) throw new Error("--games needs at least one game id");
  return { games: games ?? [...FRAME_GAMES], seconds, path };
}

/** One game's audit: the cache's pass counts and what the comparison found. */
export interface ShadowAuditRow {
  game: string;
  counters: Record<string, number> | null;
  error: string | null;
}

/** A row's verdict: a game with no compared map proved nothing, so it fails like a mismatch does. */
export function auditVerdict(row: ShadowAuditRow): "identical" | "differs" | "comparison failed" | "nothing compared" | "not measured" {
  if (row.counters === null) return "not measured";
  if ((row.counters["auditMismatchedMaps"] ?? 0) > 0) return "differs";
  if ((row.counters["auditFailed"] ?? 0) > 0) return "comparison failed";
  if ((row.counters["auditMaps"] ?? 0) === 0) return "nothing compared";
  return "identical";
}

export function renderShadowAudit(rows: readonly ShadowAuditRow[]): string {
  const head = ["game", "casters", "static", "full", "rebuild", "reuse", "hold", "maps compared", "maps differing", "texels differing", "failed", "verdict"];
  const body = rows.map((row) => {
    const c = row.counters ?? {};
    const cell = (name: string) => (row.counters === null ? "-" : String(c[name] ?? 0));
    return [row.game, cell("casters"), cell("static"), cell("full"), cell("rebuild"), cell("reuse"), cell("hold"), cell("auditMaps"), cell("auditMismatchedMaps"), cell("auditMismatchedTexels"), cell("auditFailed"), row.error ?? auditVerdict(row)];
  });
  const widths = head.map((cell, column) => Math.max(cell.length, ...body.map((line) => (line[column] ?? "").length)));
  const line = (cells: readonly string[]) => cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ").trimEnd();
  return [line(head), ...body.map(line)].join("\n");
}

async function auditGame(game: string, index: number, args: ShadowAuditArgs, started: Awaited<ReturnType<typeof ensureDevServer>>[]): Promise<ShadowAuditRow> {
  // Checked before every game, so a dev server that died under the last one is started again.
  const server = await ensureDevServer(repoRoot);
  if (server.pid !== undefined) started.push(server);
  let counters: Record<string, number> | null = null;
  let failure: unknown = null;
  const exit = await withBrowserSession({ keep: false, debugPort: debugPortFor(index), timeoutMs: 240_000, hardDeadlineMs: 360_000 }, async ({ debugPort }) => {
    const session = await openPageSession(debugPort);
    try {
      const measured = await measureGame({
        session,
        base: server.base,
        game,
        quality: "high",
        seconds: args.seconds,
        profile: false,
        path: args.path,
        settings: [parseSettingSpec("graphics.auto=false")],
        params: [["shadowAudit", "1"]],
        size: GATE_SIZE,
      });
      counters = measured.record.systems["render/shadow-cache"]?.counters ?? null;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      await session.close();
    }
  });
  // The session logs a failed run and hands back its exit code instead of throwing.
  if (exit !== 0) throw failure instanceof Error ? failure : new Error(`the browser session exited ${exit}`);
  return { game, counters, error: counters === null ? "no shadow cache on the page" : null };
}

async function main(): Promise<void> {
  const parsed = parseShadowAuditArgs(process.argv.slice(2));
  if (parsed === "help") {
    console.log(USAGE);
    return;
  }
  const rows: ShadowAuditRow[] = [];
  const started: Awaited<ReturnType<typeof ensureDevServer>>[] = [];
  try {
    for (const [index, game] of parsed.games.entries()) {
      console.error(`perf shadow-audit: ${game} (${index + 1}/${parsed.games.length})`);
      let row: ShadowAuditRow;
      try {
        row = await auditGame(game, index, parsed, started);
      } catch (first) {
        // A run that could not measure (a refused navigation, a load that timed out) says nothing about
        // the cache; it is measured once more and named, and a second failure stays in the table.
        console.error(`perf shadow-audit: ${game} could not be measured (${first instanceof Error ? first.message : String(first)}); measuring it again`);
        try {
          row = await auditGame(game, index, parsed, started);
        } catch (error) {
          row = { game, counters: null, error: error instanceof Error ? error.message : String(error) };
        }
      }
      rows.push(row);
      // Each row as it lands, so a run cut short still shows the games it finished.
      console.error(renderShadowAudit([row]).split("\n")[1]);
    }
  } finally {
    for (const server of started) {
      killProcessTree(server.child ?? null);
      killPid(server.pid, true);
    }
  }
  console.log(renderShadowAudit(rows));
  if (rows.some((row) => auditVerdict(row) !== "identical")) process.exitCode = 1;
}

if (import.meta.main) await main();
