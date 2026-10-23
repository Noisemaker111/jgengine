// The CI `types` job runs this: the same stages as `bun run check-types`, with the
// independent ones in flight together instead of one after another.
//
// Measured on a runner (2026-10-23, ubuntu 4 vCPU, run 39896431876): the whole plan was 59 s,
// of which the tsc fan-out was 21 s, `check-skill-api` 10.5 s, `check-capabilities` 9.7 s,
// `check-doc-symbols` 3.2 s, every other stage under 1 s together, and the rest was 24 bun
// startups. The three of those that matter do not read each other, so they overlap; that is
// what makes this faster than adding jobs, because a second job pays 15 s of checkout, install
// and build before its first stage runs.
//
//   bun scripts/type-shard.ts             # every stage, four at a time
//   bun scripts/type-shard.ts --check     # stage names and how many run in flight
//
// The stage list is `PLANS["check-types"]` itself, not a copy: `scripts/type-shard.test.ts`
// fails if this file ever runs a different set, and each failing stage is reported with the
// same re-run hint `bun run check-types` gives.
import { PLANS, rerunHint, fixHint, type Stage, type StageResult } from "./run-stages";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

export const PLAN = "check-types";
/**
 * Two stages at a time. Four was measured first and bought 5 s: a 4-vCPU runner starves
 * four CPU-bound stages and the tsc fan-out's own eight children, so the whole plan took 54 s
 * against 59 s one after another. Two lanes put the fan-out beside the two generators that
 * matter, which are the only stages with anything to overlap.
 */
export const CONCURRENCY = 2;
/**
 * Relative cost of the stages worth ordering by, from the run named above. A stale number
 * only costs overlap - the longest stage starting late - never correctness.
 */
export const WEIGHT: Readonly<Record<string, number>> = {
  "check-types-all": 21,
  "check-skill-api": 10.5,
  "check-capabilities": 9.7,
  "check-doc-symbols": 3.2,
};

/** Plan order, except that the measured-heavy stages start first so they overlap the rest. */
export function ordered(stages: readonly Stage[]): Stage[] {
  return stages
    .map((stage, index) => ({ stage, index, weight: WEIGHT[stage.name] ?? 0 }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((entry) => entry.stage);
}

/** Run `work` over every item with at most `concurrency` in flight, keeping going after a failure. */
export async function runPool<T>(items: readonly T[], concurrency: number, work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const lanes = Math.max(1, Math.min(concurrency, queue.length));
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
    }),
  );
}

/**
 * Every stage's fate: the stages with no prerequisite run first and alone, then the rest run
 * `concurrency` at a time. A stage whose prerequisite failed is skipped, never reported green.
 */
export async function runTypes(
  stages: readonly Stage[],
  run: (stage: Stage) => Promise<boolean>,
  concurrency: number = CONCURRENCY,
): Promise<StageResult[]> {
  const failed = new Set<string>();
  const results = new Map<string, StageResult>();
  const record = (stage: Stage, ok: boolean): void => {
    if (!ok) failed.add(stage.name);
    results.set(stage.name, { name: stage.name, state: ok ? "passed" : "failed" });
  };

  const gated = stages.filter((stage) => (stage.needs ?? []).length === 0);
  for (const stage of gated) record(stage, await run(stage));

  const ready: Stage[] = [];
  for (const stage of ordered(stages.filter((entry) => (entry.needs ?? []).length > 0))) {
    const blockedBy = (stage.needs ?? []).filter((need) => failed.has(need));
    if (blockedBy.length === 0) ready.push(stage);
    else results.set(stage.name, { name: stage.name, state: "skipped", blockedBy });
  }

  await runPool(ready, concurrency, async (stage) => record(stage, await run(stage)));

  return stages.map((stage) => results.get(stage.name)!);
}

async function spawnStage(stage: Stage): Promise<boolean> {
  const proc = Bun.spawn([stage.command, ...stage.args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const output = `${stdout}${stderr}`.trim();
  if (code !== 0 && output.length > 0) console.log(output);
  return code === 0;
}

if (import.meta.main) {
  const stages = PLANS[PLAN]!;
  if (process.argv.includes("--check")) {
    const first = stages.filter((entry) => (entry.needs ?? []).length === 0);
    const rest = stages.filter((entry) => (entry.needs ?? []).length > 0);
    console.log(`${PLAN}: ${stages.length} stage(s), ${Math.min(CONCURRENCY, rest.length)} in flight after ${first.map((entry) => entry.name).join(", ")}`);
    for (const stage of [...first, ...ordered(rest)]) console.log(`  ${stage.name}`);
    process.exit(0);
  }

  const started = new Map<string, number>();
  const results = await runTypes(stages, async (stage) => {
    started.set(stage.name, Date.now());
    console.log(`\n--- ${PLAN} › ${stage.name}`);
    const ok = await spawnStage(stage);
    const seconds = (Date.now() - (started.get(stage.name) ?? Date.now())) / 1000;
    console.log(`${ok ? "PASS" : "FAIL"} ${stage.name} (${seconds.toFixed(1)}s)`);
    return ok;
  });

  const failed = results.filter((result) => result.state !== "passed");
  console.log(`\n${PLAN}: ${results.length - failed.length} passed, ${failed.length} failed`);
  for (const name of failed.map((result) => result.name)) {
    console.log(`re-run: ${rerunHint(stages, name)}`);
    const fix = fixHint(stages, name);
    if (fix !== undefined) console.log(`fix drifted artifacts with: ${fix}`);
  }
  process.exit(failed.length === 0 ? 0 : 1);
}
