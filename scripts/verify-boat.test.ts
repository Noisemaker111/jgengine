import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BoatCli, CliResult } from "./boat";
import type { Snapshot } from "./boat-snapshot";
import { resultLine } from "./boat-steps";
import { runSteps, type StepResult } from "./stepScheduler";
import { isLight, localReason, localTestFiles, placeSteps, remoteCommand, runPlaced, type PlaceableStep, type Where } from "./verify-boat";
import { fastSteps, type Plan } from "./verify-fast";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const step = (name: string, extra: Partial<PlaceableStep> = {}): PlaceableStep => ({ name, command: ["bun", "test", `${name}.test.ts`], ...extra });

describe("placement", () => {
  test("type-checks, gates and tests go to Linux; timing, game boots and model-reading tests stay on this PC", () => {
    expect(localReason(step("typecheck packages/core", { command: ["bun", "--cwd=packages/core", "run", "check-types"] }))).toBeNull();
    expect(localReason(step("layers", { command: ["bun", "scripts/check-layers.ts"] }))).toBeNull();
    expect(localReason(step("test 40 file(s)"))).toBeNull();
    expect(localReason(step("perf-cpu", { command: ["bun", "scripts/bench-cpu.ts"], exclusive: true }))).toBe("measures this machine");
    expect(localReason(step("provision fernwild", { command: ["bun", "games/scripts/provision-assets.ts", "fernwild"] }))).toContain("asset store");
    expect(localReason(step("boot probe fernwild", { command: ["bun", "games/scripts/capabilities-probe.ts", "fernwild"] }))).toContain("asset store");
    expect(localReason(step("test 2 file(s) on this PC", { localBecause: "depends on Windows" }))).toBe("depends on Windows");
  });

  test("a step that needs a local step stays local with it, so nothing waits across machines", () => {
    const placed = placeSteps([
      step("build", { command: ["bun", "run", "build"] }),
      step("shard i", { needs: ["build"] }),
      step("provision x", { command: ["bun", "games/scripts/provision-assets.ts", "x"] }),
      step("after provision", { needs: ["provision x"] }),
    ]);
    expect(placed.get("build")?.where).toBe("boat");
    expect(placed.get("shard i")?.where).toBe("boat");
    expect(placed.get("after provision")).toEqual({ where: "local", why: "needs provision x, which runs on this PC" });
  });

  test("test files that read downloaded models or branch on Windows are picked out by their source", () => {
    // Built from pieces, so this file's own source does not read as one of them.
    const win = ["process", "platform"].join(".");
    const sources: Record<string, string> = {
      "games/x/models.test.ts": `import { assetTest } from "../../shared/${"asset"}Test";\nassetTest("loads", () => {});`,
      "scripts/paths.test.ts": `test.skipIf(${win} !== "win32")("drive letters", () => {});`,
      "scripts/pure.test.ts": 'expect(tarExecutable("win32")).toBe("tar.exe");',
      "packages/core/src/a.test.ts": 'test("adds", () => {});',
    };
    const local = localTestFiles("/", Object.keys(sources), (path) => sources[path]!);
    expect([...local.keys()].sort()).toEqual(["games/x/models.test.ts", "scripts/paths.test.ts"]);
    expect(local.get("games/x/models.test.ts")).toContain("models");
  });

  test("fastSteps gives the local test files a step of their own, marked with why", () => {
    const plan: Plan = { changed: ["packages/core/src/a.ts"], deleted: [], typechecks: [], tests: ["games/x/models.test.ts", "packages/core/src/a.test.ts"], gates: [], fallback: [], suites: [], boots: [], inputs: {} } as unknown as Plan;
    const steps = fastSteps(plan, { localTests: new Map([["games/x/models.test.ts", "reads this PC's downloaded models (skipped in CI)"]]) });
    const local = steps.find((candidate) => candidate.name.includes("on this PC"));
    expect(local?.command).toContain("games/x/models.test.ts");
    expect(local?.localBecause).toContain("models");
    expect(steps.filter((candidate) => candidate.command.includes("packages/core/src/a.test.ts"))).toHaveLength(1);
    expect(placeSteps(steps).get(local!.name)?.where).toBe("local");
  });

  test("a few local test files take no heavy-job slot; a game boot or a bigger set does", () => {
    expect(isLight([step("a", { command: ["bun", "test", "--timeout", "20000", "a.test.ts", "b.test.ts"] })])).toBe(true);
    expect(isLight([step("a", { command: ["bun", "test", "a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts"] })])).toBe(false);
    expect(isLight([step("boot", { command: ["bun", "games/scripts/capabilities-probe.ts", "x"] })])).toBe(false);
  });

  test("the machine runs the steps with CI=1, as CI does, after the setup", () => {
    const [, , script] = remoteCommand();
    expect(script).toContain("bash setup.sh &&");
    expect(script).toContain("CI=1 bun scripts/boat-steps.ts ../steps.json");
  });
});

/** A boat that runs the remote steps by calling `remote` for each, printing what boat-steps.ts prints. */
function fakeBoat(options: { remote?: (name: string) => StepResult; refuse?: { code: string; error: string }; setupFails?: string; running?: number }) {
  const list = (n: number): CliResult => ({ status: 0, stdout: JSON.stringify({ sandboxes: Array.from({ length: n }, (_, i) => ({ id: `bx_other${i}` })) }), stderr: "" });
  let running = options.running ?? 0;
  let runs = 0;
  let now = 0;
  const cli: BoatCli = {
    limits: async () => ({ status: 0, stdout: JSON.stringify({ activeSandboxes: running, maxActiveSandboxes: 2 }), stderr: "" }),
    list: async () => list(running),
    delete: async () => ({ status: 0, stdout: "", stderr: "" }),
    sleep: async (ms) => {
      now += ms;
      running = 0;
    },
    now: () => now,
    run: async (args, onLine) => {
      runs += 1;
      if (options.refuse !== undefined) {
        onLine(JSON.stringify({ event: "error", status: 402, ...options.refuse }));
        return { status: 1 };
      }
      onLine(JSON.stringify({ event: "created", id: "bx_verify" }));
      const out = (data: string): void => onLine(JSON.stringify({ type: "stdout", data: `${data}\n` }));
      if (options.setupFails !== undefined) {
        out(`@@boat-setup-failed ${options.setupFails}`);
        onLine(JSON.stringify({ event: "summary", deleted: true, dollars: 0.001, elapsedSeconds: 20, id: "bx_verify" }));
        return { status: 70 };
      }
      out("@@boat-ready abc123");
      const plan = JSON.parse(readFileSync(join(args[args.indexOf("--push") + 1]!, "steps.json"), "utf8")) as { steps: { name: string }[] };
      let ok = true;
      for (const remote of plan.steps) {
        out(`@@boat-start ${JSON.stringify(remote.name)}`);
        const result = options.remote?.(remote.name) ?? { name: remote.name, ok: true, ms: 10, output: "" };
        ok &&= result.ok;
        out(resultLine(result));
      }
      out(`@@boat-done ${ok}`);
      onLine(JSON.stringify({ event: "summary", deleted: true, dollars: 0.0042, elapsedSeconds: 130, exitCode: ok ? 0 : 1, id: "bx_verify" }));
      return { status: ok ? 0 : 1 };
    },
  };
  return { cli, runs: () => runs, waited: () => now };
}

function harness(boat: BoatCli | null, steps: PlaceableStep[], localResult: (name: string) => StepResult = (name) => ({ name, ok: true, ms: 5, output: "" })) {
  const root = mkdtempSync(join(tmpdir(), "verify-boat-"));
  made.push(root);
  const where = new Map<string, Where>();
  const ranHere: string[] = [];
  const notes: string[] = [];
  let slots = 0;
  const snapshot = (): Snapshot => {
    const dir = join(root, "push");
    mkdirSync(dir, { recursive: true });
    return { dir, commit: "c0ffee", head: "c0ffee", base: "base", branch: "agent/x", leftOut: [], packBytes: 1e6, ms: 1 };
  };
  const run = () =>
    runPlaced({
      root,
      steps,
      jobs: 2,
      failFast: true,
      baseRef: "origin/beta",
      runLocal: async (s) => {
        ranHere.push(s.name);
        return localResult(s.name);
      },
      schedule: (group, jobs, runOne, options) => runSteps(group, jobs, runOne, options),
      onStart: () => {},
      onSettle: (result, at) => where.set(result.name, at),
      note: (line) => notes.push(line),
      boat,
      withSlot: async (work) => {
        slots += 1;
        return work();
      },
      env: {},
      snapshot,
    });
  return { run, where, ranHere, notes, slots: () => slots, root };
}

describe("runPlaced", () => {
  const steps = [
    step("typecheck core", { command: ["bun", "--cwd=packages/core", "run", "check-types"], first: true }),
    step("tests"),
    step("provision x", { command: ["bun", "games/scripts/provision-assets.ts", "x"] }),
    step("boot probe x", { command: ["bun", "games/scripts/capabilities-probe.ts", "x"], needs: ["provision x"] }),
  ];

  test("Linux steps run on the boat machine, the rest here in one slot, and the receipt names the machine and its cost", async () => {
    const boat = fakeBoat({});
    const h = harness(boat.cli, steps);
    const run = await h.run();
    expect(run.results.map((result) => result.ok)).toEqual([true, true, true, true]);
    expect(Object.fromEntries(h.where)).toEqual({ "typecheck core": "boat", tests: "boat", "provision x": "local", "boot probe x": "local" });
    expect(h.ranHere.sort()).toEqual(["boot probe x", "provision x"]);
    expect(h.slots()).toBe(1);
    expect(run.boat).toMatchObject({ status: "passed", runId: "bx_verify", costUsd: 0.0042, seconds: 130, steps: ["typecheck core", "tests"], commit: "c0ffee" });
  });

  test("a test failing on boat fails the run and stops this PC from starting more", async () => {
    const boat = fakeBoat({ remote: (name) => ({ name, ok: name !== "tests", ms: 10, output: name === "tests" ? "expect(received).toBe(expected)" : "" }) });
    const h = harness(boat.cli, steps);
    const run = await h.run();
    const tests = run.results.find((result) => result.name === "tests")!;
    expect(tests.ok).toBe(false);
    expect(tests.output).toContain("expect(received)");
    expect(run.boat.status).toBe("failed");
  });

  test("a junit report a boat test step wrote lands where a local run would have put it", async () => {
    const report = ".scratch/verify-fast/runs/x/junit/tests-1.xml";
    const boat = fakeBoat({ remote: (name) => ({ name, ok: true, ms: 10, output: "", ...(name === "tests" ? { junit: { path: report, xml: "<testsuites/>" } } : {}) }) });
    const h = harness(boat.cli, steps);
    await h.run();
    expect(readFileSync(join(h.root, report), "utf8")).toBe("<testsuites/>");
  });

  test("boat busy waits for a machine: the Linux steps never run here", async () => {
    const boat = fakeBoat({ running: 2 });
    const h = harness(boat.cli, steps);
    const run = await h.run();
    expect(boat.waited()).toBeGreaterThan(0);
    expect(h.ranHere).not.toContain("tests");
    expect(run.boat.status).toBe("passed");
    expect(h.notes.some((line) => line.includes("waiting for a machine"))).toBe(true);
  });

  test("boat unusable (out of hours) says why and runs the Linux steps here, so a landing still works", async () => {
    const boat = fakeBoat({ refuse: { code: "billing_required", error: "The included time is used and the wallet is empty" } });
    const h = harness(boat.cli, steps);
    const run = await h.run();
    expect(h.ranHere.sort()).toEqual(["boot probe x", "provision x", "tests", "typecheck core"]);
    expect(run.boat).toMatchObject({ status: "unusable", why: "The included time is used and the wallet is empty" });
    expect(run.placement.get("tests")).toEqual({ where: "local", why: "boat: The included time is used and the wallet is empty" });
    expect(h.notes.some((line) => line.includes("boat cannot be used: The included time is used"))).toBe(true);
  });

  test("a machine whose setup broke runs the unreported steps here and says why", async () => {
    const boat = fakeBoat({ setupFails: "bun install --frozen-lockfile" });
    const h = harness(boat.cli, steps);
    const run = await h.run();
    expect(h.ranHere).toContain("tests");
    expect(run.boat).toMatchObject({ status: "broken", why: "setting up the machine failed: bun install --frozen-lockfile" });
  });

  test("no boat CLI runs everything here", async () => {
    const h = harness(null, steps);
    const run = await h.run();
    expect(h.ranHere).toHaveLength(4);
    expect(run.boat.status).toBe("unusable");
  });

  test("JG_VERIFY_BOAT=0 keeps the old local path", async () => {
    const boat = fakeBoat({});
    const h = harness(boat.cli, steps);
    const run = await runPlaced({
      root: h.root,
      steps,
      jobs: 2,
      failFast: true,
      baseRef: "origin/beta",
      runLocal: async (s) => ({ name: s.name, ok: true, ms: 1, output: "" }),
      schedule: (group, jobs, runOne, options) => runSteps(group, jobs, runOne, options),
      onStart: () => {},
      onSettle: () => {},
      note: () => {},
      boat: boat.cli,
      withSlot: (work) => work(),
      env: { JG_VERIFY_BOAT: "0" },
    });
    expect(boat.runs()).toBe(0);
    expect(run.boat.status).toBe("off");
    expect(existsSync(join(h.root, "push"))).toBe(false);
  });
});
