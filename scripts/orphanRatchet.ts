import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ORPHAN_BASELINE_REL = "scripts/api-orphan-baseline.json";
const DEFAULT_REF = process.env["ORPHAN_RATCHET_REF"] ?? "origin/main";

export interface OrphanRatchetResult {
  added: string[];
  ok: boolean;
}

export function parseBaseline(text: string): string[] {
  const value = JSON.parse(text) as unknown;
  if (!Array.isArray(value) || value.some((k) => typeof k !== "string"))
    throw new Error("orphan baseline is not a string array");
  return value as string[];
}

/** The packages a feature folder spans: a file moving between them (shell → core) keeps its identity. */
const ENGINE_PACKAGES = new Set(["@jgengine/core", "@jgengine/react", "@jgengine/shell"]);

/**
 * `@jgengine/core/hud/hudScale#rectOverflow` → `@jgengine/core#rectOverflow`. An exported name has one
 * definition engine-wide (check-concept-homes), so package plus name is the symbol's identity, and a
 * file moving between folders is the same orphan, not a new one. Core, react and shell count as one
 * package, since a feature folder in core gathers files from all three.
 */
export function orphanIdentity(key: string): string {
  const hash = key.indexOf("#");
  const module = hash < 0 ? key : key.slice(0, hash);
  const found = /^(@[^/]+\/[^/]+)/.exec(module)?.[1] ?? module;
  const pkg = ENGINE_PACKAGES.has(found) ? "@jgengine/engine" : found;
  return hash < 0 ? pkg : `${pkg}${key.slice(hash)}`;
}

export function orphanRatchetViolations(
  reference: readonly string[],
  committed: readonly string[],
): OrphanRatchetResult {
  const ref = new Set(reference.map(orphanIdentity));
  const added = [...new Set(committed)].filter((key) => !ref.has(orphanIdentity(key))).sort();
  return { added, ok: added.length === 0 };
}

export function readReferenceBaseline(root: string, ref: string = DEFAULT_REF): string[] | null {
  const result = spawnSync("git", ["show", `${ref}:${ORPHAN_BASELINE_REL}`], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return null;
  try {
    return parseBaseline(result.stdout);
  } catch {
    return null;
  }
}

export function readCommittedBaseline(root: string): string[] {
  const path = join(root, ORPHAN_BASELINE_REL);
  if (!existsSync(path)) return [];
  return parseBaseline(readFileSync(path, "utf8"));
}

export function runOrphanRatchet(root: string, ref: string = DEFAULT_REF): string[] {
  const reference = readReferenceBaseline(root, ref);
  if (reference === null) return [];
  const committed = readCommittedBaseline(root);
  const { added } = orphanRatchetViolations(reference, committed);
  if (added.length === 0) return [];
  return [
    `${ORPHAN_BASELINE_REL} grew by ${added.length} entr(ies) vs ${ref} — the orphan baseline is shrink-only; ` +
      `add an exact consumer import, tag its @capability intent, or mark it @internal instead of baselining it:`,
    ...added.map((key) => `  ${key}`),
  ];
}
