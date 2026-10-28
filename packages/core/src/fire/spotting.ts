// @skill jgengine-world
import { M_PER_FT } from "./fuelModels";
import { MPS_PER_MPH } from "./surfaceFire";

const FT_PER_MILE = 5280;

/** The ground downwind of a fire, where embers fall. */
export interface SpotTerrain {
  /** Height of the downwind tree cover, m (0 for open ground). */
  coverHeightM: number;
  /** True when the cover is open (scattered trees): Albini uses half its height. */
  openCover?: boolean;
  /** Ridge-to-valley horizontal distance, m, for Chase's mountain correction; omit on flat ground. */
  ridgeToValleyDistanceM?: number;
  /** Ridge-to-valley elevation difference, m. */
  ridgeToValleyElevationM?: number;
  /** Where the source sits: 0 midslope windward, 1 valley bottom, 2 midslope leeward, 3 ridge top. */
  location?: 0 | 1 | 2 | 3;
}

/** How far embers from a source travel, and how high they were lofted. */
export interface SpotDistance {
  /** Maximum spotting distance on flat ground, m. */
  flat: number;
  /** Maximum spotting distance over the ridge-valley terrain, m (equals `flat` without terrain). */
  mountain: number;
  /** Initial firebrand height, m. */
  firebrandHeight: number;
}

function coverUsed(firebrandHeightFt: number, terrain: SpotTerrain): number {
  const cover = (terrain.coverHeightM / M_PER_FT) * (terrain.openCover === true ? 0.5 : 1);
  const critical = firebrandHeightFt < 1e-7 ? 0 : 2.2 * Math.pow(firebrandHeightFt, 0.337) - 4;
  return Math.max(cover, critical);
}

/** Albini 1979 flat-terrain distance, miles, of a firebrand lofted to z ft over cover H ft, wind U mph. */
function flatMiles(z: number, h: number, u: number): number {
  if (h <= 1e-7) return 0;
  return 0.000718 * u * Math.sqrt(h) * (0.362 + (Math.sqrt(z / h) / 2) * Math.log(z / h));
}

/** Chase 1981 correction of a flat spotting distance for ridge-valley terrain. */
function mountainMiles(flat: number, terrain: SpotTerrain): number {
  const dist = (terrain.ridgeToValleyDistanceM ?? 0) / M_PER_FT / FT_PER_MILE;
  const elev = (terrain.ridgeToValleyElevationM ?? 0) / M_PER_FT;
  if (dist <= 1e-7 || elev <= 1e-7) return flat;
  const loc = terrain.location ?? 3;
  const a1 = flat / dist;
  const b1 = elev / (10 * Math.PI) / 1000;
  let x = a1;
  for (let i = 0; i < 6; i++) x = a1 - b1 * (Math.cos(Math.PI * x - (loc * Math.PI) / 2) - Math.cos((loc * Math.PI) / 2));
  return x * dist;
}

function distances(zFt: number, uMph: number, terrain: SpotTerrain, driftMiles: (z: number) => number): SpotDistance {
  const h = coverUsed(zFt, terrain);
  if (zFt <= 1e-7 || h <= 1e-7 || uMph <= 1e-7) return { flat: 0, mountain: 0, firebrandHeight: zFt * M_PER_FT };
  const flat = flatMiles(zFt, h, uMph) + driftMiles(zFt);
  const toM = FT_PER_MILE * M_PER_FT;
  return { flat: flat * toM, mountain: mountainMiles(flat, terrain) * toM, firebrandHeight: zFt * M_PER_FT };
}

/**
 * Maximum spotting distance from a wind-driven surface fire (Albini 1983 as in BehavePlus): the
 * firebrand is lofted by the flame's plume, then carried by the 20-ft wind over the downwind cover.
 *
 * @capability fire-spotting-surface maximum ember spotting distance from a surface fire's flame length and wind
 */
export function surfaceFireSpotDistance(flameLengthM: number, twentyFootWind: number, terrain: SpotTerrain): SpotDistance {
  const u = twentyFootWind / MPS_PER_MPH;
  const l = flameLengthM / M_PER_FT;
  if (u <= 1e-7 || l <= 1e-7) return { flat: 0, mountain: 0, firebrandHeight: 0 };
  const f = 322 * Math.pow(0.474 * u, -1.01);
  const byram = Math.pow(l / 0.45, 1 / 0.46);
  const z = f * byram < 1e-7 ? 0 : 1.055 * Math.sqrt(f * byram);
  return distances(z, u, terrain, (zz) => 0.000278 * u * Math.pow(zz, 0.643));
}

/** Albini 1979 torching-tree flame height and duration coefficients by species group. */
export type TorchingSpecies =
  | "engelmannSpruce"
  | "douglasFir"
  | "subalpineFir"
  | "westernHemlock"
  | "ponderosaPine"
  | "lodgepolePine"
  | "westernWhitePine"
  | "grandFir"
  | "balsamFir"
  | "slashPine"
  | "longleafPine"
  | "pondPine"
  | "shortleafPine"
  | "loblollyPine";

/** [flame height a, b] and [flame duration a, b]: h = a·DBH^b·n^0.4, t = a·DBH^b·n^-0.2 (ft, in, min). */
const TORCHING: Record<TorchingSpecies, readonly [number, number, number, number]> = {
  engelmannSpruce: [15.7, 0.451, 12.6, -0.256],
  douglasFir: [15.7, 0.451, 10.7, -0.278],
  subalpineFir: [15.7, 0.451, 10.7, -0.278],
  westernHemlock: [15.7, 0.451, 6.3, -0.249],
  ponderosaPine: [12.9, 0.453, 12.6, -0.256],
  lodgepolePine: [12.9, 0.453, 12.6, -0.256],
  westernWhitePine: [12.9, 0.453, 10.7, -0.278],
  grandFir: [16.5, 0.515, 10.7, -0.278],
  balsamFir: [16.5, 0.515, 10.7, -0.278],
  slashPine: [2.71, 1.0, 11.9, -0.389],
  longleafPine: [2.71, 1.0, 11.9, -0.389],
  pondPine: [2.71, 1.0, 7.91, -0.344],
  shortleafPine: [2.71, 1.0, 7.91, -0.344],
  loblollyPine: [2.71, 1.0, 13.5, -0.544],
};

/** Albini 1979 firebrand lofting factors by flame shape. */
const LOFT: readonly (readonly [number, number])[] = [
  [4.24, 0.332],
  [3.64, 0.391],
  [2.78, 0.418],
  [4.7, 0],
];

/**
 * Maximum spotting distance from torching trees (Albini 1979): steady flame height and duration from
 * species, DBH and number of trees torching together, the loft that flame gives a firebrand, and its
 * drift over the downwind cover.
 *
 * @capability fire-spotting-torching maximum ember spotting distance from a group of torching trees
 */
export function torchingTreeSpotDistance(input: {
  species: TorchingSpecies;
  dbhM: number;
  treeHeightM: number;
  trees: number;
  twentyFootWind: number;
  terrain: SpotTerrain;
}): SpotDistance {
  const u = input.twentyFootWind / MPS_PER_MPH;
  const dbh = input.dbhM / 0.0254;
  const height = input.treeHeightM / M_PER_FT;
  if (u <= 1e-7 || dbh <= 1e-7 || input.trees < 1) return { flat: 0, mountain: 0, firebrandHeight: 0 };
  const [ha, hb, da, db] = TORCHING[input.species];
  const flameHeight = ha * Math.pow(dbh, hb) * Math.pow(input.trees, 0.4);
  const ratio = height / flameHeight;
  const duration = da * Math.pow(dbh, db) * Math.pow(input.trees, -0.2);
  const row = ratio >= 1 ? 0 : ratio >= 0.5 ? 1 : duration < 3.5 ? 2 : 3;
  const [la, lb] = LOFT[row] ?? [4.7, 0];
  const z = la * Math.pow(duration, lb) * flameHeight + height / 2;
  return distances(z, u, input.terrain, () => 0);
}

/**
 * Probability that a firebrand landing in fine dead fuel starts a fire (Schroeder 1969, in the NFDRS
 * form of Cohen & Deeming 1985): from 1-h fuel moisture and the fuel's temperature, 0..1.
 *
 * @capability fire-ignition-probability chance an ember lighting fine fuel at a moisture and temperature starts a fire
 */
export function emberIgnitionProbability(oneHourMoisture: number, fuelTemperatureC: number): number {
  const m = oneHourMoisture * 100;
  const t = fuelTemperatureC;
  const q = 144.5 - 0.266 * t - 0.00058 * t * t - 0.01 * t * m + 18.54 * (1 - Math.exp(-0.151 * m)) + 6.4 * m;
  if (q >= 344) return 0;
  const chi = (344 - q) / 10;
  const raw = (Math.pow(chi, 3.66) * 0.000923) / 50;
  const pNorm1 = 0.00232;
  const pNorm2 = 0.99767;
  if (raw <= pNorm1) return 0;
  return Math.min(1, (raw - pNorm1) / pNorm2);
}
