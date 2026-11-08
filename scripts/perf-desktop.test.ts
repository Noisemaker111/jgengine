import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { desktopDeadline, diagnosticDesktopTarget, parseAllArgs, parseLaunchArgs, renderAllTable } from "./perf-desktop";

test("a launch run names its app and defaults to the display's vsync", () => {
  expect(parseLaunchArgs(["--launch", "out/game/Game.exe"])).toEqual({ exe: resolve("out/game/Game.exe"), uncapped: false, seconds: 8, port: 9390, out: null, maps: `${resolve("out/game")}.private-maps`, size: { width: 1600, height: 900 } });
  expect(parseLaunchArgs(["--launch", "Game.exe", "--uncapped", "--seconds", "4", "--port", "9400", "--out", "r.json", "--maps", "m", "--size", "1920x1080"])).toEqual({ exe: resolve("Game.exe"), uncapped: true, seconds: 4, port: 9400, out: resolve("r.json"), maps: resolve("m"), size: { width: 1920, height: 1080 } });
  expect(() => parseLaunchArgs(["--uncapped"])).toThrow("--launch needs");
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
  expect(args).toMatchObject({ uncapped: false, seconds: 8, skipBuild: false, reuse: false, markdown: false });
  expect(parseAllArgs(["--all", "--uncapped", "--games", "deepward,harbor-heat", "--reuse"])).toMatchObject({ games: ["deepward", "harbor-heat"], uncapped: true, reuse: true });
  expect(() => parseAllArgs(["--all", "--games", ""])).toThrow("needs at least one game id");
  expect(() => parseAllArgs(["--all", "--launch", "x.exe"])).toThrow("unknown argument --launch");
});

test("the all-games table puts each game against 360 fps and names a game it could not measure", () => {
  const record = (fps: number, frameP50: number) => ({
    at: 0, exe: "Game.exe", clock: "uncapped" as const, tier: "high", viewport: "1600x900", start: "capture.play",
    frame: { fps, avgMs: 1000 / fps, p95Ms: frameP50 * 1.5, maxMs: 20, samples: 100, longFrames: 0 },
    rafP50Ms: frameP50, rafP99Ms: frameP50 * 2, breakdown: null,
  });
  const text = renderAllTable([
    { game: "fast", record: record(420, 2.4), error: null },
    { game: "slow", record: record(70, 14), error: null },
    { game: "broken", record: null, error: "desktop build failed" },
  ], true);
  expect(text).toContain("| fast | uncapped | 420 | 2.40 |");
  expect(text).toContain("| yes |");
  expect(text).toContain("5.0x short");
  expect(text).toContain("no run: desktop build failed");
  expect(text).toContain("1 of 2 measured games hold 360 fps (1 not measured)");
});
