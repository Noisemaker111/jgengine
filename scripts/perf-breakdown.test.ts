import { expect, test } from "bun:test";
import { summarizeBreakdown, type FrameBreakdownRecord } from "../packages/core/src/devtools/frameBreakdown";
import { compareBreakdowns, readBreakdown } from "./perf-breakdown";

test("comparison does not turn missing GPU samples into zero", () => {
  const frame: FrameBreakdownRecord = { intervalMs: 10, workMs: 5, cpu: {}, gpu: null, draws: 0, triangles: 0, compiles: 0, compileMs: 0, uploads: 0, uploadBytes: 0, uploadMs: 0, heapMb: null, heapDropMb: 0 };
  const missing = summarizeBreakdown([frame], { objects: [], materials: [] });
  const present = summarizeBreakdown([{ ...frame, gpu: { main: 2 } }], { objects: [], materials: [] });
  const text = compareBreakdowns(missing, present);
  expect(text).toContain("gpu            unavailable in one or both runs");
  expect(text).toContain("cost p50       unavailable without GPU timings");
  expect(text).not.toContain("cost p50 allows");
});

test("work counts resolve the owning shared callback source through the profiler", async () => {
  const frame: FrameBreakdownRecord = { intervalMs: 10, workMs: 5, cpu: { "frame#1:sharedMember": 2 }, calls: { "frame#1:sharedMember | fauna ground queries": 12 }, gpu: null, draws: 0, triangles: 0, compiles: 0, compileMs: 0, uploads: 0, uploadBytes: 0, uploadMs: 0, heapMb: null, heapDropMb: 0 };
  const summary = summarizeBreakdown([frame], { objects: [], materials: [] });
  let onScript: (params: Record<string, unknown>) => void = () => {};
  let lookups = 0;
  const session = {
    evaluate: async (expression: string) => expression.startsWith("fetch(") ? JSON.stringify({ version: 3, sources: ["packages/core/src/ambientFauna/AmbientFauna.draw.tsx"], names: [], mappings: `${";".repeat(30)}AAAA` }) : summary,
    on: (_event: string, callback: typeof onScript) => { onScript = callback; return () => {}; },
    send: async (method: string, params?: Record<string, unknown>) => {
      if (method === "Debugger.enable") onScript({ scriptId: "42", url: "http://localhost/packages/core/src/ambientFauna/AmbientFauna.draw.tsx", sourceMapURL: "http://localhost/source.map" });
      if (method === "Runtime.evaluate") { lookups += 1; expect(params?.["expression"]).toContain('"frame#1:sharedMember"'); return { result: { objectId: "1" } }; }
      if (method === "Runtime.getProperties") return { internalProperties: [{ name: "[[FunctionLocation]]", value: { value: { scriptId: "42", lineNumber: 30 } } }] };
      return {};
    },
  };
  const result = await readBreakdown(session as never);
  expect(result?.calls?.[0]?.name).toBe("frame#1:sharedMember packages/core/src/ambientFauna/AmbientFauna.draw.tsx:1 | fauna ground queries");
  expect(result?.cpu[0]?.name).toBe("frame#1:sharedMember packages/core/src/ambientFauna/AmbientFauna.draw.tsx:1");
  expect(result?.sources).toEqual({ resolved: 1, unresolved: 0 });
  expect(lookups).toBe(1);
});

test("source lookup failure remains visible alongside the counts", async () => {
  const frame: FrameBreakdownRecord = { intervalMs: 10, workMs: 5, cpu: { "frame#2": 2 }, calls: { "frame#2 | fauna ground queries": 12 }, gpu: null, draws: 0, triangles: 0, compiles: 0, compileMs: 0, uploads: 0, uploadBytes: 0, uploadMs: 0, heapMb: null, heapDropMb: 0 };
  const summary = summarizeBreakdown([frame], { objects: [], materials: [] });
  const session = { evaluate: async () => summary, on: () => () => {}, send: async (method: string) => { if (method === "Debugger.enable") throw new Error("debugger unavailable"); return {}; } };
  const result = await readBreakdown(session as never);
  expect(result?.sources).toEqual({ resolved: 0, unresolved: 1, error: "debugger unavailable" });
  expect(result?.calls?.[0]?.avg).toBe(12);
});

test("a missing source map labels the transformed location and leaves source unresolved", async () => {
  const frame: FrameBreakdownRecord = { intervalMs: 10, workMs: 5, cpu: { "frame#2": 2 }, gpu: null, draws: 0, triangles: 0, compiles: 0, compileMs: 0, uploads: 0, uploadBytes: 0, uploadMs: 0, heapMb: null, heapDropMb: 0 };
  const summary = summarizeBreakdown([frame], { objects: [], materials: [] });
  let onScript: (params: Record<string, unknown>) => void = () => {};
  const session = {
    evaluate: async () => summary,
    on: (_event: string, callback: typeof onScript) => { onScript = callback; return () => {}; },
    send: async (method: string) => {
      if (method === "Debugger.enable") onScript({ scriptId: "1", url: "http://localhost/generated.js" });
      if (method === "Runtime.evaluate") return { result: { objectId: "1" } };
      if (method === "Runtime.getProperties") return { internalProperties: [{ name: "[[FunctionLocation]]", value: { value: { scriptId: "1", lineNumber: 30 } } }] };
      return {};
    },
  };
  const result = await readBreakdown(session as never);
  expect(result?.cpu[0]?.name).toBe("frame#2 generated /generated.js:31");
  expect(result?.sources).toEqual({ resolved: 0, unresolved: 1 });
});
