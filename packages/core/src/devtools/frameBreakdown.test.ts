import { expect, test } from "bun:test";

import { attributeHitch, fpsAt, hitchCause, lightSetChange, programVariantChange, renderBreakdownText, spread, summarizeBreakdown, type FrameBreakdownRecord } from "./frameBreakdown";

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

test("reports invocation counts and does not invent a GPU cost", () => {
  const summary = summarizeBreakdown([
    frame({ gpu: null, calls: { "render:main": 3, "frame#1:sharedMember": 2 } }),
    frame({ gpu: null, calls: { "render:main": 1 } }),
  ], { objects: [], materials: [] });
  expect(summary.calls).toEqual([
    { name: "render:main", avg: 2, max: 3 },
    { name: "frame#1:sharedMember", avg: 1, max: 2 },
  ]);
  expect(renderBreakdownText(summary, "test")).toContain("cost    unavailable without GPU timing");
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
  expect(text).toContain("cost    larger CPU/GPU p50 4.00 ms");
  expect(text).toContain("not an FPS prediction");
  expect(text).toContain("70.0 ms  compile: 2 shader program(s) compiled");
  expect(fpsAt(6.94)).toBe(144);
});

test("a slow frame the loop cannot see into is named by the scripts the browser ran in it", () => {
  const timings = [
    { startTime: 1000, duration: 400, scripts: [
      { startTime: 1010, duration: 380, invoker: "MessagePort.onmessage", source: "performWorkUntilDeadline react-dom.js:120", layoutMs: 30 },
      { startTime: 1005, duration: 4, invoker: "FrameRequestCallback", source: "loop three.js:9", layoutMs: 0 },
    ] },
    { startTime: 5000, duration: 60, scripts: [{ startTime: 5000, duration: 60, invoker: "DOMWindow.onkeydown", source: "key game.js:4", layoutMs: 0 }] },
  ];
  const other = { cause: "other" as const, detail: "outside" };
  const named = attributeHitch(other, 1420, 430, timings);
  expect(named.cause).toBe("script");
  expect(named.detail).toBe("MessagePort.onmessage performWorkUntilDeadline react-dom.js:120 380 ms (forced layout 30 ms)");
  expect(named.scripts?.map((script) => script.ms)).toEqual([380, 4]);
  // A frame whose record already names a cause keeps it, with the scripts beside it.
  expect(attributeHitch({ cause: "compile", detail: "linked" }, 1420, 430, timings).cause).toBe("compile");
  // Scripts outside the frame are not its cause.
  expect(attributeHitch(other, 3000, 40, timings)).toEqual(other);
});

test("a recompiled material names the scene change that forced it", () => {
  // three's key: shader id, each define's name and value, then the scene-dependent parameters.
  // three's key: shader id, each define's name and value, the scene-dependent parameters from the
  // precision on, two flag masks, the output colour space and the custom key.
  const key = (pointLights: number, toneMapping: number, flags = [0, 0], defines = ["STANDARD", ""], custom = "jg-surface:v1:full") => [
    "physical", ...defines,
    ...Array.from({ length: 53 }, (_, index) => (index === 0 ? "highp" : index === 36 ? pointLights : index === 49 ? toneMapping : 0)),
    ...flags, "srgb", custom,
  ].join();
  expect(programVariantChange(key(3, 4), key(2, 4), 1)).toBe("point lights 3→2");
  expect(programVariantChange(key(3, 4), key(3, 0), 1)).toBe("toneMapping 4→0");
  expect(programVariantChange(key(3, 4), key(3, 4), 1)).toBeNull();
  // A parked car drawn instanced, then plain once entered; a material made double-sided.
  expect(programVariantChange(key(3, 4, [1, 0]), key(3, 4, [0, 0]), 1)).toBe("instancing on→off");
  expect(programVariantChange(key(3, 4, [0, 0]), key(3, 4, [0, 1 << 11]), 1)).toBe("doubleSided off→on");
  // A define added shifts every later field; the parameters still line up from the precision.
  expect(programVariantChange(key(3, 4), key(2, 4, [0, 0], ["STANDARD", "", "USE_TINT", "1"]), 2)).toBe("+define USE_TINT, point lights 3→2");
  // An engine patch chained onto the material's key: the segment that came or went.
  expect(programVariantChange(key(3, 4), key(3, 4, [0, 0], ["STANDARD", ""], "jg-surface:v1:off|jg-wet:v1"), 1)).toBe("custom key -jg-surface:v1:full +jg-surface:v1:off +jg-wet:v1");
});

test("a light recompile names the lights that came and went", () => {
  const lamp = "PointLight #ffaa00 8m in Vent";
  const spot = "SpotLight (shadow) #ffffff 30m in Headlamp";
  expect(lightSetChange([spot, lamp], [spot])).toBe(`-1 ${lamp}`);
  expect(lightSetChange([spot], [spot, lamp, lamp])).toBe(`+2 ${lamp}`);
  expect(lightSetChange([spot], [spot])).toBeNull();
  const many = Array.from({ length: 8 }, (_, i) => `PointLight in L${i}`);
  expect(lightSetChange([], many, 6)).toBe(`${many.slice(0, 6).map((l) => `+1 ${l}`).join("; ")}; 2 more`);
});
