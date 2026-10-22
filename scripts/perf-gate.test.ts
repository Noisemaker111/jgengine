import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PerfRecord } from "./perf-play";
import { PERF_GATE_GAMES, checkBudget, loadBudget, parseGateArgs, type PerfBudget } from "./perf-gate";

/**
 * The gate's verdict logic runs here without a browser: every case is a record
 * the harness could produce plus the budget it is checked against, so a
 * silently-passing gate (failed load, unattached GL hooks, missing budget file)
 * is caught by a test instead of by a review.
 */

const BUDGET: PerfBudget = { draws: 7600, triangles: 3_850_000, nodes: 11_900 };

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
  return {
    game: "harbor-heat",
    gpu: "ANGLE (NVIDIA)",
    quality: "full",
    viewport: "1600x900",
    seconds: 6,
    frame: { fps: 60, avgMs: 16.6, p95Ms: 18, maxMs: 24, samples: 360, longFrames: 0 },
    render: { draws: 7_000, triangles: 3_600_000, geometries: 300, textures: 90, nodes: 11_000, nodesSource: "scene-graph", scenes: 1, ...render },
    gl: {
      programsLinked: 0,
      framebuffers: 0,
      buffers: 0,
      textures: 0,
      vertexArrays: 0,
      allocations: 0,
      residentPrograms: 56,
      total: { buffers: 1790, textures: 101, programsLinked: 57 },
      ...gl,
    },
    sim: { avgMs: 2.6, outsideMs: 13 },
    profile: null,
    ...overrides,
  };
}

describe("checkBudget", () => {
  test("passes a game inside its budget", () => {
    expect(checkBudget(record(), BUDGET)).toEqual([]);
  });

  test("names the game, metric, measured value and budget when draws go over", () => {
    const [violation] = checkBudget(record({}, { draws: 9_100 }), BUDGET);
    expect(violation?.message).toBe("perf gate: harbor-heat draws 9,100 (budget 7,600) over by 1,500");
    expect(violation).toMatchObject({ game: "harbor-heat", metric: "draws", budget: 7600, measured: 9100 });
  });

  test("gates triangles and scene nodes too", () => {
    const messages = checkBudget(record({}, { triangles: 4_000_000, nodes: 12_500 }), BUDGET).map((entry) => entry.message);
    expect(messages).toEqual([
      "perf gate: harbor-heat triangles 4,000,000 (budget 3,850,000) over by 150,000",
      "perf gate: harbor-heat nodes 12,500 (budget 11,900) over by 600",
    ]);
  });

  test("fails on any program linked after warmup", () => {
    const [violation] = checkBudget(record({}, {}, { programsLinked: 2, allocations: 2 }), BUDGET);
    expect(violation?.message).toBe("perf gate: harbor-heat linkProgram 2 (budget 0) over by 2");
  });

  test("fails on any framebuffer created after warmup", () => {
    const [violation] = checkBudget(record({}, {}, { framebuffers: 1, allocations: 1 }), BUDGET);
    expect(violation?.message).toBe("perf gate: harbor-heat createFramebuffer 1 (budget 0) over by 1");
  });

  test("fails when the game never reached play instead of reading 0 draws as a pass", () => {
    const violations = checkBudget(record({}, { draws: 0 }), BUDGET);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("draws unavailable");
    expect(violations[0]?.message).toContain("never reached play");
  });

  test("fails when the GL counters never attached, since 0 allocations would be meaningless", () => {
    const [violation] = checkBudget(record({}, {}, { total: { buffers: 0, textures: 0 } }), BUDGET);
    expect(violation?.message).toContain("GL allocations unavailable");
    expect(violation?.message).toContain("did not attach");
  });

  test("fails when the harness cannot count scene nodes", () => {
    const [violation] = checkBudget(record({}, { nodes: null, nodesSource: "unavailable" }), BUDGET);
    expect(violation?.message).toContain("nodes unavailable");
  });
});

describe("loadBudget", () => {
  function writeEngineBudgets(root: string, budgets: unknown): void {
    writeFileSync(join(root, "scripts", "perf-budget.json"), JSON.stringify(budgets));
  }

  function writeGameBudget(root: string, game: string, budget: unknown): void {
    const dir = join(root, "Games", game);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "perf-budget.json"), JSON.stringify(budget));
  }

  test("reads the engine baseline for the named game", () => {
    const root = tempRoot();
    writeEngineBudgets(root, { "harbor-heat": { draws: 7600, triangles: 3850000, nodes: 11900 } });
    expect(loadBudget("harbor-heat", root)).toEqual({ draws: 7600, triangles: 3850000, nodes: 11900 });
  });

  test("a game's own perf-budget.json wins over the engine copy", () => {
    const root = tempRoot();
    writeEngineBudgets(root, { "harbor-heat": { draws: 7600, triangles: 3850000, nodes: 11900 } });
    writeGameBudget(root, "harbor-heat", { draws: 5000, triangles: 2_000_000, nodes: 9000 });
    expect(loadBudget("harbor-heat", root).draws).toBe(5000);
  });

  test("a missing budget fails loudly and names both places it looked", () => {
    const root = tempRoot();
    expect(() => loadBudget("harbor-heat", root)).toThrow(/no budget for "harbor-heat".*scripts[/\\]perf-budget\.json.*Games[/\\]harbor-heat[/\\]perf-budget\.json/s);
  });

  test("a game missing from the baseline fails instead of skipping the gate", () => {
    const root = tempRoot();
    writeEngineBudgets(root, { "harbor-heat": { draws: 7600, triangles: 3850000, nodes: 11900 } });
    expect(() => loadBudget("deepward", root)).toThrow(/no budget for "deepward"/);
  });

  test("a budget entry with a non-number is rejected by name", () => {
    const root = tempRoot();
    writeEngineBudgets(root, { "harbor-heat": { draws: "lots", triangles: 3850000, nodes: 11900 } });
    expect(() => loadBudget("harbor-heat", root)).toThrow(/harbor-heat\.draws/);
  });

  test("the engine baseline itself parses for every gated game", () => {
    for (const game of PERF_GATE_GAMES) {
      const budget = loadBudget(game);
      expect(budget.draws).toBeGreaterThan(0);
      expect(budget.triangles).toBeGreaterThan(0);
      expect(budget.nodes).toBeGreaterThan(0);
    }
  });
});

describe("parseGateArgs", () => {
  test("defaults to every reference game at full quality", () => {
    expect(parseGateArgs([])).toEqual({ games: [...PERF_GATE_GAMES], quality: "full", seconds: 6 });
  });

  test("narrows to named games for a local run", () => {
    expect(parseGateArgs(["--games", "harbor-heat,deepward"]).games).toEqual(["harbor-heat", "deepward"]);
  });

  test("rejects an unknown flag rather than measuring everything", () => {
    expect(() => parseGateArgs(["--games-from"])).toThrow(/unknown argument/);
  });
});
