import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The shrink-only baseline shared by the debt ratchets (#1575, #1579, #1581): a committed list of
 * known offenders, a scan of the live tree, and two failures — a new offender, or a baselined entry
 * that no longer applies and so must be committed away.
 */

export interface RatchetFinding {
  /** Stable identity across runs — what the baseline stores. */
  key: string;
  /** How the finding is shown to a human, e.g. `path/to/file.ts:12`. Defaults to `key`. */
  where?: string;
}

export interface RatchetSpec {
  name: string;
  baselineRel: string;
  scan: (root: string) => readonly RatchetFinding[];
  /** Printed under the list of new offenders — what to do instead. */
  guidance: string;
}

/** Runs a ratchet, writing the baseline instead when `--write` is passed. Exits the process. */
export function runRatchet(spec: RatchetSpec, root: string, argv: readonly string[]): never {
  const baselinePath = join(root, spec.baselineRel);
  const live = spec.scan(root);
  const liveKeys = live.map((finding) => finding.key);

  if (argv.includes("--write")) {
    writeFileSync(baselinePath, `${JSON.stringify(liveKeys, null, 2)}\n`);
    console.log(`${spec.name}: wrote ${liveKeys.length} entr(ies) to ${spec.baselineRel}`);
    process.exit(0);
  }

  const baseline = new Set(JSON.parse(readFileSync(baselinePath, "utf8")) as string[]);
  const added = live.filter((finding) => !baseline.has(finding.key));
  const fixed = [...baseline].filter((key) => !liveKeys.includes(key)).sort();

  if (added.length > 0) {
    console.error(`\n${spec.name} failed: ${added.length} new offender(s)\n`);
    for (const finding of added) console.error(`  ${finding.where ?? finding.key}`);
    console.error(`\n${spec.guidance}\n`);
    process.exit(1);
  }

  if (fixed.length > 0) {
    console.error(`\n${spec.name} failed: ${fixed.length} baselined entr(ies) no longer apply\n`);
    for (const key of fixed) console.error(`  ${key}`);
    console.error(`\nThe baseline is shrink-only — commit the smaller list.\nFix: bun run ${spec.name} --write\n`);
    process.exit(1);
  }

  console.log(`${spec.name} ok: ${baseline.size} baselined, none added`);
  process.exit(0);
}
