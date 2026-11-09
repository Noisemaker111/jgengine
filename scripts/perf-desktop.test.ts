import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { carryShaderCaches, desktopDeadline, desktopOutFor, diagnosticDesktopTarget, freePort, parseAllArgs, parseLaunchArgs, portAnswers, renderAllTable, unmeasuredFailure, unmeasuredSceneReason } from "./perf-desktop";
import { foldDesktopCpuLayers } from "./perf-desktop-cpu";
import type { CdpSession } from "./browser-lib";
import type { ProfileNode, RawProfile } from "./perf-play";

test("an --all run with a game left unmeasured fails and names it", () => {
  const measured = { game: "beacon-bastion", backend: "webgl" as const, record: {} as never };
  expect(unmeasuredFailure([measured])).toBeNull();
  expect(unmeasuredFailure([measured, { game: "fernwild", backend: "webgl", record: null }])).toBe("perf desktop: 1 of 2 game runs not measured: fernwild (webgl)");
});

test("a window measured under the preparing cover, or with nothing drawn, is not a measurement", () => {
  expect(unmeasuredSceneReason(8, true)).toContain("still preparing shaders");
  expect(unmeasuredSceneReason(0.1, false)).toContain("drew nothing");
  expect(unmeasuredSceneReason(undefined, true)).toContain("still preparing shaders");
  expect(unmeasuredSceneReason(565, false)).toBeNull();
  expect(unmeasuredSceneReason(undefined, false)).toBeNull();
});

test("a launch run names its app and defaults to the display's vsync", () => {
  expect(parseLaunchArgs(["--launch", "out/game/Game.exe"])).toEqual({ exe: resolve("out/game/Game.exe"), uncapped: false, seconds: 8, port: null, out: null, maps: `${resolve("out/game")}.private-maps`, size: { width: 1600, height: 900 }, flow: null, renderers: ["webgl"], returning: false, trace: false, cpu: false, renders: false });
  expect(parseLaunchArgs(["--launch", "Game.exe", "--flow", "deepward/long-play"]).flow).toEqual({ game: "deepward", name: "long-play" });
  expect(() => parseLaunchArgs(["--launch", "Game.exe", "--flow", "long-play"])).toThrow("--flow takes");
  expect(parseLaunchArgs(["--launch", "Game.exe", "--uncapped", "--seconds", "4", "--port", "9400", "--out", "r.json", "--maps", "m", "--size", "1920x1080"])).toEqual({ exe: resolve("Game.exe"), uncapped: true, seconds: 4, port: 9400, out: resolve("r.json"), maps: resolve("m"), size: { width: 1920, height: 1080 }, flow: null, renderers: ["webgl"], returning: false, trace: false, cpu: false, renders: false });
  expect(parseLaunchArgs(["--launch", "Game.exe", "--cpu", "--renders"])).toMatchObject({ cpu: true, renders: true });
  expect(() => parseLaunchArgs(["--uncapped"])).toThrow("--launch needs");
  expect(parseLaunchArgs(["--launch", "Game.exe", "--renderer", "both"]).renderers).toEqual(["webgl", "webgpu"]);
  expect(parseLaunchArgs(["--launch", "Game.exe", "--renderer", "webgpu"]).renderers).toEqual(["webgpu"]);
  expect(() => parseLaunchArgs(["--launch", "Game.exe", "--renderer", "metal"])).toThrow("--renderer must be webgl, webgpu or both");
  expect(desktopOutFor({ out: "r.json", renderers: ["webgl", "webgpu"] }, "webgpu")).toBe("r.webgpu.json");
  expect(desktopOutFor({ out: "r.json", renderers: ["webgl", "webgpu"] }, "webgl")).toBe("r.json");
  expect(desktopOutFor({ out: "r.json", renderers: ["webgpu"] }, "webgpu")).toBe("r.json");
  expect(() => parseLaunchArgs(["--launch", "Game.exe", "--fps", "360"])).toThrow("unknown argument --fps");
  expect(() => parseLaunchArgs(["--launch", "Game.exe", "--port", "80"])).toThrow("--port must be");
});

test("desktop report selects only one explicitly diagnostic local app", () => {
  const own = { type: "page", url: "http://tauri.localhost/index.html?telemetry=local", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/1" };
  expect(diagnosticDesktopTarget([{ type: "page", url: "https://example.com", webSocketDebuggerUrl: "ws://localhost/2" }, own])).toBe(own);
  expect(() => diagnosticDesktopTarget([])).toThrow("found 0");
  expect(() => diagnosticDesktopTarget([own, own])).toThrow("found 2");
  expect(() => diagnosticDesktopTarget([{ ...own, url: "http://tauri.localhost/index.html" }])).toThrow("found 0");
});

test("a stalled desktop debugger fails within its deadline", async () => {
  expect(await desktopDeadline(Promise.resolve("ready"), 50)).toBe("ready");
  await expect(desktopDeadline(new Promise(() => {}), 5)).rejects.toThrow("desktop report timed out after 5ms");
});

test("the all-games report defaults to every playable game and takes its own flags", () => {
  const args = parseAllArgs(["--all"]);
  expect(args.games.length).toBeGreaterThan(1);
  expect(args).toMatchObject({ uncapped: false, seconds: 8, skipBuild: false, reuse: false, markdown: false, renderers: ["webgl"] });
  expect(parseAllArgs(["--all", "--renderer", "both"]).renderers).toEqual(["webgl", "webgpu"]);
  expect(() => parseAllArgs(["--all", "--renderer", "metal"])).toThrow("--renderer must be webgl, webgpu or both");
  expect(parseAllArgs(["--all", "--uncapped", "--games", "deepward,harbor-heat", "--reuse"])).toMatchObject({ games: ["deepward", "harbor-heat"], uncapped: true, reuse: true });
  expect(() => parseAllArgs(["--all", "--games", ""])).toThrow("needs at least one game id");
  expect(() => parseAllArgs(["--all", "--launch", "x.exe"])).toThrow("unknown argument --launch");
});

test("the all-games table puts each game against 360 fps and names a game it could not measure", () => {
  const record = (fps: number, frameP50: number) => ({
    at: 0, exe: "Game.exe", clock: "uncapped" as const, tier: "high", viewport: "1600x900", start: "capture.play",
    frame: { fps, avgMs: 1000 / fps, p95Ms: frameP50 * 1.5, maxMs: 20, samples: 100, longFrames: 0 },
    rafP50Ms: frameP50, rafP99Ms: frameP50 * 2, breakdown: null,
    backend: { asked: "webgl" as const, drawing: "webgl" as const, warnings: [] },
    shadowCache: null,
  });
  const text = renderAllTable([
    { game: "fast", backend: "webgl", record: record(420, 2.4), error: null },
    { game: "slow", backend: "webgl", record: record(70, 14), error: null },
    { game: "broken", backend: "webgl", record: null, error: "desktop build failed" },
    { game: "fast", backend: "webgpu", record: { ...record(380, 2.6), backend: { asked: "webgpu" as const, drawing: "webgl" as const, warnings: [] } }, error: null },
  ], true);
  expect(text).toContain("| fast | webgl | uncapped | 420 | 2.40 |");
  expect(text).toContain("| fast | webgpu (drew webgl) | uncapped | 380 |");
  expect(text).toContain("| yes |");
  expect(text).toContain("5.0x short");
  expect(text).toContain("no run: desktop build failed");
  expect(text).toContain("webgl: 1 of 2 measured games hold 360 fps (1 not measured); webgpu: 1 of 1 measured games hold 360 fps (0 not measured)");

  const dropped = renderAllTable([
    { game: "fast", backend: "webgpu", record: { ...record(500, 2), backend: { asked: "webgpu" as const, drawing: "webgpu" as const, warnings: ["WebGPU: Invalid CommandBuffer."] } }, error: null },
    { game: "slow", backend: "webgpu", record: { ...record(70, 14), backend: { asked: "webgpu" as const, drawing: "webgpu" as const, warnings: ["draw mode 6 (LINE_LOOP / TRIANGLE_FAN) is not drawn"] } }, error: null },
  ], true);
  expect(dropped).toContain("not comparable: 1 WebGPU errors dropped GPU work");
  expect(dropped).toContain("webgpu: 0 of 1 measured games hold 360 fps (1 not measured, 1 with dropped GPU work)");
});

test("each launch gets a debugger port nothing answers on, and a taken one is seen as taken", async () => {
  const port = freePort();
  expect(await portAnswers(port)).toBe(false);
  const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => Response.json({ Browser: "another app" }) });
  try {
    expect(await portAnswers(port)).toBe(true);
  } finally {
    server.stop(true);
  }
  expect(parseLaunchArgs(["--launch", "Game.exe", "--flow", "deepward/long-play", "--returning"]).returning).toBe(true);
  expect(() => parseLaunchArgs(["--launch", "Game.exe", "--returning"])).toThrow("--returning plays a --flow");
});

test("a returning session carries the shader caches and nothing of a save", () => {
  const from = mkdtempSync(join(tmpdir(), "jg-carry-from-"));
  const to = mkdtempSync(join(tmpdir(), "jg-carry-to-"));
  try {
    mkdirSync(join(from, "EBWebView", "GrShaderCache"), { recursive: true });
    writeFileSync(join(from, "EBWebView", "GrShaderCache", "data_0"), "skia");
    mkdirSync(join(from, "EBWebView", "Default", "Local Storage"), { recursive: true });
    writeFileSync(join(from, "EBWebView", "Default", "Local Storage", "save"), "a save");
    expect(carryShaderCaches(from, to)).toBe(1);
    expect(existsSync(join(to, "EBWebView", "GrShaderCache", "data_0"))).toBe(true);
    expect(existsSync(join(to, "EBWebView", "Default", "Local Storage"))).toBe(false);
  } finally {
    rmSync(from, { recursive: true, force: true });
    rmSync(to, { recursive: true, force: true });
  }
});

test("a desktop CPU profile folds into fps-gap's layers through the private maps, unmapped scripts counted apart", async () => {
  // One generated line per source: react-dom, a game HUD file, an engine file; line 3 has no map.
  const map = JSON.stringify({
    version: 3,
    sources: ["../../node_modules/react-dom/cjs/react-dom.production.js", "../../games/deepward/src/ui/VisorHud.tsx", "../../packages/core/src/frame.ts"],
    names: [],
    mappings: "AAAA;ACAA;ACAA",
  });
  const session = {
    async send(method: string) {
      if (method === "Debugger.enable" || method === "Debugger.disable") return {};
      throw new Error(`unexpected CDP call ${method}`);
    },
  } as unknown as CdpSession;
  const node = (id: number, lineNumber: number, scriptId = "s1"): ProfileNode => ({
    id,
    callFrame: { functionName: `f${id}`, scriptId, url: "assets/index-abc.js", lineNumber, columnNumber: 0 } as ProfileNode["callFrame"],
  });
  const profile: RawProfile = {
    nodes: [node(1, 0), node(2, 1), node(3, 2), { id: 4, callFrame: { functionName: "native", url: "native.js", lineNumber: 0, columnNumber: 0 } }],
    samples: [1, 2, 3, 4, 4],
    timeDeltas: [100, 100, 100, 50, 50],
  };
  const folded = await foldDesktopCpuLayers(session, profile, async (scriptId) => (scriptId === "s1" ? map : null));
  expect(folded.layers).toEqual([
    { layer: "React", pct: 25 },
    { layer: "game code", pct: 25 },
    { layer: "engine code", pct: 25 },
    { layer: "other scripts", pct: 25 },
  ]);
  expect(folded.unmappedPct).toBe(25);
});
