import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PLANS, type Stage } from "./run-stages";
import { CONCURRENCY, ordered, PLAN, planStages, PROVEN_IN_QUICK, runPool, runTypes, WEIGHT } from "./type-shard";

const stage = (name: string, needs: readonly string[] = ["ensure-ready"]): Stage => ({
  name,
  command: "true",
  args: [],
  needs,
});

test("the pool never runs more than the concurrency it was given", async () => {
  let inFlight = 0;
  let peak = 0;
  const seen: number[] = [];
  await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await Bun.sleep(5);
    seen.push(item);
    inFlight -= 1;
  });
  expect(peak).toBe(3);
  expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

test("a failing stage does not stop the stages beside it", async () => {
  const stages = [stage("ensure-ready", []), stage("bad"), stage("good")];
  const ran: string[] = [];
  const results = await runTypes(stages, async (entry) => {
    ran.push(entry.name);
    return entry.name !== "bad";
  });
  expect(ran).toEqual(["ensure-ready", "bad", "good"]);
  expect(results.map((result) => result.state)).toEqual(["passed", "failed", "passed"]);
});

test("a stage whose prerequisite failed is skipped, never reported as passing", async () => {
  const stages = [stage("ensure-ready", []), stage("after", ["ensure-ready"])];
  const results = await runTypes(stages, async () => false);
  expect(results[1]).toEqual({ name: "after", state: "skipped", blockedBy: ["ensure-ready"] });
});

test("the heaviest measured stages start first so they overlap the rest", () => {
  const names = ordered(PLANS["check-types"]!).map((entry) => entry.name);
  expect(names.slice(0, 4)).toEqual(["check-types-all", "check-skill-api", "check-capabilities", "check-doc-symbols"]);
});

test("every weight names a stage the plan still has, so a rename cannot silently reorder nothing", () => {
  const names = new Set(PLANS["check-types"]!.map((entry) => entry.name));
  for (const name of Object.keys(WEIGHT)) expect(names.has(name)).toBe(true);
});

test("the plan is the check-types plan and nothing is dropped from it", () => {
  expect(PLAN).toBe("check-types");
  const stages = PLANS[PLAN]!;
  expect(stages.length).toBeGreaterThan(20);
  expect(stages[0]!.name).toBe("ensure-ready");
  expect(stages.at(-1)!.name).toBe("check-types-all");
  expect(CONCURRENCY).toBeGreaterThan(1);
});

/** The commands the `quick` job runs, one per line of its steps. */
function quickJob(): string {
  const workflow = readFileSync(fileURLToPath(new URL("../.github/workflows/ci.yml", import.meta.url)), "utf8");
  return /^ {2}quick:\n([\s\S]*?)(?=^ {2}\S)/m.exec(workflow)?.[1] ?? "";
}

test("a stage this job skips is still run by the quick job, so it cannot leave the gate", () => {
  const quick = quickJob();
  expect(quick).toContain("bun run build");
  for (const [name, command] of Object.entries(PROVEN_IN_QUICK)) {
    expect(quick).toContain(command);
    expect(PLANS[PLAN]!.some((stage) => stage.name === name)).toBe(true);
  }
});

test("the stages this job runs are the plan minus what quick proved, and none of them vanish", () => {
  const stages = planStages(PLANS[PLAN]!);
  expect(stages.map((stage) => stage.name)).not.toContain("check-skill-api");
  expect(stages.length).toBe(PLANS[PLAN]!.length - Object.keys(PROVEN_IN_QUICK).length);
  expect(stages.some((stage) => stage.name === "check-types-all")).toBe(true);
});
