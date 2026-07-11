import type { GameContext } from "../runtime/gameContext";
import { createObservableKeyedStore } from "../store/observableKeyedStore";

export type SettingValue = number | boolean | string;
export type SettingKind = "slider" | "toggle" | "select";
export type SettingCategory = "sound" | "graphics" | "gameplay" | "controls";

export interface SettingOption {
  value: string;
  label: string;
}

/** Extra setting a game appends to a built-in category via `defineGame({ settings: { extra } })`. */
export interface GameSettingDef {
  id: string;
  label: string;
  category: SettingCategory;
  kind: SettingKind;
  default: SettingValue;
  /** Slider bounds — always pass both for a `slider`; omitted defaults (0..1) collapse the thumb. */
  min?: number;
  max?: number;
  step?: number;
  options?: readonly SettingOption[];
  /** Applies the new value to game state; the value is already persisted before this runs. */
  onChange?: (value: SettingValue, ctx: GameContext) => void;
}

export type SettingsSurface = "menu" | "quick";

export interface GameSettingsConfig {
  /** `menu` (default) auto-mounts a gear + full settings menu; `quick` shows compact on-screen volume/graphics buttons; `false` disables the auto UI entirely. */
  surface?: SettingsSurface | false;
  /** `overlay` (default) opens over the current screen; `page` is full-screen navigation. */
  mode?: "overlay" | "page";
  /** Rows appended to the built-in categories. */
  extra?: readonly GameSettingDef[];
  /** Built-in categories to hide. */
  hide?: readonly SettingCategory[];
}

export const SETTINGS_STORAGE_PREFIX = "jgengine:setting:";

export const SETTING_IDS = {
  masterVolume: "sound.master",
  graphicsQuality: "graphics.quality",
  graphicsShadows: "graphics.shadows",
} as const;

export type GraphicsQuality = "low" | "medium" | "high";

export const GRAPHICS_QUALITY_OPTIONS: readonly SettingOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export const DEFAULT_MASTER_VOLUME = 1;
export const DEFAULT_GRAPHICS_QUALITY: GraphicsQuality = "high";
export const DEFAULT_GRAPHICS_SHADOWS = true;

/** Device-pixel-ratio ceiling per quality tier — the shell's `Canvas` dpr cap. */
export const GRAPHICS_QUALITY_DPR: Record<GraphicsQuality, number> = {
  low: 1,
  medium: 1.5,
  high: 2,
};

export function busVolumeSettingId(busId: string): string {
  return `sound.bus.${busId}`;
}

export function settingStorageKey(id: string): string {
  return `${SETTINGS_STORAGE_PREFIX}${id}`;
}

interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): Pick<WebStorageLike, "getItem" | "setItem"> | null {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      return (globalThis as { localStorage?: WebStorageLike }).localStorage ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

function coerce<T extends SettingValue>(raw: unknown, fallback: T): T {
  if (typeof fallback === "number") {
    const n = typeof raw === "number" ? raw : Number(raw);
    return (Number.isFinite(n) ? n : fallback) as T;
  }
  if (typeof fallback === "boolean") {
    if (typeof raw === "boolean") return raw as T;
    return (raw === "true" ? true : raw === "false" ? false : fallback) as T;
  }
  return (typeof raw === "string" ? raw : fallback) as T;
}

export function loadSettingValue<T extends SettingValue>(
  id: string,
  fallback: T,
  storage: Pick<WebStorageLike, "getItem"> | null | undefined = defaultStorage(),
): T {
  if (storage == null) return fallback;
  try {
    const raw = storage.getItem(settingStorageKey(id));
    if (raw === null) return fallback;
    return coerce(JSON.parse(raw), fallback);
  } catch {
    return fallback;
  }
}

export function saveSettingValue(
  id: string,
  value: SettingValue,
  storage: Pick<WebStorageLike, "setItem"> | null | undefined = defaultStorage(),
): void {
  if (storage == null) return;
  try {
    storage.setItem(settingStorageKey(id), JSON.stringify(value));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

export interface SettingsStore {
  get<T extends SettingValue>(id: string, fallback: T): T;
  set(id: string, value: SettingValue): void;
  subscribe(listener: () => void): () => void;
}

/** Reactive, localStorage-backed settings store shared by the shell wiring and React hooks. */
export function createSettingsStore(
  storage: Pick<WebStorageLike, "getItem" | "setItem"> | null | undefined = defaultStorage(),
): SettingsStore {
  const mem = createObservableKeyedStore<SettingValue>();
  return {
    get(id, fallback) {
      if (mem.has(id)) return coerce(mem.get(id), fallback);
      return loadSettingValue(id, fallback, storage ?? undefined);
    },
    set(id, value) {
      saveSettingValue(id, value, storage ?? undefined);
      mem.set(id, value);
    },
    subscribe: mem.subscribe,
  };
}
