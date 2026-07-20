import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Clean-checkout asset-pack availability gate.
 *
 * Every model pack a `Games/*` references must resolve to bytes that exist on a
 * fresh `git clone` — otherwise the game hard-crashes on boot for anyone who
 * checks the repo out without a manual asset pull. A pack is available when it is
 * either **committed** (git-tracked bytes under `apps/dev/public/models/<pack>/`,
 * allow-listed in `.gitignore`) or **provisioned** (an `assets pull <pack>` step
 * wired into the standard bootstrap / cloud-setup path). A pack that is neither is
 * a `dangling` reference and fails the gate, so a game can never silently ship a
 * dependency on a pack that will not be present on a clean checkout.
 *
 * The pure {@link checkAssetAvailability} takes already-resolved data so it is
 * unit-testable; the script driver at the bottom wires it to the real repo (game
 * source scan, `git ls-files`, and the provision-step scan).
 */

/** The editor's asset-import sink — always allow-listed, never a pack dependency. */
export const SENTINEL_PACKS: ReadonlySet<string> = new Set(["imported"]);

/** A single model-pack reference discovered in a game's source. */
export interface PackReference {
  /** The game id that references the pack. */
  game: string;
  /** The pack folder id (the `<pack>` in `/models/<pack>/` and in `buildCatalog({ sources })`). */
  pack: string;
  /** How the reference was found — for the failure diagnostic. */
  via: "buildCatalog" | "path-literal";
}

/** Inputs to the pure availability check: what is referenced vs. what a clean checkout can provide. */
export interface AvailabilityInput {
  references: readonly PackReference[];
  /** Packs with git-tracked bytes — present immediately on a clean clone. */
  committed: ReadonlySet<string>;
  /** Packs a bootstrap / cloud-setup `assets pull <pack>` step provisions on a fresh session. */
  provisioned: ReadonlySet<string>;
}

/** Result of the availability check: `ok` plus one diagnostic per dangling reference. */
export interface AvailabilityResult {
  ok: boolean;
  errors: string[];
}

/**
 * Fail for every referenced pack that is neither committed nor provisioned (nor a
 * sentinel). Genre-agnostic and data-driven: it judges the packs the games
 * actually reference against the packs a clean checkout can actually provide,
 * with no hard-coded pack list.
 */
export function checkAssetAvailability(input: AvailabilityInput): AvailabilityResult {
  const errors: string[] = [];
  for (const ref of input.references) {
    if (SENTINEL_PACKS.has(ref.pack)) continue;
    if (input.committed.has(ref.pack)) continue;
    if (input.provisioned.has(ref.pack)) continue;
    errors.push(
      `${ref.game}: model pack "${ref.pack}" (referenced via ${ref.via}) is not available on a clean checkout — ` +
        `it is neither committed (allow-list it in .gitignore and \`git add -f apps/dev/public/models/${ref.pack}\`) ` +
        `nor provisioned (add \`assets pull ${ref.pack}\` to scripts/cloud-setup.sh). A fresh clone would crash on boot.`,
    );
  }
  return { ok: errors.length === 0, errors };
}

/** Recursively collect `.ts`/`.tsx` files under a directory. */
function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFilesUnder(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// The `sources: [...]` array of a `buildCatalog(...)` call — scoped to buildCatalog so
// unrelated arrays like a game's `resources: [...]` never leak in. Non-greedy from the
// call head to the first `sources` key, and `\bsources` so `resources:` cannot match.
const BUILD_CATALOG_SOURCES = /buildCatalog\s*\(\s*\{[\s\S]*?\bsources\s*:\s*\[([^\]]*)\]/g;
const QUOTED = /["'\x60]([a-zA-Z0-9_-]+)["'\x60]/g;
const MODELS_LITERAL = /\/models\/([a-zA-Z0-9_-]+)\//g;

/**
 * Extract every model-pack reference from a single game's source: the string
 * literals of any `buildCatalog({ sources: [...] })` array, plus every
 * `/models/<pack>/` served-path literal (how packs like `claudecraft` that skip
 * `buildCatalog` still declare their folder dependency).
 */
export function packReferencesForGame(game: string, srcDir: string): PackReference[] {
  const refs = new Map<string, PackReference>();
  const add = (pack: string, via: PackReference["via"]): void => {
    if (!refs.has(pack)) refs.set(pack, { game, pack, via });
  };
  for (const file of sourceFilesUnder(srcDir)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(BUILD_CATALOG_SOURCES)) {
      for (const inner of match[1]!.matchAll(QUOTED)) add(inner[1]!, "buildCatalog");
    }
    for (const match of text.matchAll(MODELS_LITERAL)) add(match[1]!, "path-literal");
  }
  return [...refs.values()];
}

/** Every game's pack references, scanning each `Games/<id>/src` tree. */
export function referencedPacks(gamesDir: string): PackReference[] {
  const refs: PackReference[] = [];
  for (const name of readdirSync(gamesDir)) {
    const srcDir = join(gamesDir, name, "src");
    if (!existsSync(srcDir) || !statSync(join(gamesDir, name)).isDirectory()) continue;
    refs.push(...packReferencesForGame(name, srcDir));
  }
  return refs;
}

/** Pack folders with git-tracked bytes under `apps/dev/public/models/` — available on a clean clone. */
export function committedPacks(root: string): Set<string> {
  const out = new Set<string>();
  const tracked = execFileSync("git", ["ls-files", "apps/dev/public/models"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  for (const line of tracked.split("\n")) {
    const match = /^apps\/dev\/public\/models\/([^/]+)\//.exec(line.trim());
    if (match) out.add(match[1]!);
  }
  return out;
}

/**
 * Pack ids a bootstrap / cloud-setup step provisions, scraped from the shell and
 * bootstrap scripts so the gate stays in sync with however the repo actually
 * pulls packs. Any `assets pull <id>` (or `run pull <id>`) line makes `<id>`
 * count as provisioned. Empty today — the repo ships every referenced pack by
 * commit — but wiring a pull into cloud-setup.sh would satisfy the gate with no
 * gate edit.
 */
export function provisionedPacks(root: string): Set<string> {
  const out = new Set<string>();
  const scripts = ["scripts/cloud-setup.sh", "scripts/agent-bootstrap.ts"];
  const pull = /(?:assets|run)\s+pull\s+([a-zA-Z0-9_-]+)/g;
  for (const rel of scripts) {
    const path = join(root, rel);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(pull)) out.add(match[1]!);
  }
  return out;
}

if (import.meta.main) {
  const root = process.cwd();
  const references = referencedPacks(join(root, "Games"));
  const committed = committedPacks(root);
  const provisioned = provisionedPacks(root);
  const result = checkAssetAvailability({ references, committed, provisioned });

  if (!result.ok) {
    console.error("check-asset-availability: referenced model packs missing on a clean checkout:\n");
    for (const error of result.errors) console.error(`  ✗ ${error}`);
    console.error(
      `\n${result.errors.length} dangling pack reference(s). ` +
        `Commit the pack bytes or wire a provision step before the game can ship.`,
    );
    process.exit(1);
  }

  const packs = new Set(references.map((ref) => ref.pack).filter((pack) => !SENTINEL_PACKS.has(pack)));
  console.log(
    `check-asset-availability: ok — ${packs.size} referenced pack(s) across ${
      new Set(references.map((ref) => ref.game)).size
    } game(s) all resolve on a clean checkout ` +
      `(${committed.size} committed${provisioned.size > 0 ? `, ${provisioned.size} provisioned` : ""}).`,
  );
}
