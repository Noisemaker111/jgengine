import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { PerfRecord } from "./perf-play";
import { PERF_GATE_GAMES, DEBUG_PORT_BASE, checkBudget, debugPortFor, gateVerdicts, loadBudget, parseGateArgs, type PerfBudget } from "./perf-gate";
import { frameVerdict, knownSlowAdded, parseKnownSlow, readKnownSlow, summarizeRecord, unjudgedFrameTime } from "./perf-budget";
import { FRAME_GAMES } from "./ci-scope";

/**
 * The gate's verdict logic runs here without a browser: every case is a record
 * the harness could produce plus the budget it is checked against, so a
 * silently-passing gate (failed load, unattached GL hooks, missing budget file)
 * is caught by a test instead of by a review.
 */

const BUDGET: PerfBudget = { drawsFrame: 7600 };
const REFERENCE_RUN = { gpu: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11)", viewport: "1600x900", frameClock: "uncapped" as const };

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "perf-gate-"));
  roots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  return root;
}

function record(overrides: Partial<PerfRecord> = {}, render: Partial<PerfRecord["render"]> = {}, gl: Partial<PerfRecord["gl"]> = {}): PerfRecord {
  const base: PerfRecord = {
    game: "harbor-heat",
    gpu: "ANGLE (NVIDIA)",
    quality: "high",
    viewport: "1600x900",
    seconds: 6,
    at: 1,
    frame: { fps: 60, avgMs: 16.6, p95Ms: 18, maxMs: 24, samples: 360, longFrames: 0 },
    render: { draws: 7_000, drawsFrame: 7_100, drawsFrames: 340, triangles: 3_600_000, geometries: 300, textures: 90, nodes: 11_000, nodesSource: "scene-graph", scenes: 1, ...render },
    gl: {
      programsLinked: 0,
      framebuffers: 0,
      buffers: 0,
      textures: 0,
      vertexArrays: 0,
      allocations: 0,
      residentPrograms: 56,
      total: { buffers: 1790, textures: 101, programsLinked: 57 },
      attached: true,
      ...gl,
    },
    sim: { avgMs: 2.6, outsideMs: 13 },
    profile: null,
    systems: {},
    logs: null,
    telemetry: null,
    overrides: [],
    state: null,
    params: [],
    frameClock: "capped",
  };
  return Object.assign(base, overrides);
}

describe("checkBudget", () => {
  test("passes a game inside the shared frame budget on the reference GPU", () => {
    expect(checkBudget(record({ ...REFERENCE_RUN, frame: { fps: 90, avgMs: 11, p95Ms: 14.2, maxMs: 20, samples: 500, longFrames: 0 } }), BUDGET)).toEqual([]);
  });

  test("fails a p95 frame over 16.7 ms on the reference GPU, naming the game and both numbers", () => {
    const [violation] = checkBudget(record(REFERENCE_RUN), BUDGET);
    expect(violation?.message).toBe("perf gate: harbor-heat p95 frame 18 ms (budget 16.7 ms) over by 1.3 ms");
    expect(violation?.metric).toBe("p95 frame");
  });

  test("a frame time from another GPU, viewport or a vsynced clock is printed, never judged", () => {
    expect(checkBudget(record({ ...REFERENCE_RUN, gpu: "ANGLE (Google, SwiftShader)" }), BUDGET)).toEqual([]);
    expect(checkBudget(record({ ...REFERENCE_RUN, viewport: "1920x1080" }), BUDGET)).toEqual([]);
    expect(checkBudget(record({ ...REFERENCE_RUN, frameClock: "capped" }), BUDGET)).toEqual([]);
    expect(unjudgedFrameTime(record({ ...REFERENCE_RUN, gpu: "SwiftShader" }))).toContain("not the reference");
    expect(unjudgedFrameTime(record(REFERENCE_RUN))).toBeNull();
  });

  test("draws, triangles and nodes are reported, not gated", () => {
    expect(checkBudget(record({}, { drawsFrame: 90_000, triangles: 90_000_000, nodes: 90_000 }), BUDGET)).toEqual([]);
  });

  test("fails on any program linked after warmup", () => {
    const [violation] = checkBudget(record({}, {}, { programsLinked: 2, allocations: 2 }), BUDGET);
    expect(violation?.message).toBe("perf gate: harbor-heat linkProgram 2 (budget 0) over by 2");
  });

  test("fails on any framebuffer created after warmup", () => {
    const [violation] = checkBudget(record({}, {}, { framebuffers: 1, allocations: 1 }), BUDGET);
    expect(violation?.message).toBe("perf gate: harbor-heat createFramebuffer 1 (budget 0) over by 1");
  });

  test("fails when the game never reached play instead of reading 0 draws as a fast frame", () => {
    const violations = checkBudget(record(REFERENCE_RUN, { draws: 0 }), BUDGET);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("never reached play");
  });

  test("fails when the window measured no frames", () => {
    const [violation] = checkBudget(record({ frame: { fps: 0, avgMs: 0, p95Ms: 0, maxMs: 0, samples: 0, longFrames: 0 } }), BUDGET);
    expect(violation?.message).toContain("p95 frame unavailable");
  });

  test("a report still inside its warmup cannot be judged on post-warmup GL counts", () => {
    const warming = record({
      telemetry: { source: "in-page", warmedUp: false, ageMs: 1_900, buildMs: 0.7, heapBytes: null },
    }, {}, { programsLinked: 3, framebuffers: 1, allocations: 4 });
    expect(checkBudget(warming, BUDGET)).toEqual([]);
    const warmed = record({
      telemetry: { source: "in-page", warmedUp: true, ageMs: 9_000, buildMs: 0.7, heapBytes: null },
    }, {}, { programsLinked: 3, framebuffers: 1, allocations: 4 });
    expect(checkBudget(warmed, BUDGET).map((entry) => entry.metric)).toEqual(["linkProgram", "createFramebuffer"]);
  });

  test("fails when the GL counters never attached, since 0 allocations would be meaningless", () => {
    const [violation] = checkBudget(record({}, {}, { attached: false, total: { buffers: 0, textures: 0 } }), BUDGET);
    expect(violation?.message).toContain("GL allocations unavailable");
  });
});

describe("the known-slow list", () => {
  const known = parseKnownSlow(JSON.stringify({ $comment: "shrink only", "harbor-heat": "15 fps" }));

  test("a listed game over budget is known; inside it, its entry is stale; unlisted and over, it fails", () => {
    const slow = record(REFERENCE_RUN);
    expect(frameVerdict("harbor-heat", checkBudget(slow, BUDGET), slow, known)).toBe("known");
    const fast = record({ ...REFERENCE_RUN, frame: { fps: 90, avgMs: 11, p95Ms: 12, maxMs: 15, samples: 500, longFrames: 0 } });
    expect(frameVerdict("harbor-heat", checkBudget(fast, BUDGET), fast, known)).toBe("stale");
    expect(frameVerdict("deepward", checkBudget(slow, BUDGET), slow, known)).toBe("fail");
    expect(frameVerdict("deepward", checkBudget(fast, BUDGET), fast, known)).toBe("pass");
    const elsewhere = record({ ...REFERENCE_RUN, gpu: "SwiftShader" });
    expect(frameVerdict("harbor-heat", checkBudget(elsewhere, BUDGET), elsewhere, known)).toBe("unjudged");
  });

  test("only shrinks: an entry the base branch lacks is a failure", () => {
    const grown = parseKnownSlow(JSON.stringify({ "harbor-heat": "15 fps", deepward: "slow" }));
    expect(knownSlowAdded(grown, known)).toEqual([expect.stringContaining("deepward was added")]);
    expect(knownSlowAdded(known, grown)).toEqual([]);
    expect(knownSlowAdded(grown, null)).toEqual([]);
  });

  test("the committed list names only gated games, each with a reason", () => {
    for (const [game, reason] of readKnownSlow()) {
      expect(PERF_GATE_GAMES.some((gated) => gated === game)).toBe(true);
      expect(reason.length).toBeGreaterThan(0);
    }
  });
});

describe("loadBudget", () => {
  function writeEngineBudgets(root: string, budgets: unknown): void {
    writeFileSync(join(root, "scripts", "perf-budget.json"), JSON.stringify(budgets));
  }

  function writeGameBudget(root: string, game: string, budget: unknown): void {
    const dir = join(root, "games", game);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "perf-budget.json"), JSON.stringify(budget));
  }

  test("reads the engine baseline for the named game and names that file", () => {
    const root = tempRoot();
    writeEngineBudgets(root, { "harbor-heat": { drawsFrame: 7600 } });
    expect(loadBudget("harbor-heat", root)).toEqual({ budget: { drawsFrame: 7600 }, source: "scripts/perf-budget.json" });
  });

  test("a game's own perf-budget.json wins over the engine copy, and the gate reports that path", () => {
    const root = tempRoot();
    writeEngineBudgets(root, { "harbor-heat": { drawsFrame: 7600 } });
    writeGameBudget(root, "harbor-heat", { drawsFrame: 5000, programsLinked: 2 });
    const loaded = loadBudget("harbor-heat", root);
    expect(loaded.budget).toEqual({ drawsFrame: 5000, programsLinked: 2 });
    expect(loaded.source).toBe("games/harbor-heat/perf-budget.json");
  });

  test("an old count ceiling is refused by name, so a stale file never reads as a budget", () => {
    const root = tempRoot();
    writeGameBudget(root, "harbor-heat", { drawsFrame: 5000, triangles: 2_000_000, nodes: 9000 });
    expect(() => loadBudget("harbor-heat", root)).toThrow(/has triangles, nodes/);
  });

  test("a missing budget fails loudly and names both places it looked", () => {
    const root = tempRoot();
    expect(() => loadBudget("harbor-heat", root)).toThrow(/no budget for "harbor-heat"/);
  });

  test("a game missing from the baseline fails instead of skipping the gate", () => {
    const root = tempRoot();
    writeEngineBudgets(root, { "harbor-heat": {} });
    expect(() => loadBudget("deepward", root)).toThrow(/no budget for "deepward"/);
  });

  test("a budget entry with a non-number is rejected by name", () => {
    const root = tempRoot();
    writeEngineBudgets(root, { "harbor-heat": { drawsFrame: "lots" } });
    expect(() => loadBudget("harbor-heat", root)).toThrow(/harbor-heat\.drawsFrame/);
  });

  test("the committed budgets parse for every gated game", () => {
    for (const game of PERF_GATE_GAMES) expect(loadBudget(game).budget).toBeDefined();
  });
});

describe("parseGateArgs", () => {
  test("defaults to every reference game at each game's own tier, one at a time so no two share the GPU", () => {
    expect(parseGateArgs([])).toEqual({ games: [...PERF_GATE_GAMES], draft: false, seconds: 6, jobs: 1 });
  });

  test("pins one tier for every game, and reads it back into the argument table", () => {
    expect(parseGateArgs(["--quality", "ultra"]).quality).toBe("ultra");
    const drafted = parseGateArgs(["--draft"]);
    expect(drafted.draft).toBe(true);
    expect(drafted.quality).toBeUndefined();
    expect(() => parseGateArgs(["--quality", "highish"])).toThrow("--quality must be one of low, medium, high, ultra");
    expect(() => parseGateArgs(["--draft", "--quality", "low"])).toThrow("--draft measures the low tier at half viewport");
  });

  test("narrows to named games for a local run", () => {
    expect(parseGateArgs(["--games", "harbor-heat,deepward"]).games).toEqual(["harbor-heat", "deepward"]);
  });

  test("takes the number of games to measure at once", () => {
    expect(parseGateArgs(["--jobs", "8"]).jobs).toBe(8);
    expect(parseGateArgs(["--jobs", "1"]).jobs).toBe(1);
  });

  test("refuses a job count that is not a whole number of games, instead of measuring one at a time", () => {
    for (const value of ["0", "-2", "2.5", "many"]) {
      expect(() => parseGateArgs(["--jobs", value])).toThrow(/--jobs must be a whole number of games at least 1/);
    }
  });

  test("rejects an unknown flag rather than measuring everything", () => {
    expect(() => parseGateArgs(["--games-from"])).toThrow(/unknown argument/);
  });

  test("refuses a setting override by name, since a budget describes the default build", () => {
    expect(() => parseGateArgs(["--games", "harbor-heat", "--set", "colorblind=grayscale"])).toThrow(
      /--set measures a setting on top of the defaults; budgets describe the default build/,
    );
  });
});

describe("debugPortFor", () => {
  test("gives every game in a run its own browser, never one shared by two", () => {
    const ports = PERF_GATE_GAMES.map((_game, index) => debugPortFor(index));
    expect(new Set(ports).size).toBe(ports.length);
    expect(ports).toEqual(PERF_GATE_GAMES.map((_game, index) => DEBUG_PORT_BASE + index));
  });

  test("stays outside the band a capture's pickDebugPort and warm Chrome use, so two runs cannot attach to each other", () => {
    for (let index = 0; index < PERF_GATE_GAMES.length; index += 1) {
      const port = debugPortFor(index);
      expect(port).toBeGreaterThanOrEqual(9900);
      expect(DEBUG_PORT_BASE).toBeGreaterThan(9899);
    }
  });
});

describe("ci matrix", () => {
  const workflow = readFileSync(fileURLToPath(new URL("../.github/workflows/ci.yml", import.meta.url)), "utf8");

  test("frame budgets are measured on the lane's machine, never on a CI runner", () => {
    expect(workflow).not.toContain("perf:gate");
    // `scripts/ci-scope.ts` cannot import this list: the `changes` job runs it with no node_modules.
    expect([...FRAME_GAMES]).toEqual([...PERF_GATE_GAMES]);
  });
});

describe("gateVerdicts", () => {
  test("a game over its budget fails alone while its neighbours are still reported inside budget", () => {
    const over = checkBudget(record({ ...REFERENCE_RUN, game: "harbor-heat" }), BUDGET);
    const inside = checkBudget(record({ game: "deepward" }), BUDGET);
    const { failures, lines } = gateVerdicts([
      { game: "harbor-heat", summary: null, violations: over.map((entry) => entry.message), error: null },
      { game: "deepward", summary: "deepward ok", violations: inside.map((entry) => entry.message), error: null },
    ]);
    expect(failures).toEqual(["perf gate: harbor-heat p95 frame 18 ms (budget 16.7 ms) over by 1.3 ms"]);
    expect(lines).toEqual(["deepward ok"]);
  });

  test("a game that could not be measured is a failure of its own, not a quiet pass", () => {
    const { failures, lines } = gateVerdicts([
      { game: "harbor-heat", summary: null, violations: [], error: "perf gate: harbor-heat could not be measured — boom" },
    ]);
    expect(failures).toEqual(["perf gate: harbor-heat could not be measured — boom"]);
    expect(lines).toEqual([]);
  });
});

describe("summarizeRecord", () => {
  test("a passing line leads with the frame time and prints draws beside the baseline", () => {
    expect(summarizeRecord(record(REFERENCE_RUN), BUDGET)).toBe(
      "harbor-heat ok  p95 18 ms/16.7 ms (60 fps)  drawsFrame 7,100 (baseline 7,600)  links 0/0  framebuffers 0/0  1600x900 high",
    );
    expect(summarizeRecord(record(), BUDGET)).toContain("(60 fps) not judged");
  });

  test("a run with an override names it, so the line is reproducible as printed", () => {
    expect(summarizeRecord(record({ overrides: ["accessibility.colorblind=grayscale"] }), BUDGET)).toEndWith(
      "overrides accessibility.colorblind=grayscale",
    );
  });
});

