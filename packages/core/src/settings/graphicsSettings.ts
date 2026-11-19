import { clamp } from "../math/scalar";
import { resolveGraphicsProfile, type GraphicsProfile } from "./graphicsProfile";
import {
  asSettingType,
  DEFAULT_GRAPHICS_QUALITY,
  GRAPHICS_QUALITY_OPTIONS,
  SETTING_IDS,
  type GraphicsQuality,
  type SettingValue,
  type SettingsStore,
} from "./settingsModel";
export type GraphicsPostStage = keyof GraphicsProfile["postStages"];

export const GRAPHICS_POST_STAGES: readonly GraphicsPostStage[] = ["ao", "bloom", "dof", "smaa", "ssr", "fog", "motionBlur"];

export const GRAPHICS_POST_STAGE_LABELS: Record<GraphicsPostStage, string> = {
  ao: "Ambient occlusion",
  bloom: "Bloom",
  dof: "Depth of field",
  smaa: "Anti-aliasing",
  ssr: "Screen-space reflections",
  fog: "Volumetric fog",
  motionBlur: "Motion blur",
};

export function graphicsPostStageSettingId(stage: GraphicsPostStage): string {
  return `graphics.post.${stage}`;
}

/** Lowest player render scale; the value is the device-pixel-ratio cap handed to the canvas. */
export const RENDER_SCALE_MIN = 0.5;
export const RENDER_SCALE_MAX = 2;
export const RENDER_SCALE_STEP = 0.05;

export const ANISOTROPY_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "1", label: "Off" },
  { value: "2", label: "2x" },
  { value: "4", label: "4x" },
  { value: "8", label: "8x" },
  { value: "16", label: "16x" },
];

const ANISOTROPY_VALUES: readonly GraphicsProfile["anisotropy"][] = [1, 2, 4, 8, 16];

function toAnisotropy(raw: unknown, fallback: GraphicsProfile["anisotropy"]): GraphicsProfile["anisotropy"] {
  const value = Number(raw);
  return ANISOTROPY_VALUES.find((option) => option === value) ?? fallback;
}

export type GraphicsProfileOverrides = Partial<Record<GraphicsQuality, Partial<GraphicsProfile>>>;

export interface GraphicsSettingsState {
  quality: GraphicsQuality;
  auto: boolean;
  profile: GraphicsProfile;
}

const QUALITY_VALUES = new Set(GRAPHICS_QUALITY_OPTIONS.map((option) => option.value));

function isGraphicsQuality(value: unknown): value is GraphicsQuality {
  return typeof value === "string" && QUALITY_VALUES.has(value);
}

export function readGraphicsQuality(store: Pick<SettingsStore, "get">): GraphicsQuality {
  const raw = store.get(SETTING_IDS.graphicsQuality, DEFAULT_GRAPHICS_QUALITY);
  return isGraphicsQuality(raw) ? raw : DEFAULT_GRAPHICS_QUALITY;
}

export function readGraphicsSettings(
  store: Pick<SettingsStore, "get">,
  overrides?: GraphicsProfileOverrides,
  autoDefault = false,
): GraphicsSettingsState {
  const quality = readGraphicsQuality(store);
  const tier = resolveGraphicsProfile(quality, overrides?.[quality]);
  const postStages = { ...tier.postStages };
  for (const stage of GRAPHICS_POST_STAGES) {
    postStages[stage] = store.get(graphicsPostStageSettingId(stage), tier.postStages[stage]);
  }
  return {
    quality,
    auto: store.get(SETTING_IDS.graphicsAuto, autoDefault),
    profile: {
      ...tier,
      renderScale: clamp(store.get(SETTING_IDS.graphicsRenderScale, tier.renderScale), RENDER_SCALE_MIN, RENDER_SCALE_MAX),
      anisotropy: toAnisotropy(store.get(SETTING_IDS.graphicsAnisotropy, String(tier.anisotropy)), tier.anisotropy),
      postStages,
      softShadows: store.get(SETTING_IDS.graphicsSoftShadows, tier.softShadows),
    },
  };
}

/**
 * Select a quality tier and re-apply its render scale, texture filtering and stage defaults, so picking a preset
 * resets the individual overrides instead of leaving stale toggles behind.
 */
export function applyGraphicsQuality(
  store: Pick<SettingsStore, "set">,
  quality: GraphicsQuality,
  overrides?: GraphicsProfileOverrides,
): GraphicsProfile {
  const tier = resolveGraphicsProfile(quality, overrides?.[quality]);
  store.set(SETTING_IDS.graphicsQuality, quality);
  store.set(SETTING_IDS.graphicsRenderScale, tier.renderScale);
  store.set(SETTING_IDS.graphicsAnisotropy, String(tier.anisotropy));
  store.set(SETTING_IDS.graphicsSoftShadows, tier.softShadows);
  for (const stage of GRAPHICS_POST_STAGES) {
    store.set(graphicsPostStageSettingId(stage), tier.postStages[stage]);
  }
  return tier;
}

/**
 * Wrap a settings store so the graphics tier reads as `quality` for this session only: every
 * graphics field resolves from that tier until the player changes it, and nothing is persisted.
 * Auto quality is off while the tier is pinned, so a slow game cannot move off the tier it was asked for.
 * Capture hosts use it (`?quality=low`) to render cheap iteration shots without leaving the
 * draft tier in the browser profile for the next full-quality shot.
 */
export function withGraphicsQualityOverride(
  store: SettingsStore,
  quality: GraphicsQuality,
  overrides?: GraphicsProfileOverrides,
): SettingsStore {
  const tier = resolveGraphicsProfile(quality, overrides?.[quality]);
  const pinned = new Map<string, SettingValue>([
    [SETTING_IDS.graphicsQuality, quality],
    [SETTING_IDS.graphicsAuto, false],
    [SETTING_IDS.graphicsRenderScale, tier.renderScale],
    [SETTING_IDS.graphicsAnisotropy, String(tier.anisotropy)],
    [SETTING_IDS.graphicsSoftShadows, tier.softShadows],
    ...GRAPHICS_POST_STAGES.map((stage): [string, SettingValue] => [graphicsPostStageSettingId(stage), tier.postStages[stage]]),
  ]);
  return {
    get(id, fallback) {
      const pinnedValue = pinned.get(id);
      return pinnedValue === undefined ? store.get(id, fallback) : asSettingType(id, pinnedValue, fallback);
    },
    set(id, value) {
      pinned.delete(id);
      store.set(id, value);
    },
    subscribe: store.subscribe,
  };
}

/** Parse a `?quality=` value into a graphics tier, or null when absent or unknown. */
export function parseGraphicsQuality(raw: string | null | undefined): GraphicsQuality | null {
  return isGraphicsQuality(raw) ? raw : null;
}

/**
 * Move the tier for auto quality. Only fields still equal to the tier being left follow the move; a render scale,
 * filter or effect toggle the player changed keeps its value, so auto never undoes a manual choice.
 */
export function applyAutoGraphicsTier(
  store: Pick<SettingsStore, "get" | "set">,
  to: GraphicsQuality,
  overrides?: GraphicsProfileOverrides,
): void {
  const from = readGraphicsQuality(store);
  if (from === to) return;
  const before = resolveGraphicsProfile(from, overrides?.[from]);
  const after = resolveGraphicsProfile(to, overrides?.[to]);
  store.set(SETTING_IDS.graphicsQuality, to);
  const follow = <T extends SettingValue>(id: string, was: T, next: T): void => {
    if (store.get(id, was) === was) store.set(id, next);
  };
  follow(SETTING_IDS.graphicsRenderScale, before.renderScale, after.renderScale);
  follow(SETTING_IDS.graphicsAnisotropy, String(before.anisotropy), String(after.anisotropy));
  follow(SETTING_IDS.graphicsSoftShadows, before.softShadows, after.softShadows);
  for (const stage of GRAPHICS_POST_STAGES) {
    follow(graphicsPostStageSettingId(stage), before.postStages[stage], after.postStages[stage]);
  }
}
