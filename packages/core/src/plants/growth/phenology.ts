import type { PlantSpecies } from "../species/plantSpecies";
import { PLANT_PI, plantAcos, plantCos, plantSin } from "./plantMath";
import type { PlantEnvironment } from "./plantEnvironment";

export interface GrowingSeason {
  leafOnDay: number;
  leafOffDay: number;
  parMJ: number;
}

const SOLAR_CONSTANT = 0.082;
const CLEARNESS = 0.5;
const PAR_SHARE = 0.48;
const DEGREE = PLANT_PI / 180;

function tanOf(angle: number): number {
  return plantSin(angle) / plantCos(angle);
}

/** @internal */
export function dailyTemperatureC(env: PlantEnvironment, day: number): number {
  const range = env.seasonalRangeC ?? 13;
  return env.temperatureC + range * plantSin((2 * PLANT_PI * (day - 106)) / 365);
}

/** @internal */
export function solarDay(latitudeDeg: number, day: number): { radiationMJ: number; daylengthH: number } {
  const phi = latitudeDeg * DEGREE;
  const angle = (2 * PLANT_PI * day) / 365;
  const dr = 1 + 0.033 * plantCos(angle);
  const delta = 0.409 * plantSin(angle - 1.39);
  const omega = plantAcos(-tanOf(phi) * tanOf(delta));
  const radiation = ((24 * 60) / PLANT_PI) * SOLAR_CONSTANT * dr *
    (omega * plantSin(phi) * plantSin(delta) + plantCos(phi) * plantCos(delta) * plantSin(omega));
  return { radiationMJ: radiation > 0 ? radiation : 0, daylengthH: (24 / PLANT_PI) * omega };
}

/** @internal */
export function growingSeason(species: PlantSpecies, env: PlantEnvironment): GrowingSeason {
  if (species.leaf.lifespanYears >= 1) {
    let par = 0;
    for (let day = 1; day <= 365; day += 1) {
      if (dailyTemperatureC(env, day) > species.phenology.forcingBaseC) par += solarDay(env.latitude, day).radiationMJ;
    }
    return { leafOnDay: 1, leafOffDay: 365, parMJ: par * CLEARNESS * PAR_SHARE };
  }
  let forcing = 0;
  let leafOn = 366;
  for (let day = 1; day <= 365; day += 1) {
    const warmth = dailyTemperatureC(env, day) - species.phenology.forcingBaseC;
    if (warmth > 0) forcing += warmth;
    if (forcing >= species.phenology.forcingSum) {
      leafOn = day;
      break;
    }
  }
  let leafOff = 365;
  for (let day = Math.max(leafOn + 1, 173); day <= 365; day += 1) {
    if (solarDay(env.latitude, day).daylengthH < species.phenology.senescencePhotoperiodH) {
      leafOff = day;
      break;
    }
  }
  if (leafOn > 365 || leafOff <= leafOn) return { leafOnDay: leafOn, leafOffDay: leafOn, parMJ: 0 };
  let par = 0;
  for (let day = leafOn; day < leafOff; day += 1) par += solarDay(env.latitude, day).radiationMJ;
  return { leafOnDay: leafOn, leafOffDay: leafOff, parMJ: par * CLEARNESS * PAR_SHARE };
}
