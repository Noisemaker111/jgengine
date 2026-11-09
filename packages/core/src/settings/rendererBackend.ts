import { SETTING_IDS, type SettingOption, type SettingsStore } from "./settingsModel";

/**
 * Which GPU API draws the game. Both draw the same scene with the same shaders: `webgpu` runs
 * three's WebGL renderer on a WebGPU device (`@jgengine/core/webgpu`) and falls back to `webgl`
 * where the browser has no WebGPU.
 */
export type RendererBackend = "webgl" | "webgpu";

export const DEFAULT_RENDERER_BACKEND: RendererBackend = "webgl";

export const RENDERER_BACKEND_OPTIONS: readonly SettingOption[] = [
  { value: "webgl", label: "WebGL" },
  // Draws the same image as WebGL but is not yet faster on any game (#3066 tracks the work).
  { value: "webgpu", label: "WebGPU (preview)" },
];

/** A backend name from a URL or stored value, or `null` when it names none. */
export function parseRendererBackend(raw: unknown): RendererBackend | null {
  return raw === "webgl" || raw === "webgpu" ? raw : null;
}

/** The player's stored backend, falling back to the default when missing or unknown. */
export function readRendererBackend(store: Pick<SettingsStore, "get">): RendererBackend {
  return parseRendererBackend(store.get(SETTING_IDS.graphicsRenderer, DEFAULT_RENDERER_BACKEND)) ?? DEFAULT_RENDERER_BACKEND;
}

/**
 * Wrap a settings store so the backend reads as `backend` for this page only (`?renderer=webgpu`
 * in perf runs and captures); nothing is persisted until the player picks one.
 */
export function withRendererBackendOverride(store: SettingsStore, backend: RendererBackend): SettingsStore {
  let pinned = true;
  return {
    get(id, fallback) {
      return pinned && id === SETTING_IDS.graphicsRenderer ? (backend as typeof fallback) : store.get(id, fallback);
    },
    set(id, value) {
      if (id === SETTING_IDS.graphicsRenderer) pinned = false;
      store.set(id, value);
    },
    subscribe: store.subscribe,
  };
}
