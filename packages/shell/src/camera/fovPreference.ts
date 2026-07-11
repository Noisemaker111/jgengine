import { CAMERA_FRUSTUM_DEFAULTS } from "@jgengine/core/game/playableGame";

export const PLAYER_FOV_DEFAULT = CAMERA_FRUSTUM_DEFAULTS.fov;
export const PLAYER_FOV_MIN = 40;
export const PLAYER_FOV_MAX = 100;
export const PLAYER_FOV_STORAGE_KEY = "jgengine:player-fov";

export interface PlayerFovBounds {
  min: number;
  max: number;
  defaultFov: number;
}

export function resolvePlayerFovBounds(options?: {
  min?: number;
  max?: number;
  default?: number;
}): PlayerFovBounds {
  const min = Number.isFinite(options?.min) ? (options!.min as number) : PLAYER_FOV_MIN;
  const max = Number.isFinite(options?.max) ? (options!.max as number) : PLAYER_FOV_MAX;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const defaultFov = clampPlayerFov(options?.default ?? PLAYER_FOV_DEFAULT, lo, hi);
  return { min: lo, max: hi, defaultFov };
}

export function clampPlayerFov(
  value: unknown,
  min: number = PLAYER_FOV_MIN,
  max: number = PLAYER_FOV_MAX,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return clampPlayerFov(PLAYER_FOV_DEFAULT, min, max);
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function loadPlayerFov(
  bounds: PlayerFovBounds = resolvePlayerFovBounds(),
  storage: Pick<Storage, "getItem"> | null | undefined = defaultStorage(),
): number {
  if (storage == null) return bounds.defaultFov;
  try {
    const raw = storage.getItem(PLAYER_FOV_STORAGE_KEY);
    if (raw === null) return bounds.defaultFov;
    return clampPlayerFov(Number(raw), bounds.min, bounds.max);
  } catch {
    return bounds.defaultFov;
  }
}

export function savePlayerFov(
  value: number,
  bounds: PlayerFovBounds = resolvePlayerFovBounds(),
  storage: Pick<Storage, "setItem"> | null | undefined = defaultStorage(),
): number {
  const next = clampPlayerFov(value, bounds.min, bounds.max);
  if (storage == null) return next;
  try {
    storage.setItem(PLAYER_FOV_STORAGE_KEY, String(next));
  } catch {
    /* ignore quota / private-mode failures */
  }
  return next;
}

/**
 * Composition model for perspective rigs:
 * - preference is the player base FOV
 * - poseFov is the rig's authored FOV (includes chase-speed modulation, ADS zoom, transitions)
 * - relative mode shifts the authored FOV by (preference − default) so mods still stack
 * - absolute mode (cinematic keyframes) keeps the authored FOV as-is
 */
export function composePlayerFov(
  preference: number,
  poseFov: number,
  mode: "relative" | "absolute" = "relative",
  bounds: PlayerFovBounds = resolvePlayerFovBounds(),
): number {
  if (mode === "absolute") return clampPlayerFov(poseFov, bounds.min, bounds.max);
  const pref = clampPlayerFov(preference, bounds.min, bounds.max);
  if (!Number.isFinite(poseFov)) return pref;
  return clampPlayerFov(pref + (poseFov - PLAYER_FOV_DEFAULT), bounds.min, bounds.max);
}

function defaultStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      return (globalThis as { localStorage?: Storage }).localStorage ?? null;
    }
  } catch {
    return null;
  }
  return null;
}
