import { expect, test } from "bun:test";
import { diagnosticDesktopTarget } from "./perf-desktop";

test("desktop report selects only one explicitly diagnostic local app", () => {
  const own = { type: "page", url: "http://tauri.localhost/index.html?telemetry=local", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/1" };
  expect(diagnosticDesktopTarget([{ type: "page", url: "https://example.com", webSocketDebuggerUrl: "ws://localhost/2" }, own])).toBe(own);
  expect(() => diagnosticDesktopTarget([])).toThrow("found 0");
  expect(() => diagnosticDesktopTarget([own, own])).toThrow("found 2");
  expect(() => diagnosticDesktopTarget([{ ...own, url: "http://tauri.localhost/index.html" }])).toThrow("found 0");
});
