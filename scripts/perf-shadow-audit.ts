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

export interface AuditArgs {
  games: string[];
  seconds: number;
  path: PerfPath;
}

export function parseAuditArgs(argv: readonly string[]): AuditArgs | "help" {
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

/** One game's audit: the audited system's counters and what the comparison found. */
export interface AuditRow {
  game: string;
  counters: Record<string, number> | null;
  error: string | null;
}

/** A row's verdict: a game with no compared map proved nothing, so it fails like a mismatch does. */
export function auditVerdict(row: AuditRow): "identical" | "identical (every pass full)" | "differs" | "comparison failed" | "nothing compared" | "not measured" {
  if (row.counters === null) return "not measured";
  const count = (name: string) => row.counters?.[name] ?? 0;
  if (count("auditMismatchedMaps") > 0) return "differs";
  if (count("auditFailed") > 0) return "comparison failed";
  if (count("auditMaps") > 0) return "identical";
  // A game whose camera never stops (a racer) moves every cascade every frame: each pass is three's
  // own full draw, so there is no cached map to compare and nothing that could differ.
  const cached = count("rebuild") + count("reuse") + count("hold");
  return cached === 0 && count("full") > 0 ? "identical (every pass full)" : "nothing compared";
}

const PASSING_VERDICTS: ReadonlySet<string> = new Set(["identical", "identical (every pass full)"]);

export function renderShadowAudit(rows: readonly AuditRow[]): string {
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

/**
 * What one audit verb plays each game with and reads back: the page flag that turns the audit on, the
 * probe system whose counters carry its findings, and how a row of them is judged and shown.
 */
export interface AuditKind {
  /** The verb, for progress lines: `perf <name>`. */
  name: string;
  param: string;
  system: string;
  /** The row's error when the page registered no such system. */
  missing: string;
  verdict(row: AuditRow): string;
  passing: ReadonlySet<string>;
  render(rows: readonly AuditRow[]): string;
}

const SHADOW_AUDIT: AuditKind = {
  name: "shadow-audit",
  param: "shadowAudit",
  system: "render/shadow-cache",
  missing: "no shadow cache on the page",
  verdict: auditVerdict,
  passing: PASSING_VERDICTS,
  render: renderShadowAudit,
};

async function auditGame(kind: AuditKind, game: string, index: number, args: AuditArgs, started: Awaited<ReturnType<typeof ensureDevServer>>[]): Promise<AuditRow> {
  // Checked before every game, so a dev server that died under the last one is started again.
  const server = await ensureDevServer(repoRoot);
  if (server.pid !== undefined) started.push(server);
  let counters: Record<string, number> | null = null;
  let failure: unknown = null;
  // A loaded PC took over 340 s just to open a game's page (2026-11-08), so the session gets the
  // budget `shoot` gives a capture; an audit is a proof, not a timing, so a slow load costs nothing.
  const exit = await withBrowserSession({ keep: false, debugPort: debugPortFor(index), timeoutMs: 600_000, hardDeadlineMs: 900_000 }, async ({ debugPort }) => {
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
        params: [[kind.param, "1"]],
        size: GATE_SIZE,
      });
      counters = measured.record.systems[kind.system]?.counters ?? null;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      await session.close();
    }
  });
  // The session logs a failed run and hands back its exit code instead of throwing.
  if (exit !== 0) throw failure instanceof Error ? failure : new Error(`the browser session exited ${exit}`);
  return { game, counters, error: counters === null ? kind.missing : null };
}

/** Play each game the arguments name with `kind`'s audit on, print the table and fail on any row that does not pass. */
export async function runAudit(kind: AuditKind, argv: readonly string[], usage: string): Promise<void> {
  const parsed = parseAuditArgs(argv);
  if (parsed === "help") {
    console.log(usage);
    return;
  }
  const rows: AuditRow[] = [];
  const started: Awaited<ReturnType<typeof ensureDevServer>>[] = [];
  try {
    for (const [index, game] of parsed.games.entries()) {
      console.error(`perf ${kind.name}: ${game} (${index + 1}/${parsed.games.length})`);
      let row: AuditRow;
      try {
        row = await auditGame(kind, game, index, parsed, started);
      } catch (first) {
        // A run that could not measure (a refused navigation, a load that timed out) says nothing about
        // what is audited; it is measured once more and named, and a second failure stays in the table.
        console.error(`perf ${kind.name}: ${game} could not be measured (${first instanceof Error ? first.message : String(first)}); measuring it again`);
        try {
          row = await auditGame(kind, game, index, parsed, started);
        } catch (error) {
          row = { game, counters: null, error: error instanceof Error ? error.message : String(error) };
        }
      }
      rows.push(row);
      // Each row as it lands, so a run cut short still shows the games it finished.
      console.error(kind.render([row]).split("\n")[1]);
    }
  } finally {
    for (const server of started) {
      killProcessTree(server.child ?? null);
      killPid(server.pid, true);
    }
  }
  console.log(kind.render(rows));
  if (rows.some((row) => !kind.passing.has(kind.verdict(row)))) process.exitCode = 1;
}

if (import.meta.main) await runAudit(SHADOW_AUDIT, process.argv.slice(2), USAGE);
