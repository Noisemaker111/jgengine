import { markersOfKind } from "@jgengine/core/world/authoredSpawn";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { ambientTemperature } from "@jgengine/core/survival/bodyTemperature";
import { solidOverhead } from "@jgengine/core/world/overhead";

import { editorLayers } from "../editorLayers";
import { stations } from "./base";

/**
 * Each biome's daily mean in °C. ARK says the south coast is hottest and the north coldest; its wiki gives no table,
 * so these are approximate, set so the snow is freezing at night and the redwoods cool.
 */
export const BIOME_C: Record<string, number> = { coast: 24, jungle: 25, swamp: 26, volcano: 27, redwood: 16, snow: -6 };
/** Past this far from any biome's spawn marker, it is coast. */
const BIOME_REACH = 200;
/** A campfire's warmth at its heart, and how far it reaches (ARK: 800 units, about 8 m). The warmth is approximate. */
const CAMPFIRE_C = 12;
const CAMPFIRE_RANGE = 8;
/** Rain this heavy soaks a survivor under open sky. */
const SOAKING_RAIN = 0.2;

const WATER_LEVEL = 0;

/** Where each biome is: the spawn zones carry their biome in their id (herd_snow_12, herd_redwood_65, …). */
const BIOME_POINTS: readonly { x: number; z: number; biome: string }[] = markersOfKind(editorLayers, "creature_spawn").flatMap((marker) => {
  const biome = /^herd_([a-z]+)_\d+$/.exec(marker.id)?.[1];
  return biome !== undefined && biome in BIOME_C ? [{ x: marker.position.x, z: marker.position.z, biome }] : [];
});

/** The biome at a spot: the nearest biome marker's within reach, else the coast. */
export function biomeAt(x: number, z: number): string {
  let best = "coast";
  let bestDistance = BIOME_REACH;
  for (const point of BIOME_POINTS) {
    const distance = Math.hypot(point.x - x, point.z - z);
    if (distance < bestDistance) {
      best = point.biome;
      bestDistance = distance;
    }
  }
  return best;
}

export function inWater(ctx: GameContext, position: readonly [number, number, number]): boolean {
  return ctx.world.groundHeightAt(position[0], position[2]) < WATER_LEVEL + 0.3;
}

/** Warmth from lit campfires near a spot, stacking as ARK's do, fading to nothing at their range. */
function campfireHeat(ctx: GameContext, position: readonly [number, number, number]): number {
  let heat = 0;
  for (const station of stations(ctx)) {
    if (station.catalogId !== "campfire") continue;
    const distance = Math.hypot(station.position[0] - position[0], station.position[1] - position[2]);
    if (distance < CAMPFIRE_RANGE) heat += CAMPFIRE_C * (1 - distance / CAMPFIRE_RANGE);
  }
  return heat;
}

/** What the weather is doing to someone standing at a spot. */
export interface ClimateHere {
  biome: string;
  /** The weather that falls here: clear, rain, snow, or both at a zone's edge. */
  weather: "clear" | "rain" | "snow" | "mixed" | "dust";
  /** 0..1 how hard it falls. */
  precipitation: number;
  /** A ceiling, roof or cave rock overhead. */
  covered: boolean;
  wet: boolean;
  /** Air temperature in °C. */
  temperature: number;
}

/**
 * The air where a survivor stands, ARK-style: the biome's climate, colder with height and at night; the weather's
 * cooling (rain 3-5 °C, ARK says) unless something is overhead, which also keeps the rain off; soaked in water or
 * open rain; and warmed by campfires.
 */
export function climateAt(ctx: GameContext, position: readonly [number, number, number]): ClimateHere {
  const [x, , z] = position;
  const biome = biomeAt(x, z);
  const sample = ctx.environment.sample(x, z);
  const covered = solidOverhead(ctx.world.solids, position);
  // A roof stops the rain and its chill; a heatwave or a cold snap reaches you indoors too.
  const sheltered = covered && sample.precipitation > 0;
  const wet = inWater(ctx, position) || (!covered && sample.rain >= SOAKING_RAIN);
  const temperature = ambientTemperature({
    baseC: BIOME_C[biome]!,
    daySwingC: 6,
    dayFraction: ctx.time.calendar().dayFraction,
    altitude: Math.max(0, position[1]),
    lapsePerMetre: 0.12,
    weatherC: sheltered ? 0 : (sample.temperatureOffset ?? 0),
    heatC: campfireHeat(ctx, position),
    wet,
  });
  return { biome, weather: sample.mode, precipitation: sample.precipitation, covered, wet, temperature };
}
