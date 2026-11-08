import { describe, expect, it } from "bun:test";

import { readDesktopShell, saveDesktopFrameRate } from "./desktopShell";
import { FRAME_RATE_LIMIT_UNCAPPED, frameRateLimitOptions, paceFrame, readFrameRateLimit } from "./frameRateLimit";
import { createSettingsStore, SETTING_IDS } from "./settingsModel";

function run(displayHz: number, fps: number, seconds: number): number {
  let anchor = 0;
  let rendered = 0;
  for (let frame = 1; frame <= displayHz * seconds; frame++) {
    const t = (frame * 1000) / displayHz;
    const next = paceFrame(t, anchor, fps);
    if (next === null) continue;
    anchor = next;
    rendered += 1;
  }
  return rendered;
}

describe("paceFrame", () => {
  it("renders every refresh when uncapped", () => {
    expect(run(144, 0, 1)).toBe(144);
  });

  it("holds the cap on a faster display without drifting low", () => {
    expect(run(144, 60, 10)).toBeGreaterThanOrEqual(595);
    expect(run(144, 60, 10)).toBeLessThanOrEqual(601);
    expect(run(240, 30, 10)).toBeGreaterThanOrEqual(298);
  });

  it("never skips when the cap matches the display", () => {
    expect(run(60, 60, 2)).toBe(120);
  });

  it("re-anchors after a long stall instead of bursting", () => {
    expect(paceFrame(5000, 0, 60)).toBe(5000);
  });
});

describe("readFrameRateLimit", () => {
  it("maps display and junk to 0 and numbers to fps", () => {
    const store = (value: unknown) => ({ get: <T,>(_id: string, _fallback: T) => value as T });
    expect(readFrameRateLimit(store("display"))).toBe(0);
    expect(readFrameRateLimit(store("nope"))).toBe(0);
    expect(readFrameRateLimit(store("120"))).toBe(120);
  });

  it("applies a stored numeric cap read through the display fallback", () => {
    const store = createSettingsStore(null);
    store.set(SETTING_IDS.graphicsFrameRateLimit, 60);
    expect(readFrameRateLimit(store)).toBe(60);
  });
});

describe("desktop frame rate", () => {
  const desktop = (running: "vsync" | "uncapped", forced = false) => ({ __JG_DESKTOP__: { frameRate: { running, saved: running, forced } } });

  it("offers Uncapped only on a desktop build and says which choice waits for a restart", () => {
    expect(frameRateLimitOptions(null).map((option) => option.value)).not.toContain(FRAME_RATE_LIMIT_UNCAPPED);
    const vsync = frameRateLimitOptions(readDesktopShell(desktop("vsync"))?.frameRate ?? null);
    expect(vsync[0]).toEqual({ value: "display", label: "Match display (V-Sync)" });
    expect(vsync.at(-1)).toEqual({ value: "uncapped", label: "Uncapped (after restart)" });
    const uncapped = frameRateLimitOptions(readDesktopShell(desktop("uncapped"))?.frameRate ?? null);
    expect(uncapped[0]?.label).toBe("Match display (V-Sync) (after restart)");
    expect(uncapped.at(-1)?.label).toBe("Uncapped");
    expect(frameRateLimitOptions(readDesktopShell(desktop("uncapped", true))?.frameRate ?? null)[0]?.label).toBe("Match display (V-Sync) (not while --uncapped)");
  });

  it("an uncapped choice renders every frame and saves uncapped to the shell; every other choice saves vsync", async () => {
    const store = createSettingsStore(null);
    store.set(SETTING_IDS.graphicsFrameRateLimit, FRAME_RATE_LIMIT_UNCAPPED);
    expect(readFrameRateLimit(store)).toBe(0);
    const calls: unknown[][] = [];
    const scope = { __TAURI_INTERNALS__: { invoke: (...args: unknown[]) => { calls.push(args); return Promise.resolve(); } } };
    expect(await saveDesktopFrameRate("uncapped", scope)).toBe(true);
    expect(await saveDesktopFrameRate("60", scope)).toBe(true);
    expect(calls).toEqual([["set_frame_rate", { mode: "uncapped" }], ["set_frame_rate", { mode: "vsync" }]]);
    expect(await saveDesktopFrameRate("uncapped", {})).toBe(false);
  });
});
