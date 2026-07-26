import { describe, expect, test } from "bun:test";
import { PLANS, fixHint, formatSummary, rerunHint, runPlan, type Stage } from "./run-stages.ts";

const stage = (name: string, needs?: string[]): Stage => ({ name, command: "bun", args: [], needs });

describe("runPlan", () => {
  test("a failing stage does not stop independent stages behind it", () => {
    // The exact `&&`-chain bug: check-game-shape failing used to hide check-types-all.
    const stages = [stage("ensure-ready"), stage("check-game-shape", ["ensure-ready"]), stage("check-types-all", ["ensure-ready"])];
    const ran: string[] = [];
    const results = runPlan(stages, (candidate) => {
      ran.push(candidate.name);
      return candidate.name !== "check-game-shape";
    });
    expect(ran).toEqual(["ensure-ready", "check-game-shape", "check-types-all"]);
    expect(results.map((result) => result.state)).toEqual(["passed", "failed", "passed"]);
  });

  test("reports every failure in one run rather than only the first", () => {
    const stages = [stage("a"), stage("b"), stage("c")];
    const results = runPlan(stages, (candidate) => candidate.name === "b");
    expect(results.filter((result) => result.state === "failed").map((result) => result.name)).toEqual(["a", "c"]);
  });

  test("a stage whose prerequisite failed is skipped, not run and not passed", () => {
    const stages = [stage("build"), stage("check-types", ["build"])];
    const ran: string[] = [];
    const results = runPlan(stages, (candidate) => {
      ran.push(candidate.name);
      return false;
    });
    expect(ran).toEqual(["build"]);
    expect(results[1]).toEqual({ name: "check-types", state: "skipped", blockedBy: ["build"] });
  });

  test("skips propagate transitively so nothing downstream reads as green", () => {
    const stages = [stage("build"), stage("check-types", ["build"]), stage("report", ["check-types"])];
    const results = runPlan(stages, (candidate) => candidate.name !== "build");
    expect(results.map((result) => result.state)).toEqual(["failed", "skipped", "skipped"]);
  });

  test("an all-passing plan runs every stage", () => {
    const stages = [stage("a"), stage("b", ["a"])];
    const results = runPlan(stages, () => true);
    expect(results.every((result) => result.state === "passed")).toBe(true);
  });
});

describe("formatSummary", () => {
  test("names every failure and flags unrun stages as not known-good", () => {
    const stages = [stage("build"), stage("check-types", ["build"]), stage("test:all", ["build"])];
    const results = runPlan(stages, (candidate) => candidate.name !== "build");
    const summary = formatSummary("gate", stages, results);
    expect(summary).toContain("gate failed — 1 failed, 2 not run of 3 stages");
    expect(summary).toContain("bun run build");
    expect(summary).toContain("NOT known-good");
  });

  test("a clean run says so and lists no re-run hints", () => {
    const stages = [stage("a"), stage("b")];
    const summary = formatSummary("gate", stages, runPlan(stages, () => true));
    expect(summary).toContain("gate ok — 2 stages passed");
    expect(summary).not.toContain("re-run individually");
  });

  test("non-script stages surface their real command as the re-run hint", () => {
    expect(rerunHint(PLANS["check-types"] ?? [], "check-types-all")).toBe("bun scripts/check-types-all.ts");
    expect(rerunHint(PLANS["check-types"] ?? [], "check-game-shape")).toBe("bun run check-game-shape");
  });
});

describe("plans", () => {
  test("every `needs` names a stage declared earlier in the same plan", () => {
    for (const [name, stages] of Object.entries(PLANS)) {
      const seen = new Set<string>();
      for (const candidate of stages) {
        for (const need of candidate.needs ?? []) {
          expect(`${name}:${need}`).toBe(seen.has(need) ? `${name}:${need}` : `${name}:<undeclared ${need}>`);
        }
        seen.add(candidate.name);
      }
    }
  });

  test("gate still covers preflight, build, types and tests", () => {
    expect((PLANS.gate ?? []).map((candidate) => candidate.name)).toEqual([
      "agent:preflight",
      "build",
      "check-types",
      "test:all",
    ]);
  });

  test("a failing preflight no longer hides the type and test stages", () => {
    const stages = PLANS.gate ?? [];
    const ran: string[] = [];
    const results = runPlan(stages, (candidate) => {
      ran.push(candidate.name);
      return candidate.name !== "agent:preflight";
    });
    expect(ran).toEqual(["agent:preflight", "build", "check-types", "test:all"]);
    expect(results.filter((result) => result.state === "failed").map((result) => result.name)).toEqual([
      "agent:preflight",
    ]);
  });

  test("check-types validators are independent of each other, not chained", () => {
    const stages = PLANS["check-types"] ?? [];
    for (const candidate of stages.slice(1)) expect(candidate.needs).toEqual(["ensure-ready"]);
  });
});

describe("generated-artifact drift", () => {
  test("a drifted artifact check points at the command that regenerates it", () => {
    const stages = PLANS["check-types"] ?? [];
    // Re-running these proves the drift again; it does not fix it.
    expect(fixHint(stages, "check-capabilities")).toBe("bun run gen");
    expect(fixHint(stages, "check-skill-api")).toBe("bun run gen");
    // A genuine code failure has no "regenerate" escape hatch to offer.
    expect(fixHint(stages, "check-types-all")).toBeUndefined();
    expect(fixHint(stages, "check-game-shape")).toBeUndefined();
  });

  test("the summary surfaces the fix command once, not once per failed check", () => {
    const stages = PLANS["check-types"] ?? [];
    const results = runPlan(stages, (stage) => !["check-capabilities", "check-skill-api"].includes(stage.name));
    const summary = formatSummary("check-types", stages, results);
    expect(summary).toContain("fix drifted artifacts with:");
    expect(summary.match(/bun run gen$/gm)?.length).toBe(1);
  });

  test("the gen plan regenerates every committed artifact, barrels first", () => {
    expect((PLANS.gen ?? []).map((stage) => stage.name)).toEqual([
      "ensure-ready",
      "gen:barrels",
      "gen:capabilities",
      "gen:skill-api",
      "gen:export-manifest",
    ]);
    // The three readers all hang off barrels, so one failing generator cannot hide the others.
    for (const stage of (PLANS.gen ?? []).slice(2)) expect(stage.needs).toEqual(["gen:barrels"]);
  });
});
