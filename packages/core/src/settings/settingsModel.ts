import type { GameContext } from "../runtime/gameContext";
import { createObservableKeyedStore } from "../store/observableKeyedStore";

export type SettingValue = number | boolean | string;
export type SettingKind = "slider" | "toggle" | "select";

export type BuiltInSettingCategory = "sound" | "graphics" | "gameplay" | "controls" | "accessibility";
/** Built-in category ids keep autocomplete; any other string makes a fresh category. */
export type SettingCategory = BuiltInSettingCategory | (string & {});

export const BUILT_IN_SETTING_CATEGORIES: readonly BuiltInSettingCategory[] = [
  "sound",
  "graphics",
  "gameplay",
  "accessibility",
  "controls",
];

export interface SettingOption {
  value: string;
  label: string;
}

/** Declares or relabels/reorders a category tab; use it for a custom category or to reshape the built-ins. */
export interface SettingCategoryDef {
  id: SettingCategory;
  label: string;
  order?: number;
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

/** `quick` shows compact on-screen volume/graphics buttons; `false` (default) mounts no engine trigger — open the menu from your own UI with `<SettingsTrigger>` or `useSettings().open()`. */
export type SettingsSurface = "quick";

/** The four themed settings layouts, chosen with `defineGame({ settings: { variant } })`. All read the game's `--jg-*` theme tokens. */
export type SettingsVariant = "panel" | "sheet" | "sidebar" | "fullscreen";

/** A game-state action (Restart, Quit to menu, …) shown as rows in the first "Game" settings tab — never a floating button or a rebindable key. */
export interface SettingsActionDef {
  id: string;
  label: string;
  /** `danger` styles destructive actions (restart, quit) apart from neutral ones. */
  kind?: "default" | "danger";
  /** Optional one-line hint under the label. */
  description?: string;
  /** Runs the action; the menu closes right after. */
  run: (ctx: GameContext) => void;
}

export interface GameSettingsConfig {
  /** Layout + skin of the menu; all four theme off `--jg-*`. Default `panel`. */
  variant?: SettingsVariant;
  /** `quick` shows compact on-screen volume/graphics buttons; omitted mounts no engine trigger — open the menu yourself with `<SettingsTrigger>` / `useSettings().open()`, or render `useSettings().categories` your own way. */
  surface?: SettingsSurface | false;
  /** Rows appended to any category — built-in or a brand-new one named by `category`. */
  extra?: readonly GameSettingDef[];
  /** Declare custom category tabs, or relabel/reorder the built-ins. */
  categories?: readonly SettingCategoryDef[];
  /** Built-in categories to hide. */
  hide?: readonly SettingCategory[];
  /** Game-state actions (Restart, Quit…) — become the first "Game" tab, shown before anything else. */
  actions?: readonly SettingsActionDef[];
  /** Input actions to drop from the rebindable Controls list — game-state keys like `restart` that belong in `actions`, not the rebind grid. */
  hideBindings?: readonly string[];
}

export const SETTINGS_STORAGE_PREFIX = "jgengine:setting:";

export const SETTING_IDS = {
  masterVolume: "sound.master",
  graphicsQuality: "graphics.quality",
  graphicsShadows: "graphics.shadows",
  graphicsUiScale: "graphics.uiScale",
  graphicsRenderScale: "graphics.renderScale",
  graphicsPostAo: "graphics.post.ao",
  graphicsPostBloom: "graphics.post.bloom",
  graphicsPostDof: "graphics.post.dof",
  graphicsPostSmaa: "graphics.post.smaa",
  graphicsFrameRateLimit: "graphics.frameRateLimit",
  graphicsAnisotropy: "graphics.anisotropy",
  graphicsShowFps: "graphics.showFps",
  touchStyle: "controls.touchStyle",
  touchJoystick: "controls.touchJoystick",
} as const;

export type GraphicsQuality = "low" | "medium" | "high" | "ultra";

export const GRAPHICS_QUALITY_OPTIONS: readonly SettingOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "ultra", label: "Ultra" },
];

export const DEFAULT_MASTER_VOLUME = 1;
export const DEFAULT_GRAPHICS_QUALITY: GraphicsQuality = "high";
export const DEFAULT_GRAPHICS_SHADOWS = true;

/** Player-controlled multiplier on the HUD's computed fit scale — one lever on desktop and mobile alike. */
export const DEFAULT_UI_SCALE = 1;
export const UI_SCALE_MIN = 0.5;
export const UI_SCALE_MAX = 1.5;

/** Device-pixel-ratio ceiling per quality tier — the shell's `Canvas` dpr cap. */
export const GRAPHICS_QUALITY_DPR: Record<GraphicsQuality, number> = {
  low: 1,
  medium: 1.5,
  high: 2,
  ultra: 2,
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

/** A stored setting holds a value the read asked for as another type, so no honest value exists. */
export class SettingsTypeError extends Error {
  readonly settingId: string;
  readonly storedType: string;
  readonly fallbackType: string;

  constructor(settingId: string, storedType: string, fallbackType: string) {
    super(`Setting "${settingId}" stores ${storedType} but was read as ${fallbackType}.`);
    this.name = "SettingsTypeError";
    this.settingId = settingId;
    this.storedType = storedType;
    this.fallbackType = fallbackType;
  }
}

function storedTypeName(raw: unknown): string {
  if (raw === null) return "null";
  if (Array.isArray(raw)) return "array";
  return typeof raw;
}

/**
 * Read a stored value as the type the caller asked for. A value of another primitive type converts
 * when the result is the same value in the asked-for type (a number as its digits, a boolean as
 * `"true"`/`"false"`); otherwise it throws {@link SettingsTypeError}, naming the key and both types,
 * instead of handing back the fallback as if nothing were stored.
 */
export function asSettingType<T extends SettingValue>(id: string, stored: unknown, fallback: T): T {
  const wanted = typeof fallback as "number" | "string" | "boolean";
  const storedType = storedTypeName(stored);
  if (storedType === wanted) {
    if (wanted === "number" && !Number.isFinite(stored)) {
      throw new SettingsTypeError(id, storedType, wanted);
    }
    return stored as T;
  }
  if (wanted === "number" && storedType === "string") {
    const text = (stored as string).trim();
    const parsed = text === "" ? Number.NaN : Number(text);
    if (Number.isFinite(parsed)) return parsed as T;
  } else if (wanted === "string" && (storedType === "number" || storedType === "boolean")) {
    return String(stored) as T;
  } else if (wanted === "boolean" && storedType === "string" && (stored === "true" || stored === "false")) {
    return (stored === "true") as T;
  }
  throw new SettingsTypeError(id, storedType, wanted);
}

/**
 * Read one persisted setting as `fallback`'s type. An absent or unreadable cell yields the
 * fallback; a stored value of an incompatible type throws {@link SettingsTypeError}.
 */
export function loadSettingValue<T extends SettingValue>(
  id: string,
  fallback: T,
  storage: Pick<WebStorageLike, "getItem"> | null | undefined = defaultStorage(),
): T {
  if (storage == null) return fallback;
  let raw: string | null;
  try {
    raw = storage.getItem(settingStorageKey(id));
  } catch {
    return fallback;
  }
  if (raw === null) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (parsed === null) return fallback;
  return asSettingType(id, parsed, fallback);
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
      const stored = mem.get(id);
      if (stored !== undefined) return asSettingType(id, stored, fallback);
      return loadSettingValue(id, fallback, storage ?? undefined);
    },
    set(id, value) {
      saveSettingValue(id, value, storage ?? undefined);
      mem.set(id, value);
    },
    subscribe: mem.subscribe,
  };
}
