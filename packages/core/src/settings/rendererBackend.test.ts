import { describe, expect, test } from "bun:test";
import { DEFAULT_RENDERER_BACKEND, parseRendererBackend, readRendererBackend, withRendererBackendOverride } from "./rendererBackend";
import { createSettingsStore, SETTING_IDS } from "./settingsModel";

function memoryStore() {
  const data = new Map<string, string>();
  return createSettingsStore({ getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) });
}

describe("renderer backend setting", () => {
  test("parses only the backends that exist", () => {
    expect(parseRendererBackend("webgpu")).toBe("webgpu");
    expect(parseRendererBackend("webgl")).toBe("webgl");
    expect(parseRendererBackend("vulkan")).toBeNull();
    expect(parseRendererBackend(null)).toBeNull();
  });

  test("an unset or unknown stored value reads as the default", () => {
    const store = memoryStore();
    expect(readRendererBackend(store)).toBe(DEFAULT_RENDERER_BACKEND);
    store.set(SETTING_IDS.graphicsRenderer, "glide");
    expect(readRendererBackend(store)).toBe(DEFAULT_RENDERER_BACKEND);
    store.set(SETTING_IDS.graphicsRenderer, "webgpu");
    expect(readRendererBackend(store)).toBe("webgpu");
  });

  test("a page override reads as pinned without being stored, until the player picks one", () => {
    const store = memoryStore();
    const pinned = withRendererBackendOverride(store, "webgpu");
    expect(readRendererBackend(pinned)).toBe("webgpu");
    expect(readRendererBackend(store)).toBe("webgl");
    pinned.set(SETTING_IDS.graphicsRenderer, "webgl");
    expect(readRendererBackend(pinned)).toBe("webgl");
    expect(readRendererBackend(store)).toBe("webgl");
  });
});
