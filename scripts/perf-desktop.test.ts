import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { desktopDeadline, desktopOutFor, diagnosticDesktopTarget, parseAllArgs, parseLaunchArgs, renderAllTable } from "./perf-desktop";

test("a launch run names its app and defaults to the display's vsync", () => {
  expect(parseLaunchArgs(["--launch", "out/game/Game.exe"])).toEqual({ exe: resolve("out/game/Game.exe"), uncapped: false, seconds: 8, port: 9390, out: null, maps: `${resolve("out/game")}.private-maps`, size: { width: 1600, height: 900 }, flow: null, renderers: ["webgl"] });
  expect(parseLaunchArgs(["--launch", "Game.exe", "--flow", "deepward/long-play"]).flow).toEqual({ game: "deepward", name: "long-play" });
  expect(() => parseLaunchArgs(["--launch", "Game.exe", "--flow", "long-play"])).toThrow("--flow takes");
  expect(parseLaunchArgs(["--launch", "Game.exe", "--uncapped", "--seconds", "4", "--port", "9400", "--out", "r.json", "--maps", "m", "--size", "1920x1080"])).toEqual({ exe: resolve("Game.exe"), uncapped: true, seconds: 4, port: 9400, out: resolve("r.json"), maps: resolve("m"), size: { width: 1920, height: 1080 }, flow: null, renderers: ["webgl"] });
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
