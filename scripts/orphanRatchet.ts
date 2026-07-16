import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ORPHAN_BASELINE_REL = "scripts/api-orphan-baseline.json";
const DEFAULT_REF = process.env.ORPHAN_RATCHET_REF ?? "origin/main";

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

export function orphanRatchetViolations(
  reference: readonly string[],
  committed: readonly string[],
): OrphanRatchetResult {
  const ref = new Set(reference);
  const added = [...new Set(committed)].filter((key) => !ref.has(key)).sort();
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
