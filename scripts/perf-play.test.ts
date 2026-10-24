import { createServer, type Server } from "node:http";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { chromeFrameClockArgs, startBrowser, type ChromeLaunchOptions } from "./browser-lib";
import {
  aggregateInclusiveTime,
  aggregateSelfTime,
  cappedClockProblem,
  droppedOverrides,
  measureGame,
  measureSceneNodes,
  parseDeclaredSettings,
  parsePerfArgs,
  parseSettingSpec,
  perfFrameClockLine,
  perfPageUrl,
  perfSettingsScript,
  perfStateLine,
  probeFrameClockMs,
  summarizeFrameDeltas,
  summarizeFrameDraws,
  undeclaredSettingErrors,
} from "./perf-play";

test("parsePerfArgs reads one game with its flags", () => {
  expect(parsePerfArgs(["harbor-heat"])).toEqual({
    kind: "run",
    args: { game: "harbor-heat", draft: false, profile: false, seconds: 6, telemetry: "on", settings: [], frameClock: "capped", params: [] },
  });
  expect(parsePerfArgs(["deepward", "--quality", "ultra", "--profile", "--seconds", "3"])).toEqual({
    kind: "run",
    args: { game: "deepward", quality: "ultra", draft: false, profile: true, seconds: 3, telemetry: "on", settings: [], frameClock: "capped", params: [] },
  });
  const drafted = parsePerfArgs(["deepward", "--draft"]);
  expect(drafted.kind === "run" && drafted.args.draft).toBe(true);
  expect(drafted.kind === "run" && drafted.args.quality).toBeUndefined();
  expect(parsePerfArgs(["--help"]).kind).toBe("help");
});

test("parsePerfArgs rejects unusable input", () => {
  expect(() => parsePerfArgs([])).toThrow("a game id is required");
  expect(() => parsePerfArgs(["a", "b"])).toThrow("one game per run");
  expect(() => parsePerfArgs(["a", "--quality", "highish"])).toThrow("--quality must be one of low, medium, high, ultra");
  expect(() => parsePerfArgs(["a", "--quality", "draft"])).toThrow("--quality must be one of low, medium, high, ultra");
  expect(() => parsePerfArgs(["a", "--draft", "--quality", "ultra"])).toThrow("--draft is the iteration preset");
  expect(() => parsePerfArgs(["a", "--seconds", "0"])).toThrow("--seconds must be a positive number");
  expect(() => parsePerfArgs(["a", "--bogus"])).toThrow("unknown flag --bogus");
});

test("--state pins the scene two runs share, and the pin is echoed with the numbers", () => {
  const parsed = parsePerfArgs(["beacon-bastion", "--state", "two-towers"]);
  expect(parsed.kind === "run" && parsed.args.state).toBe("two-towers");
  expect(perfStateLine("two-towers")).toBe("perf: state two-towers");
  expect(perfStateLine(undefined, [["spawn", "1,2,3"]])).toBe("perf: params spawn=1,2,3");
  expect(perfStateLine("two-towers", [["seed", "7"]])).toBe("perf: state two-towers · params seed=7");
  expect(perfStateLine(undefined)).toBeNull();

  expect(() => parsePerfArgs(["a", "--state"])).toThrow("--state needs a capture.states name");
  expect(() => parsePerfArgs(["a", "--state", "one", "--state", "two"])).toThrow("--state given twice");
});

test("--param reaches the page as a query param, and cannot take a param the harness owns", () => {
  const parsed = parsePerfArgs(["deepward", "--param", "spawn=4,0,-9", "--param", "seed=7"]);
  expect(parsed.kind === "run" && parsed.args.params).toEqual([
    ["spawn", "4,0,-9"],
    ["seed", "7"],
  ]);
  const url = perfPageUrl({
    base: "http://127.0.0.1:4601",
    game: "deepward",
    state: "paused",
    params: parsed.kind === "run" ? parsed.args.params : [],
  });
  expect(url.searchParams.get("state")).toBe("paused");
  expect(url.searchParams.get("spawn")).toBe("4,0,-9");
  expect(url.searchParams.get("seed")).toBe("7");

  expect(() => parsePerfArgs(["a", "--param", "spawn"])).toThrow("--param needs key=value");
  expect(() => parsePerfArgs(["a", "--param", "=1"])).toThrow("--param needs key=value");
  expect(() => parsePerfArgs(["a", "--param", "device=mobile"])).toThrow("--param device is the harness's own");
  expect(() => parsePerfArgs(["a", "--param", "state=paused"])).toThrow("use --state <name>");
  expect(() => parsePerfArgs(["a", "--param", "seed=1", "--param", "seed=2"])).toThrow("--param seed given twice");
});

test("--set names an engine setting and reports it with the run", () => {
  const parsed = parsePerfArgs(["harbor-heat", "--set", "colorblind=grayscale"]);
  expect(parsed.kind === "run" && parsed.args.settings).toEqual([
    { id: "accessibility.colorblind", key: "colorblind", value: "grayscale", scope: "engine" },
  ]);
  expect(parsePerfArgs(["harbor-heat", "--set", "accessibility.colorblind=grayscale", "--set", "shadows=false"])).toMatchObject({
    args: {
      settings: [
        { id: "accessibility.colorblind", key: "accessibility.colorblind", value: "grayscale", scope: "engine" },
        { id: "graphics.shadows", key: "shadows", value: "false", scope: "engine" },
      ],
    },
  });
});

test("a setting the game declares resolves through the game's own table", () => {
  const setting = parseSettingSpec("survey.hints=false");
  expect(setting).toEqual({ id: "survey.hints", key: "survey.hints", value: "false", scope: "game" });

  const declared = parseDeclaredSettings(
    JSON.stringify([
      { id: "survey.hints", kind: "toggle", default: true },
      { id: "survey.pace", kind: "select", options: ["slow", "fast"], default: "slow" },
      { id: "survey.fov", kind: "slider", min: 50, max: 100, default: 70 },
    ]),
  );
  expect(declared.map((entry) => entry.id)).toEqual(["survey.hints", "survey.pace", "survey.fov"]);
  expect(undeclaredSettingErrors([setting], declared)).toEqual([]);
  expect(undeclaredSettingErrors([parseSettingSpec("survey.pace=fast")], declared)).toEqual([]);
  expect(undeclaredSettingErrors([parseSettingSpec("survey.fov=68")], declared)).toEqual([]);
});

test("a game setting the game does not declare fails, naming the key and what it does declare", () => {
  const declared = parseDeclaredSettings(JSON.stringify([{ id: "survey.hints", kind: "toggle" }]));
  expect(undeclaredSettingErrors([parseSettingSpec("survey.hintz=false")], declared)).toEqual([
    'unknown setting "survey.hintz" — the game declares: survey.hints',
  ]);
  expect(undeclaredSettingErrors([parseSettingSpec("survey.hints=false")], [])).toEqual([
    'unknown setting "survey.hints" — the game declares no settings of its own',
  ]);
  expect(undeclaredSettingErrors([parseSettingSpec("survey.hints=yes")], declared)).toEqual([
    "--set survey.hints=yes must be true or false (the game declares survey.hints a toggle)",
  ]);
  expect(
    undeclaredSettingErrors(
      [parseSettingSpec("survey.pace=slow")],
      parseDeclaredSettings(JSON.stringify([{ id: "survey.pace", kind: "select", options: ["slow", "fast"] }])),
    ),
  ).toEqual([]);
  expect(
    undeclaredSettingErrors(
      [parseSettingSpec("survey.pace=glacial")],
      parseDeclaredSettings(JSON.stringify([{ id: "survey.pace", kind: "select", options: ["slow", "fast"] }])),
    ),
  ).toEqual(["--set survey.pace=glacial must be one of slow, fast (the game declares survey.pace a select)"]);
});

test("a declaration the dev runner did not publish reads as none, never as a guess", () => {
  expect(parseDeclaredSettings(null)).toEqual([]);
  expect(parseDeclaredSettings("")).toEqual([]);
  expect(parseDeclaredSettings("not json")).toEqual([]);
  expect(parseDeclaredSettings('{"id":"survey.hints"}')).toEqual([]);
  expect(
    parseDeclaredSettings(JSON.stringify([{ kind: "toggle" }, { id: "survey.hints", kind: "toggle" }, null, 3])),
  ).toEqual([{ id: "survey.hints", kind: "toggle" }]);
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
  const url = perfPageUrl({ base: "http://127.0.0.1:4601", game: "harbor-heat" });
  expect(url.searchParams.get("game")).toBe("harbor-heat");
  expect(url.searchParams.get("mode")).toBe("play");
  expect(url.searchParams.get("device")).toBe("desktop");
  expect(url.searchParams.get("capture")).toBe("1");
  expect(url.searchParams.get("quality")).toBeNull();
  expect(url.searchParams.get("telemetry")).toBeNull();

  const pinned = perfPageUrl({ base: "http://127.0.0.1:4601", game: "harbor-heat", quality: "ultra" });
  expect(pinned.searchParams.get("quality")).toBe("ultra");

  const quiet = perfPageUrl({ base: "http://127.0.0.1:4601", game: "deepward", quality: "low", telemetry: "off" });
  expect(quiet.searchParams.get("quality")).toBe("low");
  expect(quiet.searchParams.get("telemetry")).toBe("off");
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

/**
 * The launch flags and the record marker: `--uncapped` has to reach Chrome, and a record has to say
 * which clock produced its ms, because a vsync-multiple and a real frame cost never compare.
 */
test("--uncapped asks Chrome for an unthrottled rAF clock; the default asks for nothing", () => {
  expect(parsePerfArgs(["harbor-heat", "--uncapped"])).toMatchObject({ args: { frameClock: "uncapped" } });
  expect(parsePerfArgs(["harbor-heat"]).kind === "run" && parsePerfArgs(["harbor-heat"]).args.frameClock).toBe("capped");

  expect(chromeFrameClockArgs("capped")).toEqual([]);
  expect(chromeFrameClockArgs()).toEqual([]);
  expect(chromeFrameClockArgs("uncapped")).toEqual([
    "--disable-frame-rate-limit",
    "--disable-gpu-vsync",
    "--run-all-compositor-stages-before-draw",
  ]);

  expect(perfFrameClockLine("capped")).toBeNull();
  expect(perfFrameClockLine("uncapped")).toContain("not comparable with a capped record");
});

test("the frame clock the run asked for is what the browser launch receives", async () => {
  const seen: (ChromeLaunchOptions | undefined)[] = [];
  // A real endpoint: the probe asks with node:http, so a stubbed fetch proves nothing.
  const server: Server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no debugger port");
  try {
    for (const frameClock of ["uncapped", undefined] as const) {
      await startBrowser({
        debugPort: address.port,
        readyMs: 500,
        log: () => {},
        ...(frameClock === undefined ? {} : { frameClock }),
        launch: (_port, _prefix, options) => {
          seen.push(options);
          // A path only: the fake launch owns no browser, so nothing is created or cleaned up.
          return { pid: undefined, userDataDir: join(".scratch", "jg-clock-fake") };
        },
        pageProbe: async () => {},
      });
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  expect(seen).toEqual([{ frameClock: "uncapped" }, undefined]);
});

test("a blank page that still ticks at vsync is a failed uncapped run, not a measurement", () => {
  expect(cappedClockProblem(0.7)).toBeNull();
  expect(cappedClockProblem(4.2)).toBeNull();
  expect(cappedClockProblem(16.7)).toContain("still ticked at 16.7 ms");
  expect(cappedClockProblem(16.7)).toContain("16.7 ms multiples");
  expect(cappedClockProblem(0)).toContain("saw no animation frames");
});

test("a probe that catches the compositor still starting retries instead of failing the run", async () => {
  const samples = [[16.7, 16.7, 16.8], [0.2, 0.3, 0.1]];
  let reads = 0;
  const session = { evaluate: async () => samples[Math.min(reads++, samples.length - 1)] };
  expect(await probeFrameClockMs(session as never, 300, 3)).toBe(0.2);
  expect(reads).toBe(2);

  const capped = { evaluate: async () => [16.7, 16.7, 16.8] };
  expect(await probeFrameClockMs(capped as never, 300, 3)).toBe(16.7);
});

function fakePerfSession(options: { clock?: number[]; frames?: number[]; gpu?: string } = {}) {
  const session = {
    send: async () => ({}),
    evaluate: async (expression: string) => {
      if (expression.includes("jgCapture")) return { status: "ready", error: null };
      if (expression.includes(">= 300")) return options.clock ?? [2, 2, 3];
      if (expression.includes("deltas.push")) return options.frames ?? [5, 6, 7, 6];
      if (expression.includes("innerWidth")) return { w: 1600, h: 900 };
      if (expression.includes("webgl2")) return options.gpu ?? "Test GPU";
      if (expression.includes("__jgPerfGl")) return { counts: {}, since: {} };
      return null;
    },
  };
  return session as never;
}

test("a record says which clock produced its frame times, so the two never get compared", async () => {
  const base = "http://127.0.0.1:4601";
  const capped = await measureGame({ session: fakePerfSession(), base, game: "beacon-bastion", warmupMs: 0, seconds: 0.001, profile: false });
  expect(capped.record.frameClock).toBe("capped");
  expect(capped.record.frame.avgMs).toBe(6);

  const uncapped = await measureGame({
    session: fakePerfSession({ clock: [0.8, 0.9, 0.7] }),
    base,
    game: "beacon-bastion",
    warmupMs: 0,
    seconds: 0.001,
    profile: false,
    frameClock: "uncapped",
  });
  expect(uncapped.record.frameClock).toBe("uncapped");

  await expect(
    measureGame({
      session: fakePerfSession({ clock: [16.7, 16.7, 16.8] }),
      base,
      game: "beacon-bastion",
      warmupMs: 0,
      seconds: 0.001,
      profile: false,
      frameClock: "uncapped",
    }),
  ).rejects.toThrow("--uncapped did not take");
});

test("whole-frame draws are the p95 of the sampled frames, so a cadenced pass is counted and a spike is not", () => {
  const frames = [100, 100, 100, 100, 100, 100, 100, 100, 100, 150, 150, 400];
  expect(summarizeFrameDraws(frames)).toEqual({ frames: 12, min: 100, p50: 100, p95: 400, max: 400 });
  // A shadow or prepass that runs every other frame lands in the p95 rather than being missed.
  const cadenced = Array.from({ length: 40 }, (_, index) => (index % 2 === 0 ? 500 : 900));
  expect(summarizeFrameDraws(cadenced)).toMatchObject({ frames: 40, min: 500, p95: 900, max: 900 });
  expect(summarizeFrameDraws([])).toEqual({ frames: 0, min: 0, p50: 0, p95: 0, max: 0 });
  expect(summarizeFrameDraws([Number.NaN, -4, 12])).toMatchObject({ frames: 1, p95: 12 });
});

