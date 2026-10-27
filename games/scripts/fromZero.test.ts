import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { defineFlow, type Flow } from "../../packages/core/src/play/flow";
import type { ProbeReadings } from "../../packages/core/src/game/playableGame";

import { EXAMPLE_BRIEF } from "./briefExample";
import { runCli } from "./check-game-depth";
import { DEEP, courierGame, deepFromZero, demoFromZero, tenMinutesOfJobs } from "./courierFixture";
import { readDesignBrief, type DesignBrief } from "./designBrief";
import { DEPTH_BARS, depthProblems, fromZeroProblems, fromZeroShapeProblems, measureDepth, playFromZero } from "./fromZero";

function exampleBrief(): DesignBrief {
  const read = readDesignBrief(`# Courier plan\n\n${EXAMPLE_BRIEF}`);
  if (!read.ok) throw new Error(read.problems.join("\n"));
  return read.brief;
}

describe("from-zero proof", () => {
  test("a deep game played from zero for ten minutes passes both rules", async () => {
    const run = await playFromZero(deepFromZero);
    expect(run.report.ok).toBe(true);
    expect(run.playedMs).toBeGreaterThanOrEqual(DEPTH_BARS.playedMs);
    expect(run.actedAtMs).toBe(0);
    const brief = exampleBrief();
    expect(fromZeroProblems(run, brief)).toEqual([]);
    expect(depthProblems(run, brief)).toEqual([]);
    const depth = measureDepth(run, brief);
    expect(depth.systemsTouched).toEqual(["delivery", "vehicles", "jobs", "rivals"]);
    expect(depth.firstUnlockMs).toBeLessThanOrEqual(DEPTH_BARS.firstUnlockMs);
    expect(depth.unlocksPer10Minutes).toBeGreaterThanOrEqual(8);
  });

  test("a demo that hands everything out at boot fails from-zero and depth", async () => {
    const run = await playFromZero(demoFromZero);
    const brief = exampleBrief();
    expect(fromZeroProblems(run, brief)).toEqual([
      "a new game starts with itemsSeen 12, beyond the brief's second 0 (at most 1)",
      "a new game starts with unlocks 5, beyond the brief's second 0 (at most 0)",
      "nothing is taught or unlocked by 2:00 (taught and unlocks stay at their start)",
      expect.stringMatching(/^nothing new from 0:00 to 10:\d\d \(10:\d\d\); the brief's pace is something new every 2 minutes$/),
    ]);
    const depth = depthProblems(run, brief);
    expect(depth).toContain("the run touched 3 of the brief's systems (delivery, jobs, rivals); a deep game puts at least 4 in the player's hands in 10 minutes");
    expect(depth).toContain("nothing unlocked in the whole run");
    expect(depth).toContain("the game has 12 items; the brief budgets 40");
    expect(depth).toContain("the run met nothing new, so the content would last no time at its pace");
  });

  test("a short proof, or one that only waits, is not a from-zero proof", async () => {
    const run = await playFromZero(defineFlow(courierGame(DEEP), { run: async (f) => f.wait(30_000) }));
    const problems = fromZeroProblems(run, exampleBrief());
    expect(problems).toContain("the proof plays 0:30; it plays the first 10:00 through real input");
    expect(problems).toContain("the proof never acted: no key, camera turn or button command");
  });

  test("a brief that plans short cycles and little content fails depth even when the run is good", async () => {
    const run = await playFromZero(defineFlow(courierGame(DEEP), { run: tenMinutesOfJobs }));
    const read = readDesignBrief(`# Courier\n\n${EXAMPLE_BRIEF.replace("Longest cycle: 30 minutes", "Longest cycle: 2.5 minutes").replace("Minutes to see everything: 600", "Minutes to see everything: 20")}`);
    if (!read.ok) throw new Error(read.problems.join("\n"));
    expect(depthProblems(run, read.brief)).toEqual([
      "the longest real-time cycle is 2.5 minutes; a cycle shorter than a 10-minute session cannot carry hours",
      "the brief estimates 20 minutes of content; at least 180",
    ]);
  });

  test("teleports, clock scaling, dev commands and prepared states are refused", async () => {
    for (const cheat of [
      async (f: Flow<ProbeReadings>) => f.teleport({ x: 10, z: 10 }),
      async (f: Flow<ProbeReadings>) => f.timeScale(20),
      async (f: Flow<ProbeReadings>) => f.command("courier.dev.seed"),
    ]) {
      const run = await playFromZero(defineFlow(courierGame(DEEP), { run: cheat }));
      expect(run.report.ok).toBe(false);
      if (!run.report.ok) expect(run.report.failure.message).toContain("a from-zero proof plays through real input");
    }
    expect(fromZeroShapeProblems({ browser: false, state: "full-park" })).toEqual(['the from-zero proof boots capture state "full-park"; it must start a new game with no prepared state']);
  });
});

describe("games-depth check", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  /** A games folder inside the checkout: each game has a package, a plan and, optionally, a from-zero flow. */
  function games(entries: Record<string, { flow?: "deepFromZero" | "demoFromZero"; brief?: boolean }>, known?: object): string {
    const root = join(import.meta.dir, "..", "..", ".scratch", `game-depth-${process.pid}-${roots.length}`);
    roots.push(root);
    const fixture = join(import.meta.dir, "courierFixture.ts").replaceAll("\\", "/");
    for (const [game, entry] of Object.entries(entries)) {
      mkdirSync(join(root, game, "src"), { recursive: true });
      writeFileSync(join(root, game, "package.json"), JSON.stringify({ name: `@games/${game}` }));
      writeFileSync(join(root, game, "src", "game.config.ts"), "export {};\n");
      if (entry.brief !== false) writeFileSync(join(root, game, "PLAN.md"), `# ${game}\n\n${EXAMPLE_BRIEF}`);
      if (entry.flow !== undefined) {
        mkdirSync(join(root, game, "proofs", "flows"), { recursive: true });
        writeFileSync(join(root, game, "proofs", "flows", "from-zero.flow.ts"), `export { ${entry.flow} as default } from "${fixture}";\n`);
      }
    }
    if (known !== undefined) {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(join(root, "scripts", "depth-known-failing.json"), JSON.stringify(known));
    }
    return root;
  }

  test("a deep game passes; a demo or a game with no proof fails; a listed one is reported, not failed", async () => {
    const lines: string[] = [];
    expect(await runCli([], games({ deep: { flow: "deepFromZero" } }), (line) => lines.push(line))).toBe(0);
    expect(lines).toContain("game-depth: OK - deep from-zero");
    expect(lines).toContain("game-depth: OK - deep depth");

    const failing: string[] = [];
    expect(await runCli([], games({ demo: { flow: "demoFromZero" }, bare: {} }), (line) => failing.push(line))).toBe(1);
    expect(failing).toContain("game-depth: FAIL - demo from-zero: a new game starts with itemsSeen 12, beyond the brief's second 0 (at most 1)");
    expect(failing).toContain("game-depth: FAIL - bare from-zero: has no proofs/flows/from-zero.flow.ts that plays a new game through real input");

    const listed: string[] = [];
    const known = { demo: { "from-zero": "starts full", depth: "no content" }, bare: { "from-zero": "no proof", depth: "no proof" } };
    expect(await runCli(["--base", "no-such-ref"], games({ demo: { flow: "demoFromZero" }, bare: {} }, known), (line) => listed.push(line))).toBe(0);
    expect(listed.filter((line) => line.includes("KNOWN"))).toHaveLength(4);
  });

  test("a listed game that now passes fails until its entry is removed", async () => {
    const lines: string[] = [];
    const known = { deep: { depth: "was shallow" } };
    expect(await runCli(["--base", "no-such-ref"], games({ deep: { flow: "deepFromZero" } }, known), (line) => lines.push(line))).toBe(1);
    expect(lines).toContain('game-depth: FAIL - deep now passes "depth"; remove its entry from games/scripts/depth-known-failing.json (it said: was shallow)');
  });
});
