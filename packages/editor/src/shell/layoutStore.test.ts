import { afterEach, expect, test } from "bun:test";

import {
  createShellLayoutStore,
  DEFAULT_LAYOUT,
  LAYOUT_LIMITS,
  LAYOUT_PERSIST_DELAY_MS,
  normalizeLayout,
} from "./layoutStore";

function installMemoryStorage(): Map<string, string> {
  const backing = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, value),
    removeItem: (key: string) => void backing.delete(key),
  };
  return backing;
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

test("normalizeLayout falls back to defaults on garbage", () => {
  expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
  expect(normalizeLayout("nope")).toEqual(DEFAULT_LAYOUT);
  expect(normalizeLayout({ workspace: "bogus", leftWidth: "wide", bottomTab: 3 })).toEqual(DEFAULT_LAYOUT);
});

test("normalizeLayout clamps sizes and keeps valid unions", () => {
  const restored = normalizeLayout({
    workspace: "terrain",
    leftWidth: 10_000,
    rightWidth: 1,
    bottomHeight: 300,
    bottomTab: "profiler",
    browserView: "list",
    collapsed: { transform: true, junk: "x" },
  });
  expect(restored.workspace).toBe("terrain");
  expect(restored.leftWidth).toBe(LAYOUT_LIMITS.leftWidth.max);
  expect(restored.rightWidth).toBe(LAYOUT_LIMITS.rightWidth.min);
  expect(restored.bottomHeight).toBe(300);
  expect(restored.bottomTab).toBe("profiler");
  expect(restored.browserView).toBe("list");
  expect(restored.collapsed).toEqual({ transform: true });
});

test("resize applies clamped deltas and ignores no-ops", () => {
  const store = createShellLayoutStore("test-game");
  let notified = 0;
  store.subscribe(() => (notified += 1));
  store.resize("leftWidth", 40);
  expect(store.getState().leftWidth).toBe(DEFAULT_LAYOUT.leftWidth + 40);
  store.resize("leftWidth", 100_000);
  expect(store.getState().leftWidth).toBe(LAYOUT_LIMITS.leftWidth.max);
  const before = notified;
  store.resize("leftWidth", 50);
  expect(notified).toBe(before);
});

test("setWorkspace opens the workspace's home panel", () => {
  const store = createShellLayoutStore("test-game");
  store.patch({ leftOpen: false, bottomOpen: false, leftPage: "prefabs", bottomTab: "console" });
  store.setWorkspace("scene");
  expect(store.getState().leftOpen).toBe(true);
  expect(store.getState().leftPage).toBe("hierarchy");
  store.setWorkspace("assets");
  expect(store.getState().bottomOpen).toBe(true);
  expect(store.getState().bottomTab).toBe("content");
  store.setWorkspace("ai");
  expect(store.getState().bottomTab).toBe("assistant");
  store.patch({ leftOpen: false });
  store.setWorkspace("multiplayer");
  expect(store.getState().workspace).toBe("multiplayer");
  expect(store.getState().leftOpen).toBe(true);
  store.patch({ leftOpen: false, rightOpen: false, inspectorTab: "inspector" });
  store.setWorkspace("materials");
  expect(store.getState().leftOpen).toBe(true);
  expect(store.getState().rightOpen).toBe(true);
  expect(store.getState().inspectorTab).toBe("materials");
  expect(store.getState().workspace).toBe("materials");
});

test("toggleSection flips per-section collapse state", () => {
  const store = createShellLayoutStore("test-game");
  expect(store.getState().collapsed["transform"]).toBeUndefined();
  store.toggleSection("transform");
  expect(store.getState().collapsed["transform"]).toBe(true);
  store.toggleSection("transform");
  expect(store.getState().collapsed["transform"]).toBe(false);
});

test("layout persists (throttled) and restores per game", async () => {
  const backing = installMemoryStorage();
  const store = createShellLayoutStore("persist-game");
  store.patch({ bottomTab: "profiler", rightWidth: 340, rightOpen: false });
  await new Promise((resolve) => setTimeout(resolve, LAYOUT_PERSIST_DELAY_MS + 50));
  expect(backing.get("jgeditor:shell:persist-game")).toBeDefined();

  const restored = createShellLayoutStore("persist-game");
  expect(restored.getState().bottomTab).toBe("profiler");
  expect(restored.getState().rightWidth).toBe(340);
  expect(restored.getState().rightOpen).toBe(false);

  const other = createShellLayoutStore("other-game");
  expect(other.getState().bottomTab).toBe(DEFAULT_LAYOUT.bottomTab);
});

test("reset restores defaults", () => {
  const store = createShellLayoutStore("test-game");
  store.patch({ leftOpen: false, bottomHeight: 400, workspace: "assets" });
  store.reset();
  expect(store.getState()).toEqual(DEFAULT_LAYOUT);
});
