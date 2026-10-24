import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The shrink-only baseline shared by the debt ratchets (#1575, #1579, #1581): a committed list of
 * known offenders, a scan of the live tree, and two failures — a new offender, or a baselined entry
 * that no longer applies and so must be committed away.
 *
 * A finding may name a debt `group`, and the baseline may cap that group with a ceiling. The cap is
 * the part that keeps a class from disappearing into the list: paying one at a time is slower than
 * the list grows, so the count of the gap a product invariant forbids is committed, printed and
 * shrink-only, and `--write` refuses to raise it.
 */

export interface RatchetFinding {
  /** Stable identity across runs — what the baseline stores. */
  key: string;
  /** How the finding is shown to a human, e.g. `path/to/file.ts:12`. Defaults to `key`. */
  where?: string;
  /** Debt group this finding belongs to; a group can carry a ceiling in the baseline. */
  group?: string;
}

export interface RatchetBaseline {
  /** Known offenders, shrink-only. */
  keys: string[];
  /** Most findings a debt group may hold. Lowered as the debt is paid; never raised. */
  ceilings?: Record<string, number>;
}

export interface RatchetSpec {
  name: string;
  baselineRel: string;
  scan: (root: string) => readonly RatchetFinding[];
  /** Printed under the list of new offenders — what to do instead. */
  guidance: string;
}

function readBaseline(path: string): RatchetBaseline | null {
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as string[] | RatchetBaseline;
  return Array.isArray(raw) ? { keys: raw } : { keys: raw.keys, ceilings: raw.ceilings };
}

/** What a run would report, so a test can judge it without exiting a process. */
export interface RatchetVerdict {
  /** Offenders the baseline does not excuse. */
  added: RatchetFinding[];
  /** Baselined keys that no longer appear live and must be committed away. */
  fixed: string[];
  /** Groups holding more findings than their ceiling allows. */
  overCeilings: Array<{ group: string; limit: number; live: number; findings: readonly RatchetFinding[] }>;
  /** Groups paid below their ceiling, which must be lowered. */
  slackCeilings: Array<{ group: string; limit: number; live: number }>;
}

export function evaluateRatchet(
  findings: readonly RatchetFinding[],
  baseline: RatchetBaseline,
): RatchetVerdict {
  const liveKeys = findings.map((finding) => finding.key);
  const known = new Set(baseline.keys);
  const ceilings = baseline.ceilings ?? {};
  const countIn = (group: string) => findings.filter((finding) => finding.group === group).length;
  return {
    added: findings.filter((finding) => !known.has(finding.key)),
    fixed: [...known].filter((key) => !liveKeys.includes(key)).sort(),
    overCeilings: Object.entries(ceilings)
      .filter(([group, limit]) => countIn(group) > limit)
      .map(([group, limit]) => ({
        group,
        limit,
        live: countIn(group),
        findings: findings.filter((finding) => finding.group === group),
      })),
    slackCeilings: Object.entries(ceilings)
      .filter(([group, limit]) => countIn(group) < limit)
      .map(([group, limit]) => ({ group, limit, live: countIn(group) })),
  };
}

/** Runs a ratchet, writing the baseline instead when `--write` is passed. Exits the process. */
export function runRatchet(spec: RatchetSpec, root: string, argv: readonly string[]): never {
  const baselinePath = join(root, spec.baselineRel);
  const live = spec.scan(root);
  const liveKeys = live.map((finding) => finding.key);
  const countIn = (group: string) => live.filter((finding) => finding.group === group).length;
  const previous = readBaseline(baselinePath);
  const ceilings = previous?.ceilings ?? {};

  if (argv.includes("--write")) {
    const grown = Object.entries(ceilings).filter(([group, limit]) => countIn(group) > limit);
    if (grown.length > 0) {
      const detail = grown.map(([group, limit]) => `  ${group}: ${countIn(group)} live, ceiling ${limit}`).join("\n");
      console.error(`\n${spec.name} refused to write: a ceiling would rise\n\n${detail}\n`);
      console.error(`${spec.guidance}\n`);
      process.exit(1);
    }
    const shape: string[] | RatchetBaseline =
      Object.keys(ceilings).length > 0 ? { ceilings, keys: liveKeys } : liveKeys;
    writeFileSync(baselinePath, `${JSON.stringify(shape, null, 2)}\n`);
    console.log(`${spec.name}: wrote ${liveKeys.length} entr(ies) to ${spec.baselineRel}`);
    process.exit(0);
  }

  const verdict = evaluateRatchet(live, previous ?? { keys: [] });

  if (verdict.added.length > 0) {
    console.error(`\n${spec.name} failed: ${verdict.added.length} new offender(s)\n`);
    for (const finding of verdict.added) {
      const group = finding.group === undefined ? "" : ` [${finding.group}]`;
      console.error(`  ${finding.where ?? finding.key}${group}`);
    }
    console.error(`\n${spec.guidance}\n`);
    process.exit(1);
  }

  if (verdict.fixed.length > 0) {
    console.error(`\n${spec.name} failed: ${verdict.fixed.length} baselined entr(ies) no longer apply\n`);
    for (const key of verdict.fixed) console.error(`  ${key}`);
    console.error(`\nThe baseline is shrink-only — commit the smaller list.\nFix: bun run ${spec.name} --write\n`);
    process.exit(1);
  }

  if (verdict.overCeilings.length > 0) {
    console.error(`\n${spec.name} failed: a debt group grew past its ceiling\n`);
    for (const over of verdict.overCeilings) {
      console.error(`  ${over.group}: ${over.live} live, ceiling ${over.limit}`);
      for (const finding of over.findings) console.error(`    ${finding.where ?? finding.key}`);
    }
    console.error(`\n${spec.guidance}\n`);
    process.exit(1);
  }

  if (verdict.slackCeilings.length > 0) {
    console.error(`\n${spec.name} failed: a debt group is under its ceiling\n`);
    for (const slack of verdict.slackCeilings) console.error(`  ${slack.group}: ${slack.live} live, ceiling ${slack.limit}`);
    console.error(`\nThe ceiling is shrink-only — lower it in ${spec.baselineRel}.\n`);
    process.exit(1);
  }

  const capped = Object.entries(ceilings)
    .map(([group, limit]) => `, ${group} ${countIn(group)}/${limit}`)
    .join("");
  console.log(`${spec.name} ok: ${previous?.keys.length ?? 0} baselined, none added${capped}`);
  process.exit(0);
}
