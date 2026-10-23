import { expect, test } from "bun:test";

import {
  aggregateInclusiveTime,
  aggregateSelfTime,
  droppedOverrides,
  measureSceneNodes,
  parsePerfArgs,
  parseSettingSpec,
  perfPageUrl,
  perfSettingsScript,
  summarizeFrameDeltas,
} from "./perf-play";

test("parsePerfArgs reads one game with its flags", () => {
  expect(parsePerfArgs(["harbor-heat"])).toEqual({
    kind: "run",
    args: { game: "harbor-heat", quality: "full", profile: false, seconds: 6, telemetry: "on", settings: [] },
  });
  expect(parsePerfArgs(["deepward", "--quality", "draft", "--profile", "--seconds", "3"])).toEqual({
    kind: "run",
    args: { game: "deepward", quality: "draft", profile: true, seconds: 3, telemetry: "on", settings: [] },
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

test("--set names an engine setting and reports it with the run", () => {
  const parsed = parsePerfArgs(["harbor-heat", "--set", "colorblind=grayscale"]);
  expect(parsed.kind === "run" && parsed.args.settings).toEqual([
    { id: "accessibility.colorblind", key: "colorblind", value: "grayscale" },
  ]);
  expect(parsePerfArgs(["harbor-heat", "--set", "accessibility.colorblind=grayscale", "--set", "shadows=false"])).toMatchObject({
    args: {
      settings: [
        { id: "accessibility.colorblind", key: "accessibility.colorblind", value: "grayscale" },
        { id: "graphics.shadows", key: "shadows", value: "false" },
      ],
    },
  });
});

test("a typo in the setting key fails instead of measuring the default", () => {
  expect(() => parseSettingSpec("colourblind=grayscale")).toThrow(/unknown setting "colourblind"/);
  expect(() => parsePerfArgs(["harbor-heat", "--set", "grayscale=colorblind"])).toThrow(/unknown setting "grayscale"/);
  expect(() => parseSettingSpec("colorblind")).toThrow("--set needs key=value");
  expect(() => parseSettingSpec("colorblind=")).toThrow("--set needs key=value");
});

test("a value the engine does not offer fails, so a fallback is never measured as the setting", () => {
  expect(() => parseSettingSpec("colorblind=gray")).toThrow("must be one of none, protanopia, deuteranopia, tritanopia, grayscale");
  expect(() => parseSettingSpec("quality=highish")).toThrow("--set quality=highish must be one of low, medium, high, ultra");
  expect(() => parsePerfArgs(["harbor-heat", "--set", "colorblind=grayscale", "--set", "accessibility.colorblind=none"])).toThrow(
    "given twice",
  );
});

test("the URL a run opens carries the harness's own params and nothing the override invented", () => {
  const url = perfPageUrl({ base: "http://127.0.0.1:4601", game: "harbor-heat", quality: "full" });
  expect(url.searchParams.get("game")).toBe("harbor-heat");
  expect(url.searchParams.get("mode")).toBe("play");
  expect(url.searchParams.get("device")).toBe("desktop");
  expect(url.searchParams.get("capture")).toBe("1");
  expect(url.searchParams.get("quality")).toBeNull();
  expect(url.searchParams.get("telemetry")).toBeNull();

  const draft = perfPageUrl({ base: "http://127.0.0.1:4601", game: "deepward", quality: "draft", telemetry: "off" });
  expect(draft.searchParams.get("quality")).toBe("low");
  expect(draft.searchParams.get("telemetry")).toBe("off");
});

test("the override script writes the settings storage key the game reads at boot", () => {
  const settings = parseSettingSpec("colorblind=grayscale");
  const written: Record<string, string> = {};
  const localStorage = { setItem: (key: string, value: string) => void (written[key] = value) };
  new Function("localStorage", perfSettingsScript([settings]))(localStorage);
  expect(written).toEqual({ "jgengine:setting:accessibility.colorblind": JSON.stringify("grayscale") });
  expect(droppedOverrides([settings], { "accessibility.colorblind": JSON.stringify("grayscale") })).toEqual([]);
  expect(droppedOverrides([settings], { "accessibility.colorblind": null })).toEqual([settings]);
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

/**
 * Node counting runs on CI's llvmpipe runners where a frame can take seconds. It reads
 * the page sampler first, and only walks the heap when the sampler is off, because the
 * heap walk depends on three's URL still being in the resource-timing buffer.
 */
test("scene nodes come from the page sampler before any heap walk", async () => {
  const calls: string[] = [];
  const session = {
    evaluate: async () => ({ nodes: 11_365, scenes: 1, source: "scene-graph" }),
    send: async (method: string) => {
      calls.push(method);
      throw new Error("heap walk should not run");
    },
  };
  expect(await measureSceneNodes(session as never)).toEqual({ nodes: 11_365, source: "scene-graph", scenes: 1 });
  expect(calls).toEqual([]);
});

test("scene nodes fall back to the CDP heap walk when the sampler is off", async () => {
  const session = {
    evaluate: async () => null,
    send: async (method: string, params?: { objectId?: string; functionDeclaration?: string }) => {
      if (method === "Runtime.enable") return {};
      if (method === "Runtime.evaluate") return { result: { objectId: "namespace" } };
      if (method === "Runtime.callFunctionOn" && params?.objectId === "namespace") return { result: { objectId: "prototype" } };
      if (method === "Runtime.queryObjects") return { objects: { objectId: "instances" } };
      return { result: { value: { scenes: 1, nodes: 142 } } };
    },
  };
  expect(await measureSceneNodes(session as never)).toEqual({ nodes: 142, source: "scene-graph", scenes: 1 });
});

test("an unreadable scene is reported as unavailable, never as zero", async () => {
  const session = {
    evaluate: async () => {
      throw new Error("no page");
    },
    send: async () => {
      throw new Error("no page");
    },
  };
  expect(await measureSceneNodes(session as never)).toEqual({ nodes: null, source: "unavailable", scenes: 0 });
});
