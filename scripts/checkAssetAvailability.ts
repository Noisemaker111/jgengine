import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { importedPackNames, packExportName } from "../packages/assets/src/manifest";
import { sources } from "../packages/assets/src/sources";

/**
 * Clean-checkout asset-pack availability gate.
 *
 * Every model pack a `games/*` references must resolve to bytes that exist on a
 * fresh `git clone` — otherwise the game hard-crashes on boot for anyone who
 * checks the repo out without a manual asset pull. A pack is available when it is
 * either **committed** (git-tracked bytes under `apps/dev/public/models/<pack>/`,
 * allow-listed in `.gitignore`, or under the game's own `games/<id>/public/models/<pack>/`,
 * which the runner serves for that game) or **provisioned** (an `assets pull <pack>` step
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

export interface PackReference {
  game: string;
  pack: string;
  via: "pack-import" | "path-literal";
}

export interface AvailabilityInput {
  references: readonly PackReference[];
  /** Packs with git-tracked bytes — present immediately on a clean clone. */
  committed: ReadonlySet<string>;
  /** Packs with git-tracked bytes in one game's own `public/models/`, by game id: present for that game only. */
  committedByGame?: ReadonlyMap<string, ReadonlySet<string>>;
  provisioned: ReadonlySet<string>;
}

export interface AvailabilityResult {
  ok: boolean;
  errors: string[];
}

export function checkAssetAvailability(input: AvailabilityInput): AvailabilityResult {
  const errors: string[] = [];
  for (const ref of input.references) {
    if (SENTINEL_PACKS.has(ref.pack)) continue;
    if (input.committed.has(ref.pack)) continue;
    if (input.committedByGame?.get(ref.game)?.has(ref.pack) === true) continue;
    if (input.provisioned.has(ref.pack)) continue;
    errors.push(
      `${ref.game}: model pack "${ref.pack}" (referenced via ${ref.via}) is not available on a clean checkout — ` +
        `it is neither committed (allow-list it in .gitignore and \`git add -f apps/dev/public/models/${ref.pack}\`) ` +
        `nor provisioned (add \`assets pull ${ref.pack}\` to scripts/cloud-setup.sh). A fresh clone would crash on boot.`,
    );
  }
  return { ok: errors.length === 0, errors };
}

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

const MODELS_LITERAL = /(?<=["'`])\/models\/([a-zA-Z0-9_-]+)\//g;

const sourceByPackName = new Map(sources.map((source) => [packExportName(source.id), source.id]));

export function packReferencesForGame(game: string, srcDir: string): PackReference[] {
  const refs = new Map<string, PackReference>();
  const add = (pack: string, via: PackReference["via"]): void => {
    if (!refs.has(pack)) refs.set(pack, { game, pack, via });
  };
  for (const file of sourceFilesUnder(srcDir)) {
    const text = readFileSync(file, "utf8");
    for (const name of importedPackNames(text)) {
      const pack = sourceByPackName.get(name);
      if (pack !== undefined) add(pack, "pack-import");
    }
    for (const match of text.matchAll(MODELS_LITERAL)) add(match[1]!, "path-literal");
  }
  return [...refs.values()];
}

export function referencedPacks(gamesDir: string): PackReference[] {
  if (!existsSync(gamesDir)) return [];
  const refs: PackReference[] = [];
  for (const name of readdirSync(gamesDir)) {
    if (!existsSync(join(gamesDir, name, "src/index.tsx"))) continue;
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

/** Pack folders with git-tracked bytes under each game's own `games/<id>/public/models/`, by game id. */
export function gameCommittedPacks(root: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const tracked = execFileSync("git", ["ls-files", "games/*/public/models/*"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  for (const line of tracked.split("\n")) {
    const match = /^games\/([^/]+)\/public\/models\/([^/]+)\//.exec(line.trim());
    if (match === null) continue;
    const packs = out.get(match[1]!) ?? new Set<string>();
    packs.add(match[2]!);
    out.set(match[1]!, packs);
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
  const gamesDir = join(root, "games");
  if (!existsSync(gamesDir)) {
    console.log("check-asset-availability: clean — no games/ folder");
    process.exit(0);
  }
  const references = referencedPacks(gamesDir);
  const committed = committedPacks(root);
  const provisioned = provisionedPacks(root);
  const result = checkAssetAvailability({ references, committed, committedByGame: gameCommittedPacks(root), provisioned });

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
