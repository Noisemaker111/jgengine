import { expect, test } from "bun:test";

import { aggregateInclusiveTime, aggregateSelfTime, parsePerfArgs, summarizeFrameDeltas } from "./perf-play";

test("parsePerfArgs reads one game with its flags", () => {
  expect(parsePerfArgs(["harbor-heat"])).toEqual({
    kind: "run",
    args: { game: "harbor-heat", quality: "full", profile: false, seconds: 6, telemetry: "on" },
  });
  expect(parsePerfArgs(["deepward", "--quality", "draft", "--profile", "--seconds", "3"])).toEqual({
    kind: "run",
    args: { game: "deepward", quality: "draft", profile: true, seconds: 3, telemetry: "on" },
  });
  expect(parsePerfArgs(["--help"]).kind).toBe("help");
});

test("parsePerfArgs rejects unusable input", () => {
  expect(() => parsePerfArgs([])).toThrow("a game id is required");
  expect(() => parsePerfArgs(["a", "b"])).toThrow("one game per run");
  expect(() => parsePerfArgs(["a", "--quality", "low"])).toThrow("--quality must be draft or full");
  expect(() => parsePerfArgs(["a", "--seconds", "0"])).toThrow("--seconds must be a positive number");
  expect(() => parsePerfArgs(["a", "--bogus"])).toThrow("unknown flag --bogus");
});

test("summarizeFrameDeltas reports the window a player sees", () => {
  const deltas = [...Array.from({ length: 90 }, () => 16), 40];
  const window = summarizeFrameDeltas(deltas);
  expect(window.samples).toBe(91);
  expect(window.avgMs).toBe(16.26);
  expect(window.maxMs).toBe(40);
  expect(window.longFrames).toBe(1);
  expect(window.p95Ms).toBe(16);
  expect(window.fps).toBeCloseTo(61.5, 1);
  expect(summarizeFrameDeltas([]).samples).toBe(0);
});

test("aggregateSelfTime ranks functions and keeps readable source locations", () => {
  const profile = {
    nodes: [
      { id: 1, callFrame: { functionName: "(root)", url: "", lineNumber: 0, columnNumber: 0 }, children: [2, 3] },
      { id: 2, callFrame: { functionName: "updateWorld", url: "http://127.0.0.1:4517/Game/src/world.ts?t=1", lineNumber: 9, columnNumber: 2 } },
      { id: 3, callFrame: { functionName: "", url: "http://127.0.0.1:4517/src/perf.ts", lineNumber: 4, columnNumber: 0 } },
    ],
    samples: [2, 2, 3],
    timeDeltas: [2_000, 4_000, 1_000],
  };
  const self = aggregateSelfTime(profile, 7);
  expect(self).toHaveLength(2);
  expect(self[0]).toEqual({ fn: "updateWorld", at: "Game/src/world.ts:10:3", selfMs: 6, selfPct: 85.7 });
  expect(self[1]).toEqual({ fn: "(anonymous)", at: "src/perf.ts:5:1", selfMs: 1, selfPct: 14.3 });

  const inclusive = aggregateInclusiveTime(profile, 7);
  expect(inclusive[0]?.fn).toBe("(root)");
  expect(inclusive.find((entry) => entry.fn === "updateWorld")?.selfMs).toBe(6);
});
