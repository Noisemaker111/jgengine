import { eachGameSource } from "./gameSourceScan";
import type { RatchetFinding } from "./ratchet";

/**
 * #1581: `Math.random` in a game makes the run unreproducible — no replay, no lockstep, no
 * rollback, and a test that cannot pin the outcome. `ctx.rng` is the per-world deterministic
 * stream every game context already carries.
 *
 * Keyed per file, not per line, so the baseline survives ordinary edits.
 */
export function findRandomnessLeaks(root: string): RatchetFinding[] {
  const found: RatchetFinding[] = [];
  for (const { rel, source } of eachGameSource(root)) {
    const lines = source
      .split("\n")
      .map((line, index) => (line.includes("Math.random") ? index + 1 : 0))
      .filter((lineNumber) => lineNumber > 0);
    if (lines.length === 0) continue;
    found.push({ key: rel, where: `${rel}:${lines.join(",")}` });
  }
  return found.sort((a, b) => a.key.localeCompare(b.key));
}
