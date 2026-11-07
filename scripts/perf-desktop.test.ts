import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { desktopDeadline, diagnosticDesktopTarget, parseLaunchArgs } from "./perf-desktop";

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
