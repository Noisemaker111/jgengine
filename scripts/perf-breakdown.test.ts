import { expect, test } from "bun:test";
import { summarizeBreakdown, type FrameBreakdownRecord } from "../packages/core/src/devtools/frameBreakdown";
import { compareBreakdowns } from "./perf-breakdown";

test("comparison does not turn missing GPU samples into zero", () => {
  const frame: FrameBreakdownRecord = { intervalMs: 10, workMs: 5, cpu: {}, gpu: null, draws: 0, triangles: 0, compiles: 0, compileMs: 0, uploads: 0, uploadBytes: 0, uploadMs: 0, heapMb: null, heapDropMb: 0 };
  const missing = summarizeBreakdown([frame], { objects: [], materials: [] });
  const present = summarizeBreakdown([{ ...frame, gpu: { main: 2 } }], { objects: [], materials: [] });
  const text = compareBreakdowns(missing, present);
  expect(text).toContain("gpu            unavailable in one or both runs");
  expect(text).toContain("cost p50       unavailable without GPU timings");
  expect(text).not.toContain("cost p50 allows");
});
