import { expect, test } from "bun:test";

import { fpsAt, hitchCause, renderBreakdownText, spread, summarizeBreakdown, type FrameBreakdownRecord } from "./frameBreakdown";

function frame(overrides: Partial<FrameBreakdownRecord> = {}): FrameBreakdownRecord {
  return {
    intervalMs: 8, workMs: 3, cpu: { "render:main": 2, "sim:onTick": 1 }, gpu: { main: 3, "post:Bloom": 1 }, draws: 50, triangles: 10_000,
    compiles: 0, compileMs: 0, uploads: 0, uploadBytes: 0, uploadMs: 0, heapMb: 100, heapDropMb: 0, ...overrides,
  };
}

test("percentiles of a series", () => {
  const s = spread(Array.from({ length: 100 }, (_, i) => i + 1));
  expect([s.p50, s.p95, s.p99, s.max]).toEqual([51, 96, 100, 100]);
  expect(spread([])).toEqual({ p50: 0, p95: 0, p99: 0, max: 0, avg: 0 });
});

test("a hitch names its cause from what happened in that frame", () => {
  expect(hitchCause(frame({ intervalMs: 80, compiles: 3, compileMs: 60 })).cause).toBe("compile");
  // A program linked in an earlier frame stalls the draw that first uses it; the hitch names that draw.
  expect(hitchCause(frame({ intervalMs: 90, compileMs: 70, shaders: ["Water#3 on Lake #9"] })).detail).toBe(
    "waited on shader programs at first use, 70 ms for Water#3 on Lake #9",
  );
  expect(hitchCause(frame({ intervalMs: 50, uploads: 2, uploadBytes: 16 * 1048576, uploadMs: 20 })).cause).toBe("upload");
  expect(hitchCause(frame({ intervalMs: 45, heapDropMb: 30 })).detail).toContain("30 MB");
  expect(hitchCause(frame({ intervalMs: 40, cpu: { "frame#4 src/water.ts:9": 30 } })).detail).toBe("frame#4 src/water.ts:9 30 ms on the CPU");
  expect(hitchCause(frame({ intervalMs: 40, gpu: { "post:GTAO": 25 } })).cause).toBe("gpu");
  expect(hitchCause(frame({ intervalMs: 40 })).cause).toBe("other");
});

test("a window sums up: spreads, costliest systems and passes, per-frame draw costs, hitches", () => {
  const records = [...Array.from({ length: 98 }, () => frame()), frame({ intervalMs: 70, compiles: 2, compileMs: 40 }), frame({ gpu: null })];
  const summary = summarizeBreakdown(records, {
    objects: [{ label: "Rock", draws: 200, triangles: 400_000, cpuMs: 10, pass: "main" }, { label: "Sky", draws: 100, triangles: 200, cpuMs: 1, pass: "main" }],
    materials: [],
  }, { programs: 12 });
  expect(summary.frames).toBe(100);
  expect(summary.frame.p50).toBe(8);
  expect(summary.gpu?.p50).toBe(4);
  expect(summary.cpu.map((entry) => entry.name)).toEqual(["render:main", "sim:onTick"]);
  expect(summary.passes[0]).toEqual({ name: "main", avgMs: 3, p95Ms: 3 });
  expect(summary.objects[0]).toEqual({ label: "Rock", draws: 2, triangles: 4000, cpuMs: 0.1, pass: "main" });
  expect(summary.hitches).toEqual([{ atS: 0.85, ms: 70, cause: "compile", detail: "2 shader program(s) compiled, 40 ms" }]);
  expect(summary.counts.compiles).toBe(2);

  const text = renderBreakdownText(summary, "deepward");
  expect(text).toContain("frame   p50 8.00 ms");
  expect(text).toContain("cost    p50 4.00 ms -> 250 fps possible");
  expect(text).toContain("(144 ok)");
  expect(text).toContain("70.0 ms  compile: 2 shader program(s) compiled");
  expect(fpsAt(6.94)).toBe(144);
});
