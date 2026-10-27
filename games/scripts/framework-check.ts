/**
 * Fails when a game directory grows an engine-shaped module.
 *
 * A game owns content and feel. Missions, economy, vehicles, loot, AI, damage and UI kits belong to
 * `Noisemaker111/jgengine` so one fix reaches every game; see "Framework-first development" in
 * AGENTS.md. A game's own progression - its level numbers, unlock order, tutorial beats and content
 * tables - is the game itself, at any length, so no seam here matches it.
 *
 * The verdict is about what a file contains, never what it is called. A basename or a folder name
 * is not evidence that a game wrote an engine: `to-cleared-mission.json` is a flow, not a mission
 * system, and a gate that pushed lanes to rename files around it would be worse than the false
 * positive it avoided. A non-code file can never be an engine module. A code file is engine-shaped
 * when it *defines* one of the systems below and is long enough to be a system rather than adoption
 * glue - importing and calling a shared system is the point, not an offence.
 *
 * Two seams are deliberately narrow, because a gate that reddens a game's own tuning teaches lanes
 * to rename:
 *
 *   - the damage seam is a model type, a model implementation or a table constant no shared model
 *     owns; an authored `DAMAGE_TABLE: DamageTableDef` handed to `createDamageRuntime`, and a
 *     `resolveDamage` / `applyDamage` wrapper over shared primitives, are both content and pass;
 *   - a module that runs `@jgengine/core/run/sessionLoop` composes the shared loop, so a local
 *     `RunPhase` there passes: it is adoption debt tracked by an issue, not a second engine.
 *
 * A file that truly cannot live upstream says so on its first line, `// framework-ok: <reason>`,
 * and passes; the marker is in the file, so the PR diff shows it and `land` lists it as a bend.
 *
 * Usage: bun run check games-framework [--base origin/beta]
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

export interface EngineSeam {
  /** What the game wrote that the engine should own. */
  name: string;
  /** Where it belongs in the engine, in the words of epic #2312. */
  owner: string;
  /** Shapes that only appear when a module *owns* the system, never when it adopts one. */
  defines: readonly RegExp[];
}

const STATE_MACHINE_SEAM: EngineSeam = {
  name: "state machine",
  owner: "missions / run and session loop",
  defines: [
    /\b(?:nextState|transitionTo|advanceState|setPhase)\s*[(:]/,
    /Record<\s*\w*(?:State|Phase)\s*,\s*\w*(?:State|Phase)/,
    /switch\s*\(\s*(?:this\.)?\w*(?:state|phase|State|Phase)\s*\)/,
  ],
};

export const ENGINE_SEAMS: readonly EngineSeam[] = [
  STATE_MACHINE_SEAM,
  {
    name: "reducer",
    owner: "run and session loop",
    defines: [/\b(?:function|const)\s+\w*[Rr]educer\b/, /switch\s*\(\s*\w*action\.type\s*\)/],
  },
  {
    name: "scheduler",
    owner: "AI director / run and session loop",
    defines: [
      /\bclass\s+\w*(?:Scheduler|TimerQueue|IntervalHeap)\b/,
      /\b(?:timerHeap|intervalHeap)\b/,
      // A due time is a scheduler only where the module also drains a queue by it: a bill that
      // merely carries a `dueAt` field (a schema row, a sort for display) is data.
      /^(?=[^]*\b(?:nextRunAt|dueAt|scheduledAt)\b)(?=[^]*\.(?:shift|pop)\(\))/,
      /\bfunction\s+\w*(?:schedule|tickQueue)\b/,
    ],
  },
  {
    name: "resource pool",
    owner: "items and loot",
    defines: [/\bclass\s+\w*Pool\b/, /\b(?:freeList|pooledObjects|acquireFromPool|releaseToPool)\b/],
  },
  {
    name: "pathfinder",
    owner: "agents",
    defines: [/\b(?:function|const|class)\s+\w*(?:findPath|aStar|AStar|dijkstra|Dijkstra|navSearch)\b/, /\b(?:openSet|closedSet|gScore|fScore|cameFrom)\b/],
  },
  {
    name: "damage or status table",
    owner: "damage and status",
    defines: [
      /\b(?:type|interface)\s+\w*(?:DamageTable|StatusTable|DamageModel|StatusModel)\w*\b/,
      /\b(?:class|function)\s+\w*(?:DamageTable|StatusTable|DamageModel|StatusModel)\b/,
      /\bfunction\s+\w*(?:resolveTableDamage|assertDamageTable|typeMultiplier|armorMitigation|createStatusRuntime|applyStatusEffect)\b/,
    ],
  },
  {
    name: "spawn director",
    owner: "AI director",
    defines: [/\bclass\s+\w*(?:Director|Spawner|SpawnDirector)\b/, /\b(?:spawnBudget|waveBudget|spawnSchedule|difficultyCurve|threatBudget)\b/],
  },
];

/** A named set of states and the transitions between them: a state machine, not a typed field. */
const STATE_UNION = /\btype\s+\w*(?:State|Phase)\s*=\s*[^;]*\|/;
/** An assignment of a named state; the `type X = "a" | ...` declaration itself is not a move. */
const STATE_TRANSITION = /(?<!\btype\s+)\b\w*(?:state|phase|State|Phase)\s*=\s*["'`]/g;

function definesStateMachine(code: string): boolean {
  const moves = code.match(STATE_TRANSITION)?.length ?? 0;
  return moves >= 2 && STATE_UNION.test(code);
}

/**
 * A module that already runs the engine's run loop composes its state: a local `RunPhase` there is a
 * view over `loop.read()`, not a second engine. It is still adoption debt when it re-states the
 * readout, and that is tracked as an issue rather than a gate red - a gate that pushed a lane to
 * rename a phase field would be the same disease as judging a filename.
 */
const SHARED_RUN_LOOP = /from\s+"@jgengine\/core\/run\/sessionLoop"/;

/**
 * A game authors its own damage rows and hands them to the shared model - `const DAMAGE_TABLE:
 * DamageTableDef` fed to `createDamageRuntime`. That table is content, so a table constant is only
 * engine-shaped in a module that does not adopt the shared damage or status model.
 */
const ADOPTS_DAMAGE_MODEL = /from\s+"@jgengine\/core\/combat\/(?:damage\/(?:damageTable|damageRuntime|damageResolution|resistance|landDamage)|statusRuntime|statusApplication)"/;
const DAMAGE_TABLE_CONST = /\b(?:const|let|var)\s+\w*(?:Damage|DAMAGE|Status|STATUS)_?(?:Table|TABLE|Matrix|MATRIX|Chart|CHART)\b/;

/** A file the runner can execute. Anything else - a note, a scene doc, an asset - is never an engine. */
const CODE_FILE = /\.[cm]?[jt]sx?$/;

/** Tests and proof flows describe systems; they do not own them. */
const TEST_FILE = /\.(?:test|spec|flow)\.[cm]?[jt]sx?$/;

/** The in-file exemption, with a reason: `// framework-ok: authored campaign flow, no second adopter`. */
const FRAMEWORK_OK = /^[ \t]*\/\/[ \t]*framework-ok:[ \t]*\S/;

/**
 * Below this many lines of code a match is adoption glue - an adapter that names a shared system -
 * rather than a system of its own, so a lane hears about a mechanism while it is still cheap to move.
 */
export const MIN_SYSTEM_LINES = 20;

/** Drop comments, so prose that mentions a state machine is not read as one. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[^]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Non-blank, non-comment lines: how much of a module is actually code. */
export function codeLines(source: string): number {
  return stripComments(source)
    .split("\n")
    .filter((line) => line.trim().length > 0).length;
}

/**
 * Drop import declarations: `import { type DamageTableDef } from "@jgengine/..."` names a shared
 * type the file adopts, so it must not read as the file defining one.
 */
export function stripImports(code: string): string {
  return code.replace(/^\s*import\s[^;]*?from\s*["'][^"']+["'];?/gm, "");
}

/** The engine systems a file owns; empty when it is content, adoption or too small to be a system. */
export function engineSeams(path: string, source: string): EngineSeam[] {
  if (!CODE_FILE.test(path) || TEST_FILE.test(path)) return [];
  if (FRAMEWORK_OK.test(source)) return [];
  if (codeLines(source) < MIN_SYSTEM_LINES) return [];
  const withImports = stripComments(source);
  const code = stripImports(withImports);
  const seams: EngineSeam[] = [];
  if (!SHARED_RUN_LOOP.test(withImports) && (definesStateMachine(code) || STATE_MACHINE_SEAM.defines.some((pattern) => pattern.test(code)))) {
    seams.push(STATE_MACHINE_SEAM);
  }
  for (const seam of ENGINE_SEAMS) {
    if (seam === STATE_MACHINE_SEAM) continue;
    if (seam.defines.some((pattern) => pattern.test(code))) seams.push(seam);
  }
  const damage = ENGINE_SEAMS.find((seam) => seam.name === "damage or status table");
  if (damage !== undefined && !seams.includes(damage) && DAMAGE_TABLE_CONST.test(code) && !ADOPTS_DAMAGE_MODEL.test(withImports)) {
    seams.push(damage);
  }
  return seams;
}

/** What to do about a seam, in the words of AGENTS.md. */
export function seamAdvice(seam: EngineSeam): string {
  return `${seam.name}: file the seam in Noisemaker111/jgengine under "${seam.owner}" (epic #2312), name the API and the second game that would adopt it, then adopt it here`;
}

/** Files inside a game: `games/<game>/...` from the repository root, excluding the non-game folders. */
const NON_GAME = new Set(["shared", "registry", "scripts", "docs", "node_modules"]);

export function gameFiles(paths: readonly string[]): string[] {
  return paths.filter((path) => {
    const [root, game, ...rest] = path.split("/");
    return root === "games" && game !== undefined && rest.length > 0 && !NON_GAME.has(game) && !game.startsWith(".");
  });
}

export interface Offence {
  file: string;
  seams: EngineSeam[];
}

/** Judge added files by content. `read` returns "" for a file that is gone. */
export async function inspect(paths: readonly string[], read: (path: string) => Promise<string>): Promise<Offence[]> {
  const offences: Offence[] = [];
  for (const file of gameFiles(paths)) {
    const seams = engineSeams(file, await read(file));
    if (seams.length > 0) offences.push({ file, seams });
  }
  return offences;
}

async function main(argv: readonly string[]): Promise<number> {
  const arg = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const base = arg("--base") ?? "origin/beta";

  const changed = (diffArgs: string[]): string[] => {
    const result = spawnSync("git", ["diff", "--name-status", ...diffArgs], { encoding: "utf8" });
    if (result.status !== 0) return [];
    return (result.stdout ?? "")
      .split("\n")
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length === 2 && parts[0] === "A")
      .map((parts) => parts[1]!);
  };

  if (spawnSync("git", ["cat-file", "-e", `${base}:games`]).status !== 0) {
    console.log(`framework check: ${base} has no games/ yet, so there is no earlier tree to judge additions against`);
    return 0;
  }
  const added = gameFiles([...changed([`${base}...HEAD`]), ...changed(["--cached"])]);
  const offences = await inspect(added, (file) => Bun.file(join(process.cwd(), file)).text().catch(() => ""));

  if (offences.length === 0) {
    console.log(`framework check: ${added.length} new game files, none engine-shaped`);
    return 0;
  }

  console.error("framework check: these game files own an engine system, judged by what they contain:");
  for (const offence of offences) {
    console.error(`  ${offence.file}`);
    for (const seam of offence.seams) console.error(`    ${seamAdvice(seam)}`);
  }
  console.error(
    [
      "",
      "A game that imports and calls a shared system is adoption and passes.",
      "If this file truly cannot live upstream, say why on its first line: // framework-ok: <reason>",
      "Rule: games/AGENTS.md -> Framework-first development.",
    ].join("\n"),
  );
  return 1;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
