import { plantPow } from "./plantMath";

/** Where a plant grows, as plain numbers so it serialises and hashes. */
export interface PlantEnvironment {
  latitude: number;
  /** Open-sky fraction reaching the plant, 0..1 (0.2 under a closed canopy). */
  light: number;
  /** Plant-available soil water, 0 wilting point .. 1 field capacity. */
  soilWater: number;
  /** Soil fertility rating, 0..1. */
  nutrients: number;
  /** Added fertility, 0..1, on top of `nutrients`. */
  fertilizer: number;
  /** Annual mean air temperature, °C. */
  temperatureC: number;
  /** Half the gap between the warmest and coldest month means, °C. Defaults to 13. */
  seasonalRangeC?: number;
  /** Prevailing wind: compass direction in degrees the wind blows towards, strength 0..1. */
  wind: { dir: number; strength: number };
  slope: { dir: number; deg: number };
  /**
   * An even-aged stand around the plant; absent means open-grown. Neighbours are taken as the plant's
   * equals spaced `spacingIndex` × its own height apart (the Hart–Becking spacing index; 0.2–0.25 is a
   * fully stocked stand), so the stand thins as it grows. Their leaves shade every point by
   * Beer–Lambert over the stand's leaf area index above it (Monsi & Saeki 1953).
   */
  stand?: { spacingIndex: number };
}

/** A temperate, well-watered, fertile open site at 45° N: the site Carmean's curves describe. */
export const OPEN_TEMPERATE_SITE: PlantEnvironment = {
  latitude: 45,
  light: 1,
  soilWater: 0.85,
  nutrients: 0.8,
  fertilizer: 0,
  temperatureC: 6.5,
  seasonalRangeC: 13,
  wind: { dir: 0, strength: 0 },
  slope: { dir: 0, deg: 0 },
};

/**
 * Growth modifier from soil water and fertility, after 3-PG (Landsberg & Waring 1997): the soil-water
 * modifier for a sandy loam (c = 0.6, n = 7) times the fertility modifier with fN0 = 0.5.
 * @internal
 */
export function siteModifier(env: PlantEnvironment): number {
  const deficit = Math.min(1, Math.max(0, 1 - env.soilWater));
  const water = 1 / (1 + plantPow(deficit / 0.6, 7));
  const fertility = Math.min(1, Math.max(0, env.nutrients + env.fertilizer));
  return water * (1 - 0.5 * (1 - fertility));
}
