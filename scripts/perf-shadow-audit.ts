import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureDevServer, killPid, killProcessTree, openPageSession, withBrowserSession } from "./browser-lib";
import { FRAME_GAMES } from "./ci-scope";
import { GATE_SIZE } from "./perf-gate";
import type { PerfPath } from "./perf-breakdown";
import { acquirePerfLock } from "./perf-lock";
import { measureGame, parseSettingSpec } from "./perf-play";
import { parseRendererBackend, type RendererBackend } from "../packages/core/src/settings/rendererBackend";

/**
 * Proves the shadow cache draws the same shadow maps as three's uncached pass.
 *
 *   bun run perf shadow-audit [--games a,b] [--seconds n] [--path walk|still] [--renderer webgl|webgpu]
 *
 * Each game is played at the frame gate's conditions (uncapped clock) with `?shadowAudit=1`: after
 * every pass the cache serves from its static layer, the page draws the same map the uncached way
 * into a spare target and counts texels whose depth bits differ. Any differing texel fails the run.
 * Readbacks land frames late (on WebGPU most of all), so while 16 are in flight a served pass goes
 * uncompared and is counted as skipped; the table prints how many.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const RECORDS = join(repoRoot, ".scratch", "perf-shadow-audit");

const USAGE = `usage: bun run perf shadow-audit [--games a,b] [--seconds n] [--path walk|still] [--renderer webgl|webgpu]

  Plays each game (${GATE_SIZE.width}x${GATE_SIZE.height}, high tier, automatic quality off) with the shadow cache's audit on:
  every shadow map the cache serves from its static layer is compared, depth bit for depth bit, with a
  full redraw of the same pass, except while 16 comparisons still wait on their readback (counted as
  skipped). Prints the passes per game and fails on any differing texel.

  --games    comma-separated game ids (default: every game the frame gate measures)
  --seconds  measured window per game (default 8)
  --path     walk (default) or still
  --renderer the backend that draws: webgl (default) or webgpu`;

export interface ShadowAuditArgs {
  games: string[];
  seconds: number;
  path: PerfPath;
  renderer: RendererBackend;
}

export function parseShadowAuditArgs(argv: readonly string[]): ShadowAuditArgs | "help" {
  let games: string[] | undefined;
  let seconds = 8;
  let path: PerfPath = "walk";
  let renderer: RendererBackend = "webgl";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--help" || arg === "-h") return "help";
    const value = argv[index + 1];
    if (arg === "--games" || arg === "--seconds" || arg === "--path" || arg === "--renderer") {
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      index += 1;
      if (arg === "--renderer") {
        const backend = parseRendererBackend(value);
        if (backend === null) throw new Error(`--renderer must be webgl or webgpu (got ${value})`);
        renderer = backend;
      } else if (arg === "--games") games = value.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
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
  return { games: games ?? [...FRAME_GAMES], seconds, path, renderer };
}

/** One game's audit: the cache's pass counts and what the comparison found. */
export interface ShadowAuditRow {
  game: string;
  counters: Record<string, number> | null;
  error: string | null;
}

/** Why a measured page cannot stand for the asked audit, or null when it can: a page another backend drew audits that backend. */
export function auditPageProblem(asked: RendererBackend, drawing: string | undefined): string | null {
  return drawing !== undefined && drawing !== asked ? `asked for ${asked} but ${drawing} drew the page` : null;
}

/** A row's verdict: a game with no compared map proved nothing, so it fails like a mismatch does. */
export function auditVerdict(row: ShadowAuditRow): "identical" | "identical (every pass full)" | "differs" | "comparison failed" | "nothing compared" | "not measured" {
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

export function renderShadowAudit(rows: readonly ShadowAuditRow[]): string {
  const head = ["game", "casters", "static", "full", "rebuild", "reuse", "hold", "maps compared", "maps differing", "texels differing", "failed", "skipped", "verdict"];
  const body = rows.map((row) => {
    // A row with an error says why instead of a verdict, and fails the run.
    const c = row.counters ?? {};
    const cell = (name: string) => (row.counters === null ? "-" : String(c[name] ?? 0));
    return [row.game, cell("casters"), cell("static"), cell("full"), cell("rebuild"), cell("reuse"), cell("hold"), cell("auditMaps"), cell("auditMismatchedMaps"), cell("auditMismatchedTexels"), cell("auditFailed"), cell("auditSkipped"), row.error ?? auditVerdict(row)];
  });
  const widths = head.map((cell, column) => Math.max(cell.length, ...body.map((line) => (line[column] ?? "").length)));
  const line = (cells: readonly string[]) => cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ").trimEnd();
  return [line(head), ...body.map(line)].join("\n");
}

async function auditGame(game: string, index: number, args: ShadowAuditArgs, started: Awaited<ReturnType<typeof ensureDevServer>>[]): Promise<ShadowAuditRow> {
  // The lock first: the server check and Chrome launch sit inside it, so a server obtained before a
  // long wait cannot be gone after it. Texels are the product here, not frame times, so the browser
  // keeps the inherited below-normal priority (scripts/perf.ts).
  const releaseLock = await acquirePerfLock(`perf shadow-audit ${game}`);
  // Checked before every game, so a dev server that died under the last one is started again.
  const server = await ensureDevServer(repoRoot);
  if (server.pid !== undefined) started.push(server);
  let counters: Record<string, number> | null = null;
  let drawing: string | undefined;
  let failure: unknown = null;
  const exit = await withBrowserSession({ keep: false, timeoutMs: 240_000, hardDeadlineMs: 360_000, frameClock: "uncapped" }, async ({ debugPort }) => {
    const session = await openPageSession(debugPort);
    try {
      const measured = await measureGame({
        session,
        base: server.base,
        game,
        quality: "high",
        seconds: args.seconds,
        profile: false,
        frameClock: "uncapped",
        path: args.path,
        // The backend as a setting, as fps-gap picks it, so measureGame reads back which one drew.
        settings: [parseSettingSpec("graphics.auto=false"), parseSettingSpec(`renderer=${args.renderer}`)],
        params: [["shadowAudit", "1"]],
        size: GATE_SIZE,
      });
      counters = measured.record.systems["render/shadow-cache"]?.counters ?? null;
      drawing = measured.record.backend?.drawing;
      // The whole record beside the table, so a surprising row (every pass full, say) can be read back.
      mkdirSync(RECORDS, { recursive: true });
      writeFileSync(join(RECORDS, `${game}-${args.renderer}.json`), `${JSON.stringify(measured.record, null, 2)}
`);
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      await session.close();
    }
  }).finally(releaseLock);
  // The session logs a failed run and hands back its exit code instead of throwing.
  if (exit !== 0) throw failure instanceof Error ? failure : new Error(`the browser session exited ${exit}`);
  return { game, counters, error: counters === null ? "no shadow cache on the page" : auditPageProblem(args.renderer, drawing) };
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
        row = await auditGame(game, parsed, started);
      } catch (first) {
        // A run that could not measure (a refused navigation, a load that timed out) says nothing about
        // the cache; it is measured once more and named, and a second failure stays in the table.
        console.error(`perf shadow-audit: ${game} could not be measured (${first instanceof Error ? first.message : String(first)}); measuring it again`);
        try {
          row = await auditGame(game, parsed, started);
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
  if (rows.some((row) => row.error !== null || !PASSING_VERDICTS.has(auditVerdict(row)))) process.exitCode = 1;
}

if (import.meta.main) await main();
