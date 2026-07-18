import type { CatalogEntityRole } from "@jgengine/core/runtime/gameContext";
import type { PresentationEffectsConfig } from "@jgengine/core/game/playableGame";

/** Resolved world-bar / nameplate config, or `null` when the feature is off. @internal */
export interface ResolvedWorldOverlayBars {
  statId: string;
  roles?: readonly CatalogEntityRole[];
  maxDistance?: number;
}

/**
 * Normalize `worldHealthBars` / `nameplates` (`boolean | object | undefined`) into a
 * single resolved shape. `undefined` / `false` → `null` (off); `true` → default stat `"health"`;
 * object → explicit fields with `statId` defaulting to `"health"`.
 * @internal
 */
export function resolveWorldOverlayBars(
  config: boolean | { statId?: string; roles?: readonly CatalogEntityRole[]; maxDistance?: number } | undefined,
): ResolvedWorldOverlayBars | null {
  if (config === undefined || config === false) return null;
  if (config === true) return { statId: "health" };
  return {
    statId: config.statId ?? "health",
    ...(config.roles === undefined ? {} : { roles: config.roles }),
    ...(config.maxDistance === undefined ? {} : { maxDistance: config.maxDistance }),
  };
}

/** Resolved combat presentation channels (each boolean is whether that stack piece mounts). @internal */
export interface ResolvedPresentationEffects {
  telegraphs: boolean;
  vfx: boolean;
  floatText: boolean;
  tracers: boolean;
  shake: boolean;
}

const ALL_ON: ResolvedPresentationEffects = {
  telegraphs: true,
  vfx: true,
  floatText: true,
  tracers: true,
  shake: true,
};

const ALL_OFF: ResolvedPresentationEffects = {
  telegraphs: false,
  vfx: false,
  floatText: false,
  tracers: false,
  shake: false,
};

/**
 * Resolve `presentationEffects` for the 3D shell.
 * - `undefined` / `true` → all channels on (historical default).
 * - `false` → none.
 * - object → per-channel; missing keys default to on so games can disable one channel.
 * @internal
 */
export function resolvePresentationEffects(
  config: boolean | PresentationEffectsConfig | undefined,
): ResolvedPresentationEffects {
  if (config === false) return ALL_OFF;
  if (config === undefined || config === true) return ALL_ON;
  return {
    telegraphs: config.telegraphs !== false,
    vfx: config.vfx !== false,
    floatText: config.floatText !== false,
    tracers: config.tracers !== false,
    shake: config.shake !== false,
  };
}
