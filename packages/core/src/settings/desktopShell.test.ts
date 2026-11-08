import { describe, expect, it } from "bun:test";

import { readDesktopShell, saveDesktopDisplayMode, syncDesktopSettings } from "./desktopShell";
import { createSettingsStore, SETTING_IDS } from "./settingsModel";

describe("desktop shell", () => {
  it("is null in a browser and read from the launch state a desktop build injects", () => {
    expect(readDesktopShell({})).toBeNull();
    expect(readDesktopShell({ __JG_DESKTOP__: { frameRate: { running: "fast", saved: "vsync" } } })).toBeNull();
    expect(readDesktopShell({ __JG_DESKTOP__: { frameRate: { running: "uncapped", saved: "vsync", forced: true }, fullscreen: true, steamOverlay: true } })).toEqual({
      frameRate: { running: "uncapped", saved: "vsync", forced: true },
      fullscreen: true,
      steamOverlay: true,
    });
  });

  it("switches fullscreen through the shell, and does nothing outside a desktop build", async () => {
    const calls: unknown[][] = [];
    const scope = { __TAURI_INTERNALS__: { invoke: (...args: unknown[]) => { calls.push(args); return Promise.resolve(); } } };
    expect(await saveDesktopDisplayMode("fullscreen", scope)).toBe(true);
    expect(await saveDesktopDisplayMode("windowed", scope)).toBe(true);
    expect(calls).toEqual([["set_fullscreen", { fullscreen: true }], ["set_fullscreen", { fullscreen: false }]]);
    expect(await saveDesktopDisplayMode("fullscreen", {})).toBe(false);
  });

  it("brings a stored choice the launch did not use back to what the shell launched with", () => {
    const store = createSettingsStore(null);
    store.set(SETTING_IDS.graphicsFrameRateLimit, "uncapped");
    store.set(SETTING_IDS.graphicsDisplayMode, "fullscreen");
    syncDesktopSettings(store, { frameRate: { running: "vsync", saved: "vsync", forced: false }, fullscreen: false, steamOverlay: false });
    expect(store.get(SETTING_IDS.graphicsFrameRateLimit, "")).toBe("display");
    expect(store.get(SETTING_IDS.graphicsDisplayMode, "")).toBe("windowed");
    store.set(SETTING_IDS.graphicsFrameRateLimit, "60");
    syncDesktopSettings(store, { frameRate: { running: "uncapped", saved: "vsync", forced: true }, fullscreen: false, steamOverlay: false });
    expect(store.get(SETTING_IDS.graphicsFrameRateLimit, "")).toBe("60");
    syncDesktopSettings(store, { frameRate: { running: "uncapped", saved: "uncapped", forced: false }, fullscreen: true, steamOverlay: false });
    expect(store.get(SETTING_IDS.graphicsFrameRateLimit, "")).toBe("uncapped");
    expect(store.get(SETTING_IDS.graphicsDisplayMode, "")).toBe("fullscreen");
  });
});
