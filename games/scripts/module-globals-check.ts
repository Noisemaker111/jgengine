/**
 * Fails when a game keeps mutable state at module scope, and when the baseline grows.
 *
 * The engine gate that bites at pin time is `scripts/check-module-globals.ts` in
 * `Noisemaker111/jgengine` (#1579). It scans the cloned `Games/` checkout, so a game PR can
 * merge green here and only fail hours later, when the engine pin bumps and every pin PR
 * inherits the defect. This runs the same rule against these games in this repo's CI, on the
 * PR that causes the failure.
 *
 * The rule is the engine's own, imported from `jgengine/gameShape`: `moduleGlobalName` says which
 * line declares module state (`let <name>` / `export let <name>` at the start of a line) and
 * `isGameSourceFile` which files are read (non-test `.ts`/`.tsx`). A game is a folder with the
 * `src/index.tsx` barrel the dev harness builds.
 *
 * The baseline is shrink-only: a new offender fails, an entry that no longer applies fails, and
 * `--write` may only drop entries — it never baselines a new one.
 *
 * Usage:
 *   bun run games:check-module-globals            # verify the games against the baseline
 *   bun run games:check-module-globals --write    # drop baseline entries that no longer apply
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { isGameSourceFile, moduleGlobalName } from "../../packages/jgengine/src/gameShape";

export const BASELINE_REL = "scripts/module-globals-baseline.json";

const GUIDANCE =
  "Module scope is shared by every GameContext in the process, so a server host running two\n" +
  "sessions, split-screen, and a test suite all read the same value. Put per-run or per-player\n" +
  "state in `defineStore(key, initial)` (or `perContext`) and read it through `ctx`; see\n" +
  "`harbor-heat/src/game/session.ts`. The rule is the engine's:\n" +
  "jgengine/gameShape moduleGlobalName, which engine scripts/check-module-globals.ts runs too.";

export interface ModuleGlobal {
  /** Stable identity across runs — what the baseline stores. */
  key: string;
  /** How the finding is shown to a human, e.g. `beacon-bastion/src/game/save.ts:146`. */
  where: string;
}

/** Every game's non-test `.ts`/`.tsx` under `src`, as repo-relative paths with their source. */
export function gameSources(root: string): { rel: string; source: string }[] {
  const files: { rel: string; source: string }[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry === "node_modules" || entry === "dist") continue;
        walk(path);
      } else if (isGameSourceFile(entry)) {
        files.push({ rel: relative(root, path).replace(/\\/g, "/"), source: readFileSync(path, "utf8") });
      }
    }
  };

  for (const game of readdirSync(root).sort()) {
    if (game.startsWith(".") || game === "node_modules") continue;
    const src = join(root, game, "src");
    // Only real games have the src/index.tsx barrel (the dev harness entry); this excludes
    // helper packages like `shared`/`studios` and design-only folders like `registry`.
    if (!existsSync(join(src, "index.tsx"))) continue;
    walk(src);
  }
  return files;
}

/** The module-scope `let`s the engine's gate would reject, sorted by identity. */
export function findModuleGlobals(root: string): ModuleGlobal[] {
  const found: ModuleGlobal[] = [];
  for (const { rel, source } of gameSources(root)) {
    for (const [index, line] of source.split("\n").entries()) {
      const name = moduleGlobalName(line);
      if (name === null) continue;
      found.push({ key: `${rel}#${name}`, where: `${rel}:${index + 1}` });
    }
  }
  return found.sort((a, b) => a.key.localeCompare(b.key));
}

/** The two failures a shrink-only baseline has: an offender not listed, and a listed key with no code. */
export function ratchetResult(
  baseline: readonly string[],
  live: readonly ModuleGlobal[],
): { added: ModuleGlobal[]; stale: string[] } {
  const known = new Set(baseline);
  const liveKeys = new Set(live.map((finding) => finding.key));
  return {
    added: live.filter((finding) => !known.has(finding.key)),
    stale: [...known].filter((key) => !liveKeys.has(key)).sort(),
  };
}

export function parseBaseline(source: string): string[] {
  const parsed: unknown = JSON.parse(source);
  if (!Array.isArray(parsed) || parsed.some((key) => typeof key !== "string")) {
    throw new Error(`${BASELINE_REL} must be a JSON array of "relative/path.ts#name" strings`);
  }
  return parsed as string[];
}

interface Sink {
  log(message: string): void;
  error(message: string): void;
}

/** Runs the gate against `root` and returns the process exit code. */
export function runGate(root: string, argv: readonly string[], sink: Sink = console): number {
  const baselinePath = join(root, BASELINE_REL);
  const live = findModuleGlobals(root);
  const write = argv.includes("--write");

  if (!existsSync(baselinePath)) {
    if (!write) {
      sink.error(
        `check-module-globals failed: ${BASELINE_REL} is missing.\n\n` +
          `Create it once with: bun run games:check-module-globals --write\n`,
      );
      return 1;
    }
    writeFileSync(baselinePath, `${JSON.stringify(live.map((finding) => finding.key), null, 2)}\n`);
    sink.log(`check-module-globals: wrote ${live.length} entr(ies) to ${BASELINE_REL}`);
    return 0;
  }

  const { added, stale } = ratchetResult(parseBaseline(readFileSync(baselinePath, "utf8")), live);

  if (added.length > 0) {
    sink.error(`\ncheck-module-globals failed: ${added.length} new module-scope global(s)\n`);
    for (const finding of added) sink.error(`  ${finding.where}`);
    sink.error(
      write
        ? `\nThe baseline is shrink-only, so --write will not add these. Fix the code instead.\n\n${GUIDANCE}\n`
        : `\n${GUIDANCE}\n`,
    );
    return 1;
  }

  if (write) {
    writeFileSync(baselinePath, `${JSON.stringify(live.map((finding) => finding.key), null, 2)}\n`);
    sink.log(
      stale.length > 0
        ? `check-module-globals: dropped ${stale.length} stale entr(ies) from ${BASELINE_REL}`
        : `check-module-globals: ${BASELINE_REL} already matches (${live.length} entr(ies))`,
    );
    return 0;
  }

  if (stale.length > 0) {
    sink.error(`\ncheck-module-globals failed: ${stale.length} baselined entr(ies) no longer apply\n`);
    for (const key of stale) sink.error(`  ${key}`);
    sink.error(`\nThe baseline is shrink-only — commit the smaller list.\nFix: bun run games:check-module-globals --write\n`);
    return 1;
  }

  sink.log(`check-module-globals ok: ${live.length} baselined, none added`);
  return 0;
}

if (import.meta.main) {
  process.exit(runGate(fileURLToPath(new URL("..", import.meta.url)), process.argv.slice(2)));
}
