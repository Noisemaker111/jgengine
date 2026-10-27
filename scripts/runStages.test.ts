import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import {
  ALL_CHECKS, CHECKS, checkPlan, fixHint, formatSummary, GEN_TARGETS, genPlan, jobChecks, parseCheckArgs, rerunHint, runPlan,
  SDK_CHECKS, type Stage,
} from "./run-stages.ts";

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
    expect(summary).toContain("bun run check build");
    expect(summary).toContain("NOT known-good");
  });

  test("a clean run says so and lists no re-run hints", () => {
    const stages = [stage("a"), stage("b")];
    const summary = formatSummary("gate", stages, runPlan(stages, () => true));
    expect(summary).toContain("gate ok — 2 stages passed");
    expect(summary).not.toContain("re-run individually");
  });

  test("a check's re-run hint is the one command that runs it alone", () => {
    const stages = checkPlan(jobChecks("types"), false);
    expect(rerunHint(stages, "types")).toBe("bun run check types");
    expect(rerunHint(stages, "content-gate")).toBe("bun run check content-gate");
    expect(rerunHint(stages, "ensure-ready")).toBe("bun scripts/ensure-ready.ts --install-only");
  });
});

describe("the check table", () => {
  test("every check is named once and its script is a file in the repo", () => {
    const names = CHECKS.map((check) => check.name);
    expect(new Set(names).size).toBe(names.length);
    const root = fileURLToPath(new URL("..", import.meta.url));
    for (const check of CHECKS) expect(`${check.name}:${existsSync(join(root, check.script))}`).toBe(`${check.name}:true`);
  });

  test("every plan's `needs` names a stage declared earlier in it", () => {
    const plans = [checkPlan(ALL_CHECKS, true), checkPlan(SDK_CHECKS, true), checkPlan(jobChecks("quick"), true), genPlan(GEN_TARGETS)];
    for (const stages of plans) {
      const seen = new Set<string>();
      for (const candidate of stages) {
        for (const need of candidate.needs ?? []) expect(seen.has(need) ? need : `<undeclared ${need}>`).toBe(need);
        seen.add(candidate.name);
      }
    }
  });

  test("checks are independent of each other, so one failure hides none of the rest", () => {
    const stages = checkPlan(ALL_CHECKS, true);
    for (const candidate of stages.filter((stage) => stage.name !== "ensure-ready" && stage.name !== "build")) {
      expect(candidate.needs?.every((need) => need === "ensure-ready" || need === "build")).toBe(true);
    }
    const results = runPlan(stages, (stage) => stage.name !== "skills");
    expect(results.find((result) => result.name === "skills")?.state).toBe("failed");
    expect(results.find((result) => result.name === "types")?.state).toBe("passed");
  });

  test("only the checks that read `dist` wait for the build", () => {
    const stages = checkPlan(ALL_CHECKS, true);
    const afterBuild = stages.filter((stage) => stage.needs?.includes("build")).map((stage) => stage.name);
    expect(afterBuild.sort()).toEqual(CHECKS.filter((check) => check.needsBuild === true && check.named !== true).map((check) => check.name).sort());
    expect(checkPlan(jobChecks("types"), false).some((stage) => stage.name === "build")).toBe(false);
  });

  test("the SDK plan is the types job without the game checks CI already ran", () => {
    const sdk = SDK_CHECKS.map((check) => check.name);
    for (const name of ["module-globals", "game-determinism", "game-front-end", "game-feel", "art-direction"]) {
      expect(jobChecks("types").some((check) => check.name === name)).toBe(true);
      expect(sdk).not.toContain(name);
    }
    expect(sdk).toContain("types");
    expect(sdk).toContain("skill-api");
  });

  test("an SDK prerequisite failure leaves every check skipped, never green", () => {
    const stages = checkPlan(SDK_CHECKS, true);
    const results = runPlan(stages, (stage) => stage.name !== "ensure-ready");
    expect(results.slice(1).every((result) => result.state === "skipped")).toBe(true);
    expect(formatSummary("check --sdk", stages, results)).toContain("NOT known-good");
  });
});

describe("generated-artifact drift", () => {
  test("a drifted artifact check points at `bun run gen`; a code failure offers no regenerate", () => {
    const stages = checkPlan(jobChecks("types"), false);
    expect(fixHint(stages, "capabilities")).toBe("bun run gen");
    expect(fixHint(stages, "skill-api")).toBe("bun run gen");
    expect(fixHint(stages, "types")).toBeUndefined();
    expect(fixHint(stages, "recipes")).toBeUndefined();
  });

  test("the summary surfaces the fix command once, not once per failed check", () => {
    const stages = checkPlan(jobChecks("types"), false);
    const results = runPlan(stages, (stage) => !["capabilities", "skill-api"].includes(stage.name));
    const summary = formatSummary("check", stages, results);
    expect(summary).toContain("fix drifted artifacts with:");
    expect(summary.match(/bun run gen$/gm)?.length).toBe(1);
  });

  test("gen regenerates every committed artifact, routing before barrels before their readers", () => {
    const stages = genPlan(GEN_TARGETS);
    expect(stages.map((stage) => stage.name)).toEqual([
      "ensure-ready", "source-paths", "skill-routing", "barrels", "capabilities", "skill-api", "export-manifest", "games-ledger",
      "type-escapes",
    ]);
    expect(stages[3]!.needs).toEqual(["ensure-ready", "skill-routing"]);
    for (const stage of stages.slice(4)) expect(stage.needs).toEqual(["ensure-ready", "barrels"]);
    expect(rerunHint(stages, "barrels")).toBe("bun run gen barrels");
  });
});

describe("parseCheckArgs", () => {
  test("no names runs every check with the build in front", () => {
    const request = parseCheckArgs([]);
    expect(request.kind).toBe("plan");
    if (request.kind !== "plan") return;
    expect(request.stages.map((stage) => stage.name).slice(0, 2)).toEqual(["ensure-ready", "build"]);
    expect(request.stages.length).toBe(ALL_CHECKS.length + 2);
  });

  test("several check names run as one plan; one name keeps its own flags", () => {
    const many = parseCheckArgs(["skills", "changelog"]);
    expect(many.kind === "plan" ? many.stages.map((stage) => stage.name) : many.kind).toEqual(["ensure-ready", "skills", "changelog"]);
    const one = parseCheckArgs(["concept-homes", "--base", "origin/beta"]);
    expect(one.kind === "single" ? [one.check.name, ...one.args] : one.kind).toEqual(["concept-homes", "--base", "origin/beta"]);
  });

  test("an unknown name, or --sdk with anything else, is refused", () => {
    expect(parseCheckArgs(["nope"]).kind).toBe("error");
    expect(parseCheckArgs(["--sdk", "skills"]).kind).toBe("error");
    expect(parseCheckArgs(["--sdk"]).kind).toBe("plan");
    expect(parseCheckArgs(["--list"]).kind).toBe("list");
  });
});
