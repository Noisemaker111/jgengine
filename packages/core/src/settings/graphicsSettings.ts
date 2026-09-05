import { resolveGraphicsProfile, type GraphicsProfile } from "./graphicsProfile";
import {
  DEFAULT_GRAPHICS_QUALITY,
  GRAPHICS_QUALITY_OPTIONS,
  SETTING_IDS,
  type GraphicsQuality,
  type SettingsStore,
} from "./settingsModel";

/** The post-processing stages a player can toggle individually on top of the quality tier. */
export type GraphicsPostStage = keyof GraphicsProfile["postStages"];

/** Ordered stage list used to build settings rows. */
export const GRAPHICS_POST_STAGES: readonly GraphicsPostStage[] = ["ao", "bloom", "dof", "smaa"];

/** Player-facing labels for each post stage. */
export const GRAPHICS_POST_STAGE_LABELS: Record<GraphicsPostStage, string> = {
  ao: "Ambient occlusion",
  bloom: "Bloom",
  dof: "Depth of field",
  smaa: "Anti-aliasing (SMAA)",
};

/** Setting id that stores one stage toggle (`graphics.post.<stage>`). */
export function graphicsPostStageSettingId(stage: GraphicsPostStage): string {
  return `graphics.post.${stage}`;
}

/** Lowest player render scale; the value is the device-pixel-ratio cap handed to the canvas. */
export const RENDER_SCALE_MIN = 0.5;
/** Highest player render scale. */
export const RENDER_SCALE_MAX = 2;
/** Render-scale slider increment. */
export const RENDER_SCALE_STEP = 0.05;

/** Per-tier profile overrides a game authors with `defineGame({ graphics })`. */
export type GraphicsProfileOverrides = Partial<Record<GraphicsQuality, Partial<GraphicsProfile>>>;

/** The resolved player graphics choice: the tier plus the profile after per-stage and render-scale overrides. */
export interface GraphicsSettingsState {
  quality: GraphicsQuality;
  profile: GraphicsProfile;
}

const QUALITY_VALUES = new Set(GRAPHICS_QUALITY_OPTIONS.map((option) => option.value));

function isGraphicsQuality(value: unknown): value is GraphicsQuality {
  return typeof value === "string" && QUALITY_VALUES.has(value);
}

function clampRenderScale(value: number): number {
  return Math.min(RENDER_SCALE_MAX, Math.max(RENDER_SCALE_MIN, value));
}

/** The stored quality tier, falling back to the default when the value is missing or unknown. */
export function readGraphicsQuality(store: Pick<SettingsStore, "get">): GraphicsQuality {
  const raw = store.get(SETTING_IDS.graphicsQuality, DEFAULT_GRAPHICS_QUALITY);
  return isGraphicsQuality(raw) ? raw : DEFAULT_GRAPHICS_QUALITY;
}

/**
 * Resolve the player's graphics state from a settings store. The tier profile (with the game's
 * overrides) supplies every default; a stored render scale or stage toggle replaces its field.
 */
export function readGraphicsSettings(
  store: Pick<SettingsStore, "get">,
  overrides?: GraphicsProfileOverrides,
): GraphicsSettingsState {
  const quality = readGraphicsQuality(store);
  const tier = resolveGraphicsProfile(quality, overrides?.[quality]);
  const postStages = { ...tier.postStages };
  for (const stage of GRAPHICS_POST_STAGES) {
    postStages[stage] = store.get(graphicsPostStageSettingId(stage), tier.postStages[stage]);
  }
  return {
    quality,
    profile: {
      ...tier,
      renderScale: clampRenderScale(store.get(SETTING_IDS.graphicsRenderScale, tier.renderScale)),
      postStages,
    },
  };
}

/**
 * Select a quality tier and re-apply its render scale and stage defaults, so picking a preset
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
  for (const stage of GRAPHICS_POST_STAGES) {
    store.set(graphicsPostStageSettingId(stage), tier.postStages[stage]);
  }
  return tier;
}
