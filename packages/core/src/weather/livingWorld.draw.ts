import * as THREE from "three";

/**
 * The world's weather and time facts as the renderer sees them, written once per frame by
 * `LivingWorldDriver` and read by every effect that reacts to them: foliage sway, wet surfaces,
 * birds, blowing litter and steam.
 * @internal
 */
export interface LivingWorldState {
  /** Rain falling now, 0..1: the strongest active rain source. */
  rain: number;
  /** Surface wetness, 0..1. Rises while it rains and dries slowly after. */
  wetness: number;
  /** Wind across the ground, world units per second on X and Z. */
  wind: THREE.Vector2;
  /** Sun height above the horizon, -1..1; 0 at the horizon. Null when the scene has no sun. */
  sunHeight: number | null;
}

/** @internal */
export const livingWorld: LivingWorldState = { rain: 0, wetness: 0, wind: new THREE.Vector2(), sunHeight: null };

/** Shared uniform the wet-surface shader reads; one write per frame drives every patched material. @internal */
export const wetnessUniform = { value: 0 };

const rainSources = new Map<object, number>();
const windSources = new Map<object, readonly [number, number]>();

/** Report rain from one source (a rain field, a weather layer) until it is withdrawn with 0. @internal */
export function reportRain(source: object, amount: number): void {
  if (amount > 0) rainSources.set(source, Math.min(1, amount));
  else rainSources.delete(source);
}

/** Report one source's ground wind until withdrawn with null. @internal */
export function reportWind(source: object, wind: readonly [number, number] | null): void {
  if (wind === null) windSources.delete(source);
  else windSources.set(source, wind);
}

/** Seconds of steady rain until surfaces are soaked. */
export const WET_SECONDS = 14;
/** Seconds of dry weather until soaked surfaces are dry again. */
export const DRY_SECONDS = 70;
const SETTLE_SECONDS = 3;
let livingAge = 0;

function wetTarget(rain: number): number {
  return rain > 0.05 ? Math.min(1, 0.45 + rain) : 0;
}

/** One step of wetness toward the current rain. Pure, so the timing is testable. @internal */
export function stepWetness(wetness: number, rain: number, delta: number): number {
  const target = wetTarget(rain);
  if (wetness < target) return Math.min(target, wetness + delta / WET_SECONDS);
  return Math.max(target, wetness - delta / DRY_SECONDS);
}

/** Advance the shared state one frame. @internal */
export function advanceLivingWorld(delta: number, sunHeight: number | null): void {
  let rain = 0;
  for (const amount of rainSources.values()) rain = Math.max(rain, amount);
  livingWorld.rain = rain;
  // A world that opens in rain has been raining for a while: it starts soaked, not dry.
  livingAge += delta;
  livingWorld.wetness = livingAge < SETTLE_SECONDS && rain > 0.05 ? wetTarget(rain) : stepWetness(livingWorld.wetness, rain, Math.min(delta, 0.1));
  wetnessUniform.value = livingWorld.wetness;
  livingWorld.wind.set(0, 0);
  for (const [x, z] of windSources.values()) livingWorld.wind.add({ x, y: z });
  livingWorld.sunHeight = sunHeight;
}

/** Forget every reported source; for tests and world teardown. @internal */
export function resetLivingWorld(): void {
  rainSources.clear();
  windSources.clear();
  livingAge = 0;
  livingWorld.rain = 0;
  livingWorld.wetness = 0;
  livingWorld.wind.set(0, 0);
  livingWorld.sunHeight = null;
  wetnessUniform.value = 0;
}
