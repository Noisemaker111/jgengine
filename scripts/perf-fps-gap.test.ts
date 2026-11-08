import { expect, test } from "bun:test";
import { join, resolve } from "node:path";

import type { FrameBreakdownSummary } from "../packages/core/src/devtools/frameBreakdown";
import type { PerfRecord } from "./perf-play";
import {
  cpuGroupOf,
  FPS_GAP_BUDGET_MS,
  frameCost,
  gcPer8s,
  groupCosts,
  parseFpsGapArgs,
  profileLayerOf,
  profileLayers,
  recordsFor,
  renderBackendComparison,
  renderFpsGapReport,
  shortName,
  workItems,
  type FpsGapEntry,
} from "./perf-fps-gap";

const spread = (p50: number, avg = p50) => ({ p50, p95: p50 * 1.4, p99: p50 * 1.8, max: p50 * 3, avg });

function breakdown(overrides: Partial<FrameBreakdownSummary> = {}): FrameBreakdownSummary {
  return {
    frames: 400,
    seconds: 8,
    frame: spread(12, 12),
    work: spread(9, 9),
    gpu: spread(6, 6),
    cpu: [
      { name: "render:post:BeautyPass", avgMs: 5, p95Ms: 7 },
      { name: "render:shadow", avgMs: 1, p95Ms: 2 },
      { name: "render:post:UnrealBloomPass", avgMs: 0.5, p95Ms: 0.6 },
      { name: "sim:onTick", avgMs: 0.7, p95Ms: 1 },
      { name: "frame#4 packages/core/src/visibility/CullingProvider.draw.tsx:78", avgMs: 1.2, p95Ms: 1.6 },
      { name: "frame#9 packages/core/src/anim/useFootIk.draw.ts:40", avgMs: 0.1, p95Ms: 0.2 },
    ],
    passes: [
      { name: "post:BeautyPass", avgMs: 4, p95Ms: 6 },
      { name: "shadow", avgMs: 1, p95Ms: 2 },
      { name: "post:UnrealBloomPass", avgMs: 0.6, p95Ms: 1 },
    ],
    counts: { drawsAvg: 300, drawsMax: 400, trianglesAvg: 200_000, trianglesMax: 250_000, programs: 80, compiles: 0, compileMs: 0, uploads: 0, uploadMb: 0, heapMb: 300, gcMb: 120 },
    objects: [],
    materials: [],
    hitches: [{ atS: 1, ms: 40, cause: "gc", detail: "garbage collection freed ~20 MB" }],
    ...overrides,
  };
}

function entry(game: string, summary: FrameBreakdownSummary | null): FpsGapEntry {
  const record = {
    game,
    gpu: "ANGLE (NVIDIA GeForce RTX 3070 Direct3D11)",
    quality: "high",
    viewport: "1600x900",
    frameClock: "uncapped",
    path: "walk",
    frame: { fps: 80, avgMs: 12, p95Ms: 16, maxMs: 30, samples: 600, longFrames: 1 },
    render: { draws: 300, drawsFrame: 320, drawsFrames: 600, triangles: 200_000, geometries: 10, textures: 10, nodes: 5000, nodesSource: "scene-graph", scenes: 1 },
    breakdown: summary,
  } as unknown as PerfRecord; // type-escape: a test record carries only the fields the report reads
  return { record, layers: [{ layer: "three.js", pct: 30 }], allocators: [{ fn: "updateMatrixWorld", at: "three.module.js:1:1", mbPerSecond: 12 }] };
}

test("the budget is one frame at 360 Hz", () => {
  expect(FPS_GAP_BUDGET_MS).toBeCloseTo(2.778, 3);
});

test("CPU rows group into engine-level work by what they run", () => {
  expect(cpuGroupOf("render:post:BeautyPass")).toBe("scene submission (three.js traversal, sort, draw calls)");
  expect(cpuGroupOf("render:main")).toBe("scene submission (three.js traversal, sort, draw calls)");
  expect(cpuGroupOf("render:shadow")).toBe("shadow map submission");
  expect(cpuGroupOf("render:post:OverlayAwareGTAOPass")).toBe("post-processing CPU");
  expect(cpuGroupOf("sim:onTick")).toBe("60 Hz sim tick");
  expect(cpuGroupOf("frame#4 packages/core/src/visibility/CullingProvider.draw.tsx:78")).toBe("culling, instancing and LOD");
  expect(cpuGroupOf("frame#208:sharedFrameTasks packages/core/src/render/useSharedFrame.draw.ts:38")).toBe("shared frame tasks (useSharedFrame members)");
  expect(cpuGroupOf("frame#9 packages/core/src/anim/useFootIk.draw.ts:40")).toBe("skinned animation and foot IK");
  expect(cpuGroupOf("frame#12 games/harbor-heat/src/game/Boats.draw.tsx:10")).toBe("game frame callbacks");
  expect(cpuGroupOf("frame#13")).toBe("frame callbacks (source unresolved)");
});

test("a game's groups add up to its frame: named rows, untimed work, and the time between frames", () => {
  const { cpu, gpu } = groupCosts(breakdown());
  const total = [...cpu.values()].reduce((sum, ms) => sum + ms, 0);
  expect(total).toBeCloseTo(12, 6);
  expect(cpu.get("untimed work inside the frame (r3f loop, React effects)")).toBeCloseTo(0.5, 6);
  expect(cpu.get("between frames (GPU wait, compositing, React commits, GC)")).toBeCloseTo(3, 6);
  expect(gpu.get("scene raster (GPU)")).toBe(4);
  expect(gpu.get("post-processing GPU")).toBe(0.6);
});

test("work items rank by games blocked, then by total ms", () => {
  const items = workItems([
    entry("a", breakdown()),
    entry("b", breakdown({ cpu: [{ name: "render:main", avgMs: 2, p95Ms: 3 }, { name: "render:shadow", avgMs: 0.1, p95Ms: 0.1 }] })),
  ]);
  const scene = items.find((item) => item.group.startsWith("scene submission") && item.side === "CPU");
  expect(scene?.blocks).toEqual(["a", "b"]);
  expect(scene?.totalMs).toBeCloseTo(7, 6);
  const shadow = items.find((item) => item.group === "shadow map submission");
  expect(shadow?.blocks).toEqual(["a"]);
  const blocked = items.map((item) => item.blocks.length);
  expect([...blocked].sort((x, y) => y - x)).toEqual(blocked);
  expect(items.find((item) => item.side === "GC")?.perGame.get("a")).toBe(120);
});

test("cost is the larger of CPU and GPU, and garbage scales to 8 s", () => {
  expect(frameCost(breakdown())).toEqual({ ms: 9, bound: "CPU" });
  expect(frameCost(breakdown({ gpu: spread(11) }))).toEqual({ ms: 11, bound: "GPU" });
  expect(gcPer8s({ counts: breakdown().counts, seconds: 4 })).toBe(240);
});

test("profile samples group into layers by script", () => {
  const node = (functionName: string, url: string) => ({ callFrame: { functionName, url, lineNumber: 0, columnNumber: 0 } });
  expect(profileLayerOf(node("(garbage collector)", ""))).toBe("garbage collection");
  expect(profileLayerOf(node("(program)", ""))).toBe("browser (layout, paint, compositing, GPU process)");
  expect(profileLayerOf(node("uniformMatrix4fv", ""))).toBe("native calls (WebGL and DOM)");
  expect(profileLayerOf(node("projectObject", "http://127.0.0.1:4601/node_modules/.vite/deps/three.module-B4NrmTkk.js?v=1"))).toBe("three.js");
  expect(profileLayerOf(node("commitRoot", "http://127.0.0.1:4601/node_modules/.vite/deps/react-dom_client.js?v=1"))).toBe("React");
  expect(profileLayerOf(node("loop", "http://127.0.0.1:4601/node_modules/.vite/deps/@react-three_fiber.js?v=1"))).toBe("react-three-fiber");
  expect(profileLayerOf(node("tick", "http://127.0.0.1:4601/@fs/C:/repo/packages/core/src/runtime/simLoop.ts"))).toBe("engine code");
  expect(profileLayerOf(node("boat", "http://127.0.0.1:4601/@fs/C:/repo/games/harbor-heat/src/game/boat.ts"))).toBe("game code");
  const layers = profileLayers({
    nodes: [
      { id: 1, callFrame: { functionName: "(garbage collector)", url: "", lineNumber: 0, columnNumber: 0 } },
      { id: 2, callFrame: { functionName: "projectObject", url: "/node_modules/.vite/deps/three.module.js", lineNumber: 0, columnNumber: 0 } },
    ],
    samples: [1, 2, 2, 2],
    timeDeltas: [100, 100, 100, 100],
  });
  expect(layers).toEqual([{ layer: "three.js", pct: 75 }, { layer: "garbage collection", pct: 25 }]);
});

test("row names shorten to the file and the shared-task name", () => {
  expect(shortName("frame#208:sharedFrameTasks packages/core/src/render/useSharedFrame.draw.ts:38")).toBe("render/useSharedFrame.draw.ts (sharedFrameTasks)");
  expect(shortName("frame#4 packages/core/src/visibility/CullingProvider.draw.tsx:78 | members")).toBe("visibility/CullingProvider.draw.tsx");
  expect(shortName("render:shadow")).toBe("render:shadow");
});

test("the report prints every game against the budget, in text or Markdown", () => {
  const entries = [entry("harbor-heat", breakdown()), entry("deepward", null)];
  for (const each of entries) each.record.engine = { package: "@jgengine/core", version: "0.53.0", commit: "abc123def456", dirty: false, path: "/repo/" };
  const text = renderFpsGapReport(entries, { markdown: false });
  expect(text).toContain("2.78 ms frame (360 fps)");
  expect(text, "the engine the records were measured on, once").toContain("engine abc123def.");
  expect(text).toMatch(/harbor-heat\s+12\.00\s+16\.80\s+21\.60\s+9\.00\s+6\.00\s+CPU\s+3\.2x\s+111\s/);
  expect(text).toContain("deepward");
  expect(text).toContain("scene submission (three.js traversal, sort, draw calls)");
  const markdown = renderFpsGapReport(entries, { markdown: true });
  expect(markdown).toContain("| game | frame p50 |");
  expect(markdown).toContain("| --- |");
});

test("arguments default to every playable game and refuse unknown flags", () => {
  const parsed = parseFpsGapArgs([]);
  if (parsed === "help") throw new Error("expected a run");
  expect(parsed.games.length).toBeGreaterThan(0);
  expect(parsed.seconds).toBe(8);
  expect(parseFpsGapArgs(["--games", "deepward,harbor-heat", "--markdown", "--reuse"])).toMatchObject({ games: ["deepward", "harbor-heat"], markdown: true, reuse: true });
  expect(parseFpsGapArgs(["-h"])).toBe("help");
  expect(() => parseFpsGapArgs(["--budget", "3"])).toThrow("unknown argument --budget");
  expect(() => parseFpsGapArgs(["--seconds", "0"])).toThrow("--seconds must be a positive number");
});

test("--renderer picks the backends, WebGL first when both", () => {
  expect(parseFpsGapArgs([])).toMatchObject({ renderers: ["webgl"] });
  expect(parseFpsGapArgs(["--renderer", "webgpu"])).toMatchObject({ renderers: ["webgpu"] });
  expect(parseFpsGapArgs(["--renderer", "both"])).toMatchObject({ renderers: ["webgl", "webgpu"] });
  expect(() => parseFpsGapArgs(["--renderer", "vulkan"])).toThrow("--renderer must be webgl, webgpu or both");
  const root = resolve("records");
  expect(recordsFor(root, "webgl")).toBe(root);
  expect(recordsFor(root, "webgpu")).toBe(join(root, "webgpu"));
});

test("the backend table puts each game's frame times side by side and names a run that fell back", () => {
  const webgl = entry("harbor-heat", breakdown({ frame: spread(4, 4) }));
  const webgpu = entry("harbor-heat", breakdown({ frame: spread(3, 3) }));
  webgpu.record.backend = { drawing: "webgpu", warnings: ["draw mode 6 (LINE_LOOP / TRIANGLE_FAN) is not drawn"] };
  const fellBack = entry("deepward", breakdown());
  fellBack.record.backend = { drawing: "webgl", warnings: [] };
  const table = renderBackendComparison(new Map([["webgl", [webgl, entry("deepward", breakdown())]], ["webgpu", [webgpu, fellBack]]]), { markdown: true });
  expect(table).toContain("| game | webgl p50 | webgl p99 | webgpu p50 | webgpu p99 | p50 change | notes |");
  expect(table).toContain("| harbor-heat | 4.00 | 7.20 | 3.00 | 5.40 | -25% | webgpu: 1 warnings |");
  expect(table).toContain("webgpu run drew with webgl");
});

test("a backend run with WebGPU errors is named not comparable and kept out of the change column", () => {
  const webgl = entry("odd-orbit", breakdown({ frame: spread(4, 4) }));
  const webgpu = entry("odd-orbit", breakdown({ frame: spread(2, 2) }));
  webgpu.record.backend = { drawing: "webgpu", warnings: ["draw mode 6 (LINE_LOOP / TRIANGLE_FAN) is not drawn", "WebGPU: [Buffer] usage (BufferUsage::CopySrc) does not include BufferUsage::QueryResolve."] };
  const table = renderBackendComparison(new Map([["webgl", [webgl]], ["webgpu", [webgpu]]]), { markdown: true });
  expect(table).toContain("| odd-orbit | 4.00 | 7.20 | 2.00 | 3.60 | - | webgpu: 1 WebGPU errors, GPU work dropped, not comparable; webgpu: 1 warnings |");
});
