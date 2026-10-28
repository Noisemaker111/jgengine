// @skill jgengine-world
import { decodeFireArray, encodeFireArray } from "./fireArrays";
import type { FireMoistureField } from "./fireLandscape";
import type { FuelMoisture } from "./fuelModels";

/** The weather a fuel moisture model reads; the only seam between fire and a weather system. */
export interface MoistureWeather {
  /** Air temperature at screen height, °C. */
  airTemperatureC: number;
  /** Relative humidity, 0..1. */
  relativeHumidity: number;
  /** Rain rate, mm/h. */
  rainRateMmPerHour: number;
  /** Cloud cover, 0 (clear) .. 1 (overcast). */
  cloudCover: number;
  /** Strength of the sun on the fuels, 0 at night .. 1 at midday; defaults to 1. */
  daylight?: number;
  /** Day length, hours, for the green-up of live fuel; defaults to 12. */
  dayLengthHours?: number;
}

/**
 * Equilibrium moisture content of dead wood, fraction of dry mass, from temperature (°C) and relative
 * humidity (0..1): Simard 1968's three-part regression as used by the 1978 NFDRS.
 *
 * @capability fire-equilibrium-moisture equilibrium moisture of dead fuel from air temperature and humidity
 */
export function equilibriumMoistureContent(temperatureC: number, relativeHumidity: number): number {
  const t = temperatureC * 1.8 + 32;
  const h = Math.min(100, Math.max(0, relativeHumidity * 100));
  let emc: number;
  if (h < 10) emc = 0.03229 + 0.281073 * h - 0.000578 * h * t;
  else if (h < 50) emc = 2.22749 + 0.160107 * h - 0.01478 * t;
  else emc = 21.0606 + 0.005565 * h * h - 0.00035 * h * t - 0.483199 * h;
  return Math.max(0, emc) / 100;
}

/** NFDRS 1978 fuel-level corrections by sky: [cloud cover, temperature added °F, humidity factor]. */
const SKY: readonly (readonly [number, number, number])[] = [
  [0.05, 25, 0.75],
  [0.3, 19, 0.83],
  [0.75, 12, 0.91],
  [0.95, 5, 1],
];

/**
 * Temperature and humidity at the surface of sunlit fuel (Cohen & Deeming 1985): sun heats the fuel
 * above the air and dries the air next to it, more under clear sky than overcast. `sun` scales the
 * correction from none (night or full shade) to the full table value.
 *
 * @capability fire-fuel-level-weather temperature and humidity at sunlit fuel from air values, cloud and sun
 */
export function fuelLevelWeather(temperatureC: number, relativeHumidity: number, cloudCover: number, sun: number): { temperatureC: number; relativeHumidity: number } {
  const c = Math.min(1, Math.max(0, cloudCover));
  let add = 25;
  let factor = 0.75;
  const first = SKY[0];
  const last = SKY[SKY.length - 1];
  if (first !== undefined && last !== undefined) {
    if (c <= first[0]) [, add, factor] = first;
    else if (c >= last[0]) [, add, factor] = last;
    else {
      for (let k = 1; k < SKY.length; k++) {
        const a = SKY[k - 1];
        const b = SKY[k];
        if (a === undefined || b === undefined || c > b[0]) continue;
        const f = (c - a[0]) / (b[0] - a[0]);
        add = a[1] + (b[1] - a[1]) * f;
        factor = a[2] + (b[2] - a[2]) * f;
        break;
      }
    }
  }
  const s = Math.min(1, Math.max(0, sun));
  return { temperatureC: temperatureC + (s * add) / 1.8, relativeHumidity: relativeHumidity * (1 - s * (1 - factor)) };
}

/**
 * Vapour pressure deficit, Pa, from temperature (°C) and relative humidity (0..1), Tetens saturation pressure.
 *
 * @capability fire-vapor-pressure-deficit vapour pressure deficit from air temperature and humidity
 */
export function vaporPressureDeficit(temperatureC: number, relativeHumidity: number): number {
  const saturation = 610.78 * Math.exp((17.27 * temperatureC) / (temperatureC + 237.3));
  return saturation * (1 - Math.min(1, Math.max(0, relativeHumidity)));
}

/**
 * Jolly et al. 2005 growing season index, 0..1: the product of ramps on daily minimum temperature
 * (−2..5 °C), vapour pressure deficit (900..4100 Pa, inverted) and day length (10..11 h).
 *
 * @capability fire-growing-season-index Jolly 2005 growing season index from minimum temperature, vapour pressure deficit and day length
 */
export function growingSeasonIndex(minimumTemperatureC: number, vaporPressureDeficitPa: number, dayLengthHours: number): number {
  const ramp = (x: number, lo: number, hi: number): number => Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return ramp(minimumTemperatureC, -2, 5) * (1 - ramp(vaporPressureDeficitPa, 900, 4100)) * ramp(dayLengthHours, 10, 11);
}

/** Live policy of a fuel moisture model; every value can change during play with `retune`. */
export interface FuelMoistureTuning {
  /** Time lags of the dead fuel classes, hours (Byram 1963: 63 % of the gap to equilibrium closes in one lag). */
  oneHourLagHours: number;
  tenHourLagHours: number;
  hundredHourLagHours: number;
  /** Rain rate counted as rain, mm/h (0.01 in as NFDRS). */
  rainThresholdMmPerHour: number;
  /** Moisture fine (1-h, 10-h) fuels approach while it rains, fraction (NFDRS 1978: 35 %). */
  rainFineMoisture: number;
  /** 100-h boundary while it rains: base + per hour of rain in the last 24 h (NFDRS 1978: 41 % + 0.5 %/h). */
  rainHundredBase: number;
  rainHundredPerHour: number;
  /** Live herbaceous moisture when dormant and fully green, fraction (NFDRS 2016: 30 % .. 250 %). */
  liveHerbMin: number;
  liveHerbMax: number;
  /** Live woody moisture when dormant and fully green, fraction (NFDRS 2016: 60 % .. 200 %). */
  liveWoodyMin: number;
  liveWoodyMax: number;
  /** Growing season index at which green-up starts (NFDRS 2016: 0.5). */
  greenUp: number;
  /** Averaging window of the growing season index, days (Jolly 2005: 21). */
  greennessWindowDays: number;
}

/** NFDRS 1978 dead fuel lags and rain boundaries, NFDRS 2016 live fuel ranges. */
export const DEFAULT_FUEL_MOISTURE_TUNING: Readonly<FuelMoistureTuning> = {
  oneHourLagHours: 1,
  tenHourLagHours: 10,
  hundredHourLagHours: 100,
  rainThresholdMmPerHour: 0.254,
  rainFineMoisture: 0.35,
  rainHundredBase: 0.41,
  rainHundredPerHour: 0.005,
  liveHerbMin: 0.3,
  liveHerbMax: 2.5,
  liveWoodyMin: 0.6,
  liveWoodyMax: 2.0,
  greenUp: 0.5,
  greennessWindowDays: 21,
};

/** Serializable state of a fuel moisture model. */
export interface FuelMoistureSnapshot {
  version: 1;
  cells: number;
  time: number;
  oneHour: string;
  tenHour: string;
  hundredHour: string;
  greenness: number | null;
  liveHerb: number;
  liveWoody: number;
  hourClock: number;
  rainHours: number[];
  minTemperature: number[];
  vpd: number[];
  vpdWeight: number[];
}

/** Per-cell dead fuel moisture and stand-wide live fuel moisture that follow the weather over time. */
export interface FuelMoistureModel extends FireMoistureField {
  readonly cells: number;
  /** Seconds simulated. */
  readonly time: number;
  /** Per-cell dead fuel moisture, fractions. */
  readonly layers: { readonly oneHour: Float32Array; readonly tenHour: Float32Array; readonly hundredHour: Float32Array };
  /** Advance by `dt` seconds of steady weather. Call at the weather's cadence, not every frame. */
  step(dt: number, weather: MoistureWeather): void;
  /** Wet one cell's fine dead fuel (1-h and 10-h) to at least `moisture`, as a water drop or hose would. */
  wet(cell: number, moisture: number): void;
  /** Live moisture and the averaged growing season index behind it (NaN before the first full hour). */
  live(): { herb: number; woody: number; greenness: number };
  snapshot(): FuelMoistureSnapshot;
  restore(snapshot: FuelMoistureSnapshot): void;
  reset(): void;
  retune(patch: Partial<FuelMoistureTuning>): void;
  tuning(): Readonly<FuelMoistureTuning>;
}

const HOUR = 3600;
const RING = 24;

/**
 * Fuel moisture over time from weather, one value set per fire grid cell, ready to hand to a fire
 * landscape with `setMoistureField`. Dead fuels relax exponentially toward their equilibrium moisture
 * (Simard 1968 at fuel-level conditions for 1-h and 10-h, air conditions for 100-h) with NFDRS 1978
 * time lags and rain boundaries; live fuels start at `initial` and follow a Jolly 2005 growing season
 * index mapped onto the NFDRS 2016 live moisture ranges, averaged over the index's window. `exposure` (0..1 per cell) is how much sun reaches the fuel.
 *
 * @capability fire-fuel-moisture per-cell dead and live fuel moisture that dries in sun and heat and wets in rain, as a fire moisture field
 */
export function createFuelMoistureModel(config: {
  cells: number;
  initial: FuelMoisture;
  exposure?: Float32Array;
  tuning?: Partial<FuelMoistureTuning>;
}): FuelMoistureModel {
  const n = config.cells;
  if (!Number.isInteger(n) || n <= 0) throw new Error("fuel moisture cells must be a positive integer");
  if (config.exposure !== undefined && config.exposure.length !== n) throw new Error("fuel moisture exposure must have one value per cell");
  const exposure = config.exposure;
  const initial = { ...config.initial };
  let tuning: FuelMoistureTuning = { ...DEFAULT_FUEL_MOISTURE_TUNING, ...config.tuning };
  const oneHour = new Float32Array(n);
  const tenHour = new Float32Array(n);
  const hundredHour = new Float32Array(n);
  const rainHours = new Array<number>(RING).fill(0);
  const minTemperature = new Array<number>(RING).fill(Number.POSITIVE_INFINITY);
  const vpd = new Array<number>(RING).fill(0);
  const vpdWeight = new Array<number>(RING).fill(0);
  let greenness = Number.NaN;
  let liveHerb = initial.liveHerb;
  let liveWoody = initial.liveWoody;
  let hourClock = 0;
  let time = 0;
  let version = 0;

  function reset(): void {
    oneHour.fill(initial.oneHour);
    tenHour.fill(initial.tenHour);
    hundredHour.fill(initial.hundredHour);
    rainHours.fill(0);
    minTemperature.fill(Number.POSITIVE_INFINITY);
    vpd.fill(0);
    vpdWeight.fill(0);
    greenness = Number.NaN;
    liveHerb = initial.liveHerb;
    liveWoody = initial.liveWoody;
    hourClock = 0;
    time = 0;
    version++;
  }
  reset();

  function greenFraction(index: number): number {
    return index < tuning.greenUp ? 0 : (index - tuning.greenUp) / Math.max(1e-9, 1 - tuning.greenUp);
  }

  function recordWeather(dt: number, w: MoistureWeather, raining: boolean): void {
    let left = dt;
    const deficit = vaporPressureDeficit(w.airTemperatureC, w.relativeHumidity);
    while (left > 0) {
      const part = Math.min(left, HOUR - hourClock);
      if (raining) rainHours[0] = (rainHours[0] ?? 0) + part / HOUR;
      minTemperature[0] = Math.min(minTemperature[0] ?? Number.POSITIVE_INFINITY, w.airTemperatureC);
      vpd[0] = (vpd[0] ?? 0) + deficit * part;
      vpdWeight[0] = (vpdWeight[0] ?? 0) + part;
      hourClock += part;
      left -= part;
      if (hourClock >= HOUR - 1e-9) {
        hourClock = 0;
        let tMin = Number.POSITIVE_INFINITY;
        let vSum = 0;
        let vW = 0;
        for (let k = 0; k < RING; k++) {
          tMin = Math.min(tMin, minTemperature[k] ?? Number.POSITIVE_INFINITY);
          vSum += vpd[k] ?? 0;
          vW += vpdWeight[k] ?? 0;
        }
        const daily = growingSeasonIndex(tMin, vW > 0 ? vSum / vW : 0, w.dayLengthHours ?? 12);
        // An exponential mean with half the window as its time constant lags like Jolly's running mean.
        const blend = 1 - Math.exp(-1 / (tuning.greennessWindowDays * 12));
        greenness = Number.isNaN(greenness) ? daily : greenness + (daily - greenness) * blend;
        const f = greenFraction(daily);
        liveHerb += (tuning.liveHerbMin + f * (tuning.liveHerbMax - tuning.liveHerbMin) - liveHerb) * blend;
        liveWoody += (tuning.liveWoodyMin + f * (tuning.liveWoodyMax - tuning.liveWoodyMin) - liveWoody) * blend;
        rainHours.pop();
        rainHours.unshift(0);
        minTemperature.pop();
        minTemperature.unshift(Number.POSITIVE_INFINITY);
        vpd.pop();
        vpd.unshift(0);
        vpdWeight.pop();
        vpdWeight.unshift(0);
      }
    }
  }

  function assertWeather(w: MoistureWeather): void {
    for (const v of [w.airTemperatureC, w.relativeHumidity, w.rainRateMmPerHour, w.cloudCover]) {
      if (!Number.isFinite(v)) throw new Error("moisture weather values must be finite");
    }
  }

  return {
    cells: n,
    get time() {
      return time;
    },
    get version() {
      return version;
    },
    layers: { oneHour, tenHour, hundredHour },
    step(dt, w) {
      if (!Number.isFinite(dt) || dt < 0) throw new Error("fuel moisture dt must be finite and nonnegative");
      assertWeather(w);
      if (dt === 0) return;
      const hours = dt / HOUR;
      const raining = w.rainRateMmPerHour >= tuning.rainThresholdMmPerHour;
      recordWeather(dt, w, raining);
      const k1 = Math.exp(-hours / tuning.oneHourLagHours);
      const k10 = Math.exp(-hours / tuning.tenHourLagHours);
      const k100 = Math.exp(-hours / tuning.hundredHourLagHours);
      const sun = w.daylight ?? 1;
      let rainCount = 0;
      for (const r of rainHours) rainCount += r;
      const air = equilibriumMoistureContent(w.airTemperatureC, w.relativeHumidity);
      const b100 = raining ? Math.max(air, tuning.rainHundredBase + tuning.rainHundredPerHour * rainCount) : air;
      const open = fuelLevelWeather(w.airTemperatureC, w.relativeHumidity, w.cloudCover, sun);
      const openEmc = equilibriumMoistureContent(open.temperatureC, open.relativeHumidity);
      for (let i = 0; i < n; i++) {
        let fine: number;
        if (raining) fine = Math.max(tuning.rainFineMoisture, air);
        else if (exposure === undefined) fine = openEmc;
        else {
          const e = exposure[i] ?? 1;
          if (e >= 1) fine = openEmc;
          else {
            const level = fuelLevelWeather(w.airTemperatureC, w.relativeHumidity, w.cloudCover, sun * e);
            fine = equilibriumMoistureContent(level.temperatureC, level.relativeHumidity);
          }
        }
        oneHour[i] = fine + ((oneHour[i] ?? fine) - fine) * k1;
        tenHour[i] = fine + ((tenHour[i] ?? fine) - fine) * k10;
        hundredHour[i] = b100 + ((hundredHour[i] ?? b100) - b100) * k100;
      }
      time += dt;
      version++;
    },
    wet(cell, moisture) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= n) throw new Error("fuel moisture cell out of range");
      oneHour[cell] = Math.max(oneHour[cell] ?? 0, moisture);
      tenHour[cell] = Math.max(tenHour[cell] ?? 0, moisture);
      version++;
    },
    moistureAt(cell) {
      return {
        oneHour: oneHour[cell] ?? initial.oneHour,
        tenHour: tenHour[cell] ?? initial.tenHour,
        hundredHour: hundredHour[cell] ?? initial.hundredHour,
        liveHerb,
        liveWoody,
      };
    },
    live() {
      return { herb: liveHerb, woody: liveWoody, greenness };
    },
    snapshot() {
      return {
        version: 1,
        cells: n,
        time,
        oneHour: encodeFireArray(oneHour),
        tenHour: encodeFireArray(tenHour),
        hundredHour: encodeFireArray(hundredHour),
        greenness: Number.isNaN(greenness) ? null : greenness,
        liveHerb,
        liveWoody,
        hourClock,
        rainHours: [...rainHours],
        minTemperature: minTemperature.map((t) => (Number.isFinite(t) ? t : 1e9)),
        vpd: [...vpd],
        vpdWeight: [...vpdWeight],
      };
    },
    restore(s) {
      if (s.version !== 1 || s.cells !== n) throw new Error("fuel moisture snapshot does not match this model");
      decodeFireArray(s.oneHour, oneHour, "oneHour");
      decodeFireArray(s.tenHour, tenHour, "tenHour");
      decodeFireArray(s.hundredHour, hundredHour, "hundredHour");
      for (let k = 0; k < RING; k++) {
        rainHours[k] = s.rainHours[k] ?? 0;
        const t = s.minTemperature[k] ?? 1e9;
        minTemperature[k] = t >= 1e9 ? Number.POSITIVE_INFINITY : t;
        vpd[k] = s.vpd[k] ?? 0;
        vpdWeight[k] = s.vpdWeight[k] ?? 0;
      }
      greenness = s.greenness ?? Number.NaN;
      liveHerb = s.liveHerb;
      liveWoody = s.liveWoody;
      hourClock = s.hourClock;
      time = s.time;
      version++;
    },
    reset,
    retune(patch) {
      tuning = { ...tuning, ...patch };
      version++;
    },
    tuning() {
      return tuning;
    },
  };
}
