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
 *
 * The per-game loop ({@link runAudit}) is shared with `perf post-audit`, which audits the post chain
 * the same way.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const USAGE = `usage: bun run perf shadow-audit [--games a,b] [--seconds n] [--path walk|still] [--renderer webgl|webgpu]

  Plays each game (${GATE_SIZE.width}x${GATE_SIZE.height}, high tier, automatic quality off) with the shadow cache's audit on:
  every shadow map the cache serves from its static layer is compared, depth bit for depth bit, with a
  full redraw of the same pass, except while 16 comparisons still wait on their readback (counted as
  skipped). Prints the passes per game and fails on any differing texel.

  --games    comma-separated game ids (default: every game the frame gate measures)
  --seconds  measured window per game (default 8)
  --path     walk (default) or still
  --renderer the backend that draws: webgl (default) or webgpu`;

export interface AuditArgs {
  games: string[];
  seconds: number;
  path: PerfPath;
  renderer: RendererBackend;
}

export function parseAuditArgs(argv: readonly string[]): AuditArgs | "help" {
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

/** One game's audit: the probe system's counters and what the comparison found. */
export interface AuditRow {
  game: string;
  counters: Record<string, number> | null;
  error: string | null;
}

/** Why a measured page cannot stand for the asked audit, or null when it can: a page another backend drew audits that backend. */
export function auditPageProblem(asked: RendererBackend, drawing: string | undefined): string | null {
  return drawing !== undefined && drawing !== asked ? `asked for ${asked} but ${drawing} drew the page` : null;
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

/**
 * What one audit verb plays each game with and reads back: the page flag that turns the audit on, the
 * probe system whose counters carry its findings, and how a row of them is judged and shown.
 */
export interface AuditKind {
  /** The verb, for progress lines and the records folder: `perf <name>`. */
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

async function auditGame(kind: AuditKind, game: string, args: AuditArgs, started: Awaited<ReturnType<typeof ensureDevServer>>[]): Promise<AuditRow> {
  // The lock first: the server check and Chrome launch sit inside it, so a server obtained before a
  // long wait cannot be gone after it. Texels are the product here, not frame times, so the browser
  // keeps the inherited below-normal priority (scripts/perf.ts).
  const releaseLock = await acquirePerfLock(`perf ${kind.name} ${game}`);
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
        params: [[kind.param, "1"]],
        size: GATE_SIZE,
      });
      counters = measured.record.systems[kind.system]?.counters ?? null;
      drawing = measured.record.backend?.drawing;
      // The whole record beside the table, so a surprising row (every pass full, say) can be read back.
      const records = join(repoRoot, ".scratch", `perf-${kind.name}`);
      mkdirSync(records, { recursive: true });
      writeFileSync(join(records, `${game}-${args.renderer}.json`), `${JSON.stringify(measured.record, null, 2)}\n`);
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      await session.close();
    }
  }).finally(releaseLock);
  // The session logs a failed run and hands back its exit code instead of throwing.
  if (exit !== 0) throw failure instanceof Error ? failure : new Error(`the browser session exited ${exit}`);
  return { game, counters, error: counters === null ? kind.missing : auditPageProblem(args.renderer, drawing) };
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
        row = await auditGame(kind, game, parsed, started);
      } catch (first) {
        // A run that could not measure (a refused navigation, a load that timed out) says nothing about
        // what is audited; it is measured once more and named, and a second failure stays in the table.
        console.error(`perf ${kind.name}: ${game} could not be measured (${first instanceof Error ? first.message : String(first)}); measuring it again`);
        try {
          row = await auditGame(kind, game, parsed, started);
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
  if (rows.some((row) => row.error !== null || !kind.passing.has(kind.verdict(row)))) process.exitCode = 1;
}

if (import.meta.main) await runAudit(SHADOW_AUDIT, process.argv.slice(2), USAGE);
