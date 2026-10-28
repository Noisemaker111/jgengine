// @skill jgengine-world
import { decodeFireArray, encodeFireArray } from "./fireArrays";
import { seededRng } from "../random/rng";
import { CANOPY_HEAT_KJ_KG, assessCrownFire, canopyFuelLoad, crownFlameLength, crownInitiationIntensity, type CanopyFuel } from "./crownFire";
import { ANDERSON_FUEL_MODELS, totalFuelLoad, type FuelModel, type FuelMoisture } from "./fuelModels";
import { emberIgnitionProbability, surfaceFireSpotDistance, torchingTreeSpotDistance, type TorchingSpecies } from "./spotting";
import { ellipseEccentricity, flameLength, scorchHeight, surfaceFuelbed, surfaceSpread, type SurfaceFuelbed, type WindLimit } from "./surfaceFire";
import { windAdjustmentFactor } from "./windAdjustment";

/** A forest stand over a cell: the canopy that shelters the wind and can carry crown fire. */
export interface CanopyStand extends CanopyFuel {
  /** Canopy cover, fraction of ground under crowns. */
  cover: number;
}

/** Fire weather for one step. Directions are radians in the grid plane, from +x towards +z. */
export interface FireWeather {
  /** Open wind 6.1 m (20 ft) above the vegetation, m/s. */
  twentyFootWind: number;
  /** Direction the wind blows towards. */
  windDirection: number;
  /** Air temperature, °C. */
  airTemperatureC: number;
  /** Fuel moisture everywhere a moisture field does not cover. */
  moisture: FuelMoisture;
  /** Temperature of sunlit fine fuel, °C, for ember ignition; defaults to the air temperature. */
  fuelTemperatureC?: number;
}

/** Per-cell fuel moisture that changes over time (a dead-fuel moisture model, irrigation, rain). */
export interface FireMoistureField {
  /** Bumped whenever any cell's moisture changes. */
  readonly version: number;
  /** Moisture of one cell. */
  moistureAt(cell: number): FuelMoisture;
}

/** Live policy of a fire landscape; every value can change during play with `retune`. */
export interface FireTuning {
  /** Neighbour stencil of the travel-time solver: 8, 16 or 32 directions (Finney 2002). */
  stencil: 8 | 16 | 32;
  windLimit: WindLimit;
  /** Let surface fires climb into canopies (Van Wagner 1977; Rothermel 1991). */
  crownFire: boolean;
  /** Let embers start spot fires ahead of the front (Albini 1979, 1983). */
  spotting: boolean;
  /** Chance a torching or crowning cell lofts an ember. */
  crownEmberChance: number;
  /** Chance a surface-burning cell lofts an ember. */
  surfaceEmberChance: number;
  /** Lateral scatter of ember landing directions around the wind, radians (full width). */
  emberScatter: number;
  /** Tree species, DBH (m) and trees torching together, for torching-tree ember lofting. */
  emberSpecies: TorchingSpecies;
  emberDbhM: number;
  emberTrees: number;
  /** Most ignition events processed per step; spread past it waits for the next step. */
  maxEventsPerStep: number;
}

/** Defaults: 16-direction stencil, BehavePlus-default wind limit, crown fire and spotting on. */
export const DEFAULT_FIRE_TUNING: FireTuning = {
  stencil: 16,
  windLimit: "none",
  crownFire: true,
  spotting: true,
  crownEmberChance: 1,
  surfaceEmberChance: 0.02,
  emberScatter: 0.35,
  emberSpecies: "douglasFir",
  emberDbhM: 0.3,
  emberTrees: 2,
  maxEventsPerStep: 200_000,
};

/** Size, terrain, fuel and canopy of a fire landscape. */
export interface FireLandscapeConfig {
  cols: number;
  rows: number;
  /** Cell edge, m. */
  cellSize: number;
  /** World position of the grid's (0,0) corner. */
  originX?: number;
  originZ?: number;
  /** Fuel model palette. */
  fuels: readonly FuelModel[];
  /** Palette index of each cell, row-major (`row * cols + col`). */
  fuel: ArrayLike<number>;
  /** Ground elevation of each cell centre, m; flat when omitted. */
  elevation?: ArrayLike<number>;
  /** Canopy palette and each cell's index into it (negative or out of range for none). */
  canopies?: readonly CanopyStand[];
  canopy?: ArrayLike<number>;
  /** Seed for ember spotting. */
  seed: string | number;
  tuning?: Partial<FireTuning>;
  /** Cell budget; construction throws past it. Default 1 048 576. */
  maxCells?: number;
}

/** What a cell is doing: never burnt, flaming, smouldering coarse fuel, or burnt out. */
export type FireBurnState = "unburnt" | "flaming" | "smouldering" | "burnt";
const STATES: readonly FireBurnState[] = ["unburnt", "flaming", "smouldering", "burnt"];

/** How fire moved through a cell. */
export type FireCellKind = "none" | "surface" | "torching" | "crowning";
const KINDS: readonly FireCellKind[] = ["none", "surface", "torching", "crowning"];

/** One cell's fire record, for game logic; renderers read the typed arrays of {@link FireLandscape.layers}. */
export interface FireCellReading {
  state: FireBurnState;
  kind: FireCellKind;
  /** Time the front reached the cell, s; Infinity if it has not. */
  arrival: number;
  /** Byram fireline intensity of the front as it crossed, kW/m. */
  intensity: number;
  flameLength: number;
  /** Van Wagner crown scorch height, m. */
  scorchHeight: number;
  /** Share of the surface fuel consumed, 0..1: how black the ground is. */
  char: number;
  /** Mineral ash left, kg/m². */
  ash: number;
  /** Fuel still on the cell (surface and canopy), kg/m². */
  fuelLeft: number;
  /** True if an ember lit the cell. */
  spotted: boolean;
}

/** Typed per-cell outputs for renderers, row-major, updated in place every step. */
export interface FireLayers {
  /** 0 unburnt, 1 flaming, 2 smouldering, 3 burnt. */
  state: Uint8Array;
  /** 0 none, 1 surface, 2 torching, 3 crowning. */
  kind: Uint8Array;
  arrival: Float64Array;
  intensity: Float32Array;
  flameLength: Float32Array;
  scorchHeight: Float32Array;
  char: Float32Array;
  ash: Float32Array;
  fuelLeft: Float32Array;
}

/** A landscape fire's whole state as JSON-safe values. */
export interface FireLandscapeSnapshot {
  version: 1;
  time: number;
  rng: number;
  epoch: number;
  fuel: string;
  arrival: string;
  tentative: string;
  crossRate: string;
  flameEnd: string;
  burnEnd: string;
  state: string;
  kind: string;
  spotted: string;
  intensity: string;
  flameLength: string;
  scorchHeight: string;
  char: string;
  ash: string;
  fuelLeft: string;
  consumed: string;
  active: number[];
}

/** Counters from the last step. */
export interface FireStepStats {
  ignitions: number;
  embersLofted: number;
  spotFires: number;
  /** True when the event budget stopped the step before the fire caught up with the clock. */
  budgetHit: boolean;
}

/** A fire growing over a landscape of fuel, terrain and canopy. */
export interface FireLandscape {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  /** World position of the grid's (0,0) corner. */
  readonly originX: number;
  readonly originZ: number;
  /** Simulation clock, s. */
  readonly time: number;
  readonly layers: FireLayers;
  /** Advance the clock by `dt` seconds under `weather`. */
  step(dt: number, weather: FireWeather): FireStepStats;
  /** Light a cell now (or at a later `time`). */
  ignite(col: number, row: number, time?: number): void;
  /** Light the cell under a world position; false when it is off the grid. */
  igniteAt(x: number, z: number, time?: number): boolean;
  /** Change a cell's fuel (a dug line, a cleared yard, new growth). */
  setFuel(col: number, row: number, fuelIndex: number): void;
  /** Feed fuel moisture per cell; `null` uses the weather's moisture everywhere. */
  setMoistureField(field: FireMoistureField | null): void;
  cell(col: number, row: number): FireCellReading;
  cellIndexAt(x: number, z: number): number;
  /** Cells currently flaming or smouldering. */
  activeCells(): readonly number[];
  /** Area burnt or burning, m². */
  burnedArea(): number;
  stats(): FireStepStats;
  snapshot(): FireLandscapeSnapshot;
  restore(snapshot: FireLandscapeSnapshot): void;
  reset(): void;
  retune(tuning: Partial<FireTuning>): void;
  tuning(): FireTuning;
}

/** Stencil offsets (dx, dz): 8, then 16, then 32 directions (Finney 2002). */
const OFFSETS_8: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const RING = OFFSETS_8;
const OFFSETS_16 = [...OFFSETS_8, [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]] as const;
const OFFSETS_32 = [
  ...OFFSETS_16,
  [1, 3], [3, 1], [-1, 3], [-3, 1], [1, -3], [3, -1], [-1, -3], [-3, -1],
  [2, 3], [3, 2], [-2, 3], [-3, 2], [2, -3], [3, -2], [-2, -3], [-3, -2],
] as const;

/** Mineral content of wildland fuel (Albini 1976): the share of consumed mass left as ash. */
const ASH_FRACTION = 0.0555;
/** Anderson 1969 residence time, s, of fuel with surface-area-to-volume σ (1/m): 384/σ min with σ in 1/ft. */
function burnoutSeconds(savrPerM: number): number {
  return savrPerM > 0 ? (384 / (savrPerM * 0.3048)) * 60 : 0;
}
const TEN_HOUR_BURNOUT = (384 / 109) * 60;
const HUNDRED_HOUR_BURNOUT = (384 / 30) * 60;

const FM10 = ANDERSON_FUEL_MODELS["FM10"];

function validTuning(t: FireTuning): FireTuning {
  if (t.stencil !== 8 && t.stencil !== 16 && t.stencil !== 32) throw new Error("fire stencil must be 8, 16 or 32");
  for (const key of ["crownEmberChance", "surfaceEmberChance"] as const) {
    const v = t[key];
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error(`fire ${key} must be in 0..1`);
  }
  if (!Number.isFinite(t.emberScatter) || t.emberScatter < 0) throw new Error("fire emberScatter must be finite and nonnegative");
  if (!Number.isFinite(t.emberDbhM) || t.emberDbhM <= 0) throw new Error("fire emberDbhM must be positive");
  if (!Number.isFinite(t.emberTrees) || t.emberTrees < 1) throw new Error("fire emberTrees must be at least 1");
  if (!Number.isSafeInteger(t.maxEventsPerStep) || t.maxEventsPerStep < 1) throw new Error("fire maxEventsPerStep must be a positive integer");
  return t;
}

function sameMoisture(a: FuelMoisture, b: FuelMoisture): boolean {
  return a.oneHour === b.oneHour && a.tenHour === b.tenHour && a.hundredHour === b.hundredHour && a.liveHerb === b.liveHerb && a.liveWoody === b.liveWoody;
}

function assertWeather(w: FireWeather): void {
  if (!Number.isFinite(w.twentyFootWind) || w.twentyFootWind < 0) throw new Error("fire twentyFootWind must be finite and nonnegative");
  if (!Number.isFinite(w.windDirection)) throw new Error("fire windDirection must be finite");
  if (!Number.isFinite(w.airTemperatureC)) throw new Error("fire airTemperatureC must be finite");
}

/** Binary min-heap of (time, cell), ties broken by cell index so pops are deterministic. */
class EventHeap {
  times = new Float64Array(64);
  cells = new Int32Array(64);
  size = 0;
  clear(): void {
    this.size = 0;
  }
  push(time: number, cell: number): void {
    if (this.size === this.times.length) {
      const t = new Float64Array(this.size * 2);
      t.set(this.times);
      this.times = t;
      const c = new Int32Array(this.size * 2);
      c.set(this.cells);
      this.cells = c;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pt = this.times[p] ?? 0;
      const pc = this.cells[p] ?? 0;
      if (pt < time || (pt === time && pc <= cell)) break;
      this.times[i] = pt;
      this.cells[i] = pc;
      i = p;
    }
    this.times[i] = time;
    this.cells[i] = cell;
  }
  peekTime(): number {
    return this.size > 0 ? (this.times[0] ?? Infinity) : Infinity;
  }
  pop(): number {
    const top = this.cells[0] ?? -1;
    const last = --this.size;
    const lt = this.times[last] ?? 0;
    const lc = this.cells[last] ?? 0;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= last) break;
      const r = l + 1;
      let m = l;
      if (r < last) {
        const rt = this.times[r] ?? 0;
        const ltm = this.times[l] ?? 0;
        if (rt < ltm || (rt === ltm && (this.cells[r] ?? 0) < (this.cells[l] ?? 0))) m = r;
      }
      const mt = this.times[m] ?? 0;
      const mc = this.cells[m] ?? 0;
      if (lt < mt || (lt === mt && lc <= mc)) break;
      this.times[i] = mt;
      this.cells[i] = mc;
      i = m;
    }
    this.times[i] = lt;
    this.cells[i] = lc;
    return top;
  }
}

/**
 * Grow a wildfire over a grid of fuel, terrain and canopy. Each cell spreads as a Rothermel surface
 * fire shaped by the Anderson ellipse, or as a Rothermel 1991 crown fire once Van Wagner's 1977
 * thresholds are passed; arrival times follow Finney's 2002 minimum-travel-time method on an 8-, 16-
 * or 32-direction stencil, integrating travel time through every cell a path crosses, on the slope
 * surface, with a semi-Lagrangian triangle update so fronts also travel between stencil directions. Torching and crowning cells loft embers to Albini's maximum spotting distance, which light
 * fuel with the NFDRS ignition probability. Cells flame for the Anderson residence time, smoulder
 * coarse fuel out, and leave char, ash and scorch. Deterministic for a seed; cost is bounded by the
 * event budget per step and the cells actively burning.
 *
 * @capability fire-landscape grow a wildfire over fuel, terrain and canopy with crown fire, ember spotting and burnout; snapshot, restore, retune
 */
export function createFireLandscape(config: FireLandscapeConfig): FireLandscape {
  const { cols, rows, cellSize } = config;
  const maxCells = config.maxCells ?? 1_048_576;
  if (!Number.isSafeInteger(cols) || !Number.isSafeInteger(rows) || cols < 1 || rows < 1 || cols * rows > maxCells) {
    throw new Error("createFireLandscape: cols and rows must be positive integers within maxCells");
  }
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error("createFireLandscape: cellSize must be finite and positive");
  const n = cols * rows;
  if (config.fuel.length !== n) throw new Error("createFireLandscape: fuel must hold one entry per cell");
  if (config.fuels.length < 1 || config.fuels.length > 255) throw new Error("createFireLandscape: fuels must hold 1..255 models");
  if (config.elevation !== undefined && config.elevation.length !== n) throw new Error("createFireLandscape: elevation must hold one entry per cell");
  if (config.canopy !== undefined && config.canopy.length !== n) throw new Error("createFireLandscape: canopy must hold one entry per cell");
  const originX = config.originX ?? 0;
  const originZ = config.originZ ?? 0;
  const fuels = config.fuels;
  const canopies = config.canopies ?? [];

  const initialFuel = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const f = config.fuel[i] ?? 0;
    if (!Number.isInteger(f) || f < 0 || f >= fuels.length) throw new Error(`createFireLandscape: fuel index ${f} at cell ${i} is outside the palette`);
    initialFuel[i] = f;
  }
  const canopyOf = new Int16Array(n).fill(-1);
  if (config.canopy !== undefined) {
    for (let i = 0; i < n; i++) {
      const c = config.canopy[i] ?? -1;
      canopyOf[i] = Number.isInteger(c) && c >= 0 && c < canopies.length ? c : -1;
    }
  }

  // Slope (rise over run) and upslope direction of each cell from central differences.
  const slopeTan = new Float32Array(n);
  const upslope = new Float32Array(n);
  if (config.elevation !== undefined) {
    const elev = config.elevation;
    const at = (c: number, r: number): number => elev[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))] ?? 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dx = (at(c + 1, r) - at(c - 1, r)) / ((Math.min(cols - 1, c + 1) - Math.max(0, c - 1)) * cellSize || 1);
        const dz = (at(c, r + 1) - at(c, r - 1)) / ((Math.min(rows - 1, r + 1) - Math.max(0, r - 1)) * cellSize || 1);
        slopeTan[r * cols + c] = Math.hypot(dx, dz);
        upslope[r * cols + c] = Math.atan2(dz, dx);
      }
    }
  }

  let tune = validTuning({ ...DEFAULT_FIRE_TUNING, ...config.tuning });
  const rng = seededRng(config.seed);
  const initialRng = rng.state();

  const fuel = new Uint8Array(initialFuel);
  const arrival = new Float64Array(n).fill(Infinity);
  const tentative = new Float64Array(n).fill(Infinity);
  const crossRate = new Float32Array(n);
  const flameEnd = new Float64Array(n);
  const burnEnd = new Float64Array(n);
  const state = new Uint8Array(n);
  const kind = new Uint8Array(n);
  const spotted = new Uint8Array(n);
  const intensity = new Float32Array(n);
  const flameLen = new Float32Array(n);
  const scorch = new Float32Array(n);
  const char = new Float32Array(n);
  const ash = new Float32Array(n);
  const fuelLeft = new Float32Array(n);
  const consumed = new Float32Array(n);
  const initialLoad = (i: number): number => {
    const f = fuels[fuel[i] ?? 0];
    const c = canopyOf[i] ?? -1;
    const canopy = c >= 0 ? canopies[c] : undefined;
    return (f !== undefined ? totalFuelLoad(f) : 0) + (canopy !== undefined ? canopyFuelLoad(canopy) : 0);
  };
  for (let i = 0; i < n; i++) fuelLeft[i] = initialLoad(i);
  let active: number[] = [];
  const heap = new EventHeap();
  let time = 0;
  let lastStats: FireStepStats = { ignitions: 0, embersLofted: 0, spotFires: 0, budgetHit: false };

  // Behaviour cache: each cell's spread ellipse under the current epoch's weather and moisture.
  let epoch = 1;
  const behaviourEpoch = new Uint32Array(n);
  const bHead = new Float32Array(n);
  const bEcc = new Float32Array(n);
  const bHeading = new Float32Array(n);
  const bHpa = new Float32Array(n);
  const bResidence = new Float32Array(n);
  const bSurfaceIntensity = new Float32Array(n);
  const bKind = new Uint8Array(n);
  const bMidflame = new Float32Array(n);
  let weather: FireWeather | null = null;
  let moistureField: FireMoistureField | null = null;
  let fieldVersion = -1;
  const paletteBeds = new Map<number, SurfaceFuelbed>();
  let fm10Bed: SurfaceFuelbed | undefined;

  function moistureOf(i: number, w: FireWeather): FuelMoisture {
    return moistureField !== null ? moistureField.moistureAt(i) : w.moisture;
  }

  function bedOf(i: number, w: FireWeather): SurfaceFuelbed {
    const f = fuels[fuel[i] ?? 0];
    if (f === undefined) throw new Error("fire fuel palette index out of range");
    if (moistureField === null) {
      const key = fuel[i] ?? 0;
      let bed = paletteBeds.get(key);
      if (bed === undefined) {
        bed = surfaceFuelbed(f, w.moisture);
        paletteBeds.set(key, bed);
      }
      return bed;
    }
    return surfaceFuelbed(f, moistureOf(i, w));
  }

  function behaviour(i: number): void {
    if (behaviourEpoch[i] === epoch) return;
    behaviourEpoch[i] = epoch;
    const w = weather;
    if (w === null) {
      bHead[i] = 0;
      return;
    }
    const f = fuels[fuel[i] ?? 0];
    const c = canopyOf[i] ?? -1;
    const canopy = c >= 0 ? canopies[c] : undefined;
    const bed = bedOf(i, w);
    const waf = windAdjustmentFactor(f?.depthM ?? 0, canopy !== undefined ? { cover: canopy.cover, heightM: canopy.heightM, crownRatio: canopy.heightM > 0 ? (canopy.heightM - canopy.baseHeightM) / canopy.heightM : 0 } : undefined);
    const midflame = w.twentyFootWind * waf;
    const up = upslope[i] ?? 0;
    const spread = surfaceSpread(bed, { midflameWind: midflame, windAngle: w.windDirection - up, slope: slopeTan[i] ?? 0, windLimit: tune.windLimit });
    bMidflame[i] = midflame;
    bHpa[i] = bed.heatPerUnitArea;
    bResidence[i] = bed.residenceTime;
    bSurfaceIntensity[i] = spread.firelineIntensity;
    let head = spread.headRate;
    let ecc = spread.eccentricity;
    let heading = up + spread.headingAngle;
    let k = spread.headRate > 0 ? 1 : 0;
    if (tune.crownFire && canopy !== undefined && spread.headRate > 0 && FM10 !== undefined) {
      const moisture = moistureOf(i, w);
      const ownBed = moistureField === null ? (fm10Bed ??= surfaceFuelbed(FM10, w.moisture)) : surfaceFuelbed(FM10, moisture);
      const crown = assessCrownFire({ canopy, moisture, twentyFootWind: w.twentyFootWind, surfaceIntensity: spread.firelineIntensity, surfaceHeatPerUnitArea: bed.heatPerUnitArea, fm10Bed: ownBed });
      if (crown.type === "crowning") {
        k = 3;
        head = Math.max(head, crown.crownRate);
        ecc = ellipseEccentricity(crown.lengthToBreadth);
        heading = w.windDirection;
      } else if (crown.type === "torching") {
        k = 2;
      }
    }
    bHead[i] = head;
    bEcc[i] = ecc;
    bHeading[i] = heading;
    bKind[i] = k;
  }

  /** Rate along a ray at world direction `phi` from the cell's ellipse focus, on the slope surface. */
  function rayRate(i: number, phi: number): number {
    behaviour(i);
    const head = bHead[i] ?? 0;
    if (head <= 0) return 0;
    const e = bEcc[i] ?? 0;
    const along = (head * (1 - e)) / (1 - e * Math.cos(phi - (bHeading[i] ?? 0)));
    const s = (slopeTan[i] ?? 0) * Math.cos(phi - (upslope[i] ?? 0));
    return along / Math.sqrt(1 + s * s);
  }

  function offsets(): readonly (readonly [number, number])[] {
    return tune.stencil === 8 ? OFFSETS_8 : tune.stencil === 16 ? OFFSETS_16 : OFFSETS_32;
  }

  /** Travel time from cell (c,r) to (c+dx, r+dz): Finney's segment integration through crossed cells. */
  function travel(c: number, r: number, dx: number, dz: number): { time: number; rate: number } {
    const pieces = 2 * Math.max(Math.abs(dx), Math.abs(dz));
    const phi = Math.atan2(dz, dx);
    const piece = (Math.hypot(dx, dz) * cellSize) / pieces;
    let t = 0;
    let lastRate = 0;
    for (let p = 0; p < pieces; p++) {
      const s = (p + 0.5) / pieces;
      const cc = Math.floor(c + 0.5 + dx * s);
      const rr = Math.floor(r + 0.5 + dz * s);
      const rate = rayRate(rr * cols + cc, phi);
      if (rate <= 0) return { time: Infinity, rate: 0 };
      t += piece / rate;
      lastRate = rate;
    }
    return { time: t, rate: lastRate };
  }

  /**
   * Semi-Lagrangian triangle update: the front may reach cell `j` from any point on the edge between
   * burnt neighbours `i` and `k`, not only from their centres, so it can travel between stencil
   * directions. Arrival along the edge is interpolated linearly and travel time minimised by golden
   * section.
   */
  function triangle(i: number, k: number, j: number): void {
    const ti = arrival[i] ?? Infinity;
    const tk = arrival[k] ?? Infinity;
    if (ti === Infinity || tk === Infinity) return;
    const ci = i % cols;
    const ri = (i - ci) / cols;
    const ck = k % cols;
    const rk = (k - ck) / cols;
    const cj = j % cols;
    const rj = (j - cj) / cols;
    let bestRate = 0;
    const cost = (lambda: number): number => {
      const dx = cj - (ci + (ck - ci) * lambda);
      const dz = rj - (ri + (rk - ri) * lambda);
      const d = Math.hypot(dx, dz) * cellSize;
      const phi = Math.atan2(dz, dx);
      const a = rayRate(i, phi);
      const b = rayRate(k, phi);
      const c = rayRate(j, phi);
      if (a <= 0 || b <= 0 || c <= 0) return Infinity;
      bestRate = c;
      return ti + (tk - ti) * lambda + (d / 2) * ((1 - lambda) / a + lambda / b) + d / 2 / c;
    };
    const g = 0.6180339887498949;
    let lo = 0;
    let hi = 1;
    let x1 = hi - g * (hi - lo);
    let x2 = lo + g * (hi - lo);
    let f1 = cost(x1);
    let f2 = cost(x2);
    for (let it = 0; it < 18; it++) {
      if (f1 <= f2) {
        hi = x2;
        x2 = x1;
        f2 = f1;
        x1 = hi - g * (hi - lo);
        f1 = cost(x1);
      } else {
        lo = x1;
        x1 = x2;
        f1 = f2;
        x2 = lo + g * (hi - lo);
        f2 = cost(x2);
      }
    }
    const lambda = f1 <= f2 ? x1 : x2;
    const best = cost(lambda);
    if (best < Infinity) schedule(j, best, bestRate);
  }

  function schedule(cell: number, at: number, rate: number): void {
    if (at < (tentative[cell] ?? Infinity)) {
      tentative[cell] = at;
      crossRate[cell] = rate;
      heap.push(at, cell);
    }
  }

  function cellOf(x: number, z: number): number {
    const c = Math.floor((x - originX) / cellSize);
    const r = Math.floor((z - originZ) / cellSize);
    return c >= 0 && r >= 0 && c < cols && r < rows ? r * cols + c : -1;
  }

  function loftEmbers(i: number, at: number, w: FireWeather, stats: FireStepStats): void {
    if (!tune.spotting || w.twentyFootWind <= 0) return;
    const k = bKind[i] ?? 0;
    const chance = k >= 2 ? tune.crownEmberChance : tune.surfaceEmberChance;
    if (chance <= 0 || rng() >= chance) return;
    const c = canopyOf[i] ?? -1;
    const canopy = c >= 0 ? canopies[c] : undefined;
    const terrain = { coverHeightM: canopy?.heightM ?? 0, openCover: canopy !== undefined && canopy.cover < 0.5 };
    const max =
      k >= 2 && canopy !== undefined
        ? torchingTreeSpotDistance({ species: tune.emberSpecies, dbhM: tune.emberDbhM, treeHeightM: canopy.heightM, trees: k === 3 ? tune.emberTrees * 2 : tune.emberTrees, twentyFootWind: w.twentyFootWind, terrain }).flat
        : surfaceFireSpotDistance(flameLen[i] ?? 0, w.twentyFootWind, terrain).flat;
    stats.embersLofted++;
    const distance = max * rng();
    const direction = w.windDirection + (rng() - 0.5) * tune.emberScatter;
    const roll = rng();
    if (distance < cellSize) return;
    const col = i % cols;
    const row = (i - col) / cols;
    const x = originX + (col + 0.5) * cellSize + Math.cos(direction) * distance;
    const z = originZ + (row + 0.5) * cellSize + Math.sin(direction) * distance;
    const target = cellOf(x, z);
    if (target < 0 || (arrival[target] ?? Infinity) < Infinity) return;
    behaviour(target);
    if ((bHead[target] ?? 0) <= 0) return;
    const p = emberIgnitionProbability(moistureOf(target, w).oneHour, w.fuelTemperatureC ?? w.airTemperatureC);
    if (roll >= p) return;
    const flight = distance / Math.max(0.1, w.twentyFootWind);
    if (at + flight < (tentative[target] ?? Infinity)) {
      spotted[target] = 1;
      stats.spotFires++;
      schedule(target, at + flight, bHead[target] ?? 0);
    }
  }

  function igniteCell(i: number, at: number, w: FireWeather, stats: FireStepStats): void {
    behaviour(i);
    arrival[i] = at;
    stats.ignitions++;
    const f = fuels[fuel[i] ?? 0];
    const crossed = crossRate[i] ?? 0;
    const rate = crossed > 0 ? crossed : Math.max(bHead[i] ?? 0, 1e-6);
    const k = bKind[i] ?? 0;
    kind[i] = k;
    const c = canopyOf[i] ?? -1;
    const canopy = c >= 0 ? canopies[c] : undefined;
    const surfaceI = (bHpa[i] ?? 0) * rate;
    let canopyConsumed = 0;
    if (canopy !== undefined && k >= 2) {
      // Van Wagner 1993 crown fraction burned from the surface rate's excess over the initiation rate (m/min).
      const ro = crownInitiationIntensity(canopy) / Math.max(1e-6, bHpa[i] ?? 0);
      const cfb = k === 3 ? 1 : 1 - Math.exp(-0.23 * Math.max(0, (rate - ro) * 60));
      canopyConsumed = canopyFuelLoad(canopy) * cfb;
    }
    const fireI = k >= 2 ? rate * ((bHpa[i] ?? 0) + canopyConsumed * CANOPY_HEAT_KJ_KG) : surfaceI;
    intensity[i] = fireI;
    flameLen[i] = k >= 2 ? crownFlameLength(fireI) : flameLength(surfaceI);
    scorch[i] = scorchHeight(surfaceI, bMidflame[i] ?? 0, w.airTemperatureC);
    let flaming = (bResidence[i] ?? 0) + cellSize / rate;
    let burnout = flaming;
    let surfaceConsumed = 0;
    if (f !== undefined) {
      const bed = bedOf(i, w);
      surfaceConsumed = bed.deadLoad + (bed.liveExtinctionMoisture > bed.liveMoisture ? bed.liveLoad : 0);
      if (f.load.tenHour > 0) burnout = Math.max(burnout, TEN_HOUR_BURNOUT);
      if (f.load.hundredHour > 0) burnout = Math.max(burnout, HUNDRED_HOUR_BURNOUT);
      flaming = Math.max(flaming, burnoutSeconds(f.oneHourSavr));
    }
    const total = initialLoad(i);
    consumed[i] = Math.min(total, surfaceConsumed + canopyConsumed);
    const surfaceTotal = f !== undefined ? totalFuelLoad(f) : 0;
    char[i] = surfaceTotal > 0 ? Math.min(1, surfaceConsumed / surfaceTotal) : 0;
    flameEnd[i] = at + flaming;
    burnEnd[i] = at + Math.max(burnout, flaming);
    state[i] = 1;
    active.push(i);

    const col = i % cols;
    const row = (i - col) / cols;
    for (const [dx, dz] of offsets()) {
      const cc = col + dx;
      const rr = row + dz;
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
      const j = rr * cols + cc;
      if ((arrival[j] ?? Infinity) < Infinity) continue;
      const leg = travel(col, row, dx, dz);
      if (leg.time < Infinity) schedule(j, at + leg.time, leg.rate);
      if (Math.abs(dx) > 1 || Math.abs(dz) > 1) continue;
      // The burnt cells k next to both this cell and j close a triangle the front can cross.
      for (const [kx, kz] of RING) {
        const kc = col + kx;
        const kr = row + kz;
        if (kc < 0 || kr < 0 || kc >= cols || kr >= rows || (kx === dx && kz === dz)) continue;
        if (Math.abs(kc - cc) > 1 || Math.abs(kr - rr) > 1) continue;
        triangle(i, kr * cols + kc, j);
      }
    }
    loftEmbers(i, at, w, stats);
  }

  function updateActive(now: number): void {
    const still: number[] = [];
    for (const i of active) {
      const start = arrival[i] ?? now;
      const end = burnEnd[i] ?? now;
      const total = initialLoad(i);
      const eaten = consumed[i] ?? 0;
      const progress = end > start ? Math.min(1, (now - start) / (end - start)) : 1;
      fuelLeft[i] = total - eaten * progress;
      ash[i] = eaten * progress * ASH_FRACTION;
      if (now >= end) {
        state[i] = 3;
        fuelLeft[i] = total - eaten;
        ash[i] = eaten * ASH_FRACTION;
      } else {
        state[i] = now < (flameEnd[i] ?? 0) ? 1 : 2;
        still.push(i);
      }
    }
    active = still;
  }

  function step(dt: number, w: FireWeather): FireStepStats {
    if (!Number.isFinite(dt) || dt < 0) throw new Error("fire dt must be finite and nonnegative");
    assertWeather(w);
    const changed =
      weather === null ||
      weather.twentyFootWind !== w.twentyFootWind ||
      weather.windDirection !== w.windDirection ||
      weather.airTemperatureC !== w.airTemperatureC ||
      !sameMoisture(weather.moisture, w.moisture) ||
      (moistureField !== null && moistureField.version !== fieldVersion);
    if (changed) {
      epoch++;
      paletteBeds.clear();
      fm10Bed = undefined;
      fieldVersion = moistureField?.version ?? -1;
    }
    weather = { ...w, moisture: { ...w.moisture } };
    const target = time + dt;
    const stats: FireStepStats = { ignitions: 0, embersLofted: 0, spotFires: 0, budgetHit: false };
    let events = 0;
    while (heap.size > 0 && heap.peekTime() <= target) {
      if (events >= tune.maxEventsPerStep) {
        stats.budgetHit = true;
        break;
      }
      const at = heap.peekTime();
      const i = heap.pop();
      if ((arrival[i] ?? Infinity) < Infinity || at > (tentative[i] ?? Infinity)) continue;
      events++;
      igniteCell(i, at, weather, stats);
    }
    time = target;
    updateActive(time);
    lastStats = stats;
    return stats;
  }

  function index(col: number, row: number): number {
    if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= cols || row >= rows) throw new Error(`fire cell out of bounds: ${col},${row}`);
    return row * cols + col;
  }

  function ignite(col: number, row: number, at = time): void {
    if (!Number.isFinite(at) || at < time) throw new Error("fire ignition time must be finite and not in the past");
    const i = index(col, row);
    if ((arrival[i] ?? Infinity) < Infinity) return;
    schedule(i, at, 0);
  }

  function rebuildHeap(): void {
    heap.clear();
    for (let i = 0; i < n; i++) if ((arrival[i] ?? Infinity) === Infinity && (tentative[i] ?? Infinity) < Infinity) heap.push(tentative[i] ?? Infinity, i);
  }

  const layers: FireLayers = { state, kind, arrival, intensity, flameLength: flameLen, scorchHeight: scorch, char, ash, fuelLeft };

  return {
    cols,
    rows,
    cellSize,
    originX,
    originZ,
    get time() {
      return time;
    },
    layers,
    step,
    ignite,
    igniteAt(x, z, at) {
      const i = cellOf(x, z);
      if (i < 0) return false;
      ignite(i % cols, Math.floor(i / cols), at);
      return true;
    },
    setFuel(col, row, fuelIndex) {
      if (!Number.isInteger(fuelIndex) || fuelIndex < 0 || fuelIndex >= fuels.length) throw new Error("fire fuel index is outside the palette");
      const i = index(col, row);
      fuel[i] = fuelIndex;
      behaviourEpoch[i] = 0;
      if ((arrival[i] ?? Infinity) === Infinity) fuelLeft[i] = initialLoad(i);
    },
    setMoistureField(field) {
      moistureField = field;
      fieldVersion = -1;
      epoch++;
      paletteBeds.clear();
      fm10Bed = undefined;
    },
    cell(col, row) {
      const i = index(col, row);
      return {
        state: STATES[state[i] ?? 0] ?? "unburnt",
        kind: KINDS[kind[i] ?? 0] ?? "none",
        arrival: arrival[i] ?? Infinity,
        intensity: intensity[i] ?? 0,
        flameLength: flameLen[i] ?? 0,
        scorchHeight: scorch[i] ?? 0,
        char: char[i] ?? 0,
        ash: ash[i] ?? 0,
        fuelLeft: fuelLeft[i] ?? 0,
        spotted: spotted[i] === 1,
      };
    },
    cellIndexAt: cellOf,
    activeCells: () => active,
    burnedArea() {
      let count = 0;
      for (let i = 0; i < n; i++) if ((arrival[i] ?? Infinity) <= time) count++;
      return count * cellSize * cellSize;
    },
    stats: () => lastStats,
    snapshot() {
      return {
        version: 1,
        time,
        rng: rng.state(),
        epoch,
        fuel: encodeFireArray(fuel),
        arrival: encodeFireArray(arrival),
        tentative: encodeFireArray(tentative),
        crossRate: encodeFireArray(crossRate),
        flameEnd: encodeFireArray(flameEnd),
        burnEnd: encodeFireArray(burnEnd),
        state: encodeFireArray(state),
        kind: encodeFireArray(kind),
        spotted: encodeFireArray(spotted),
        intensity: encodeFireArray(intensity),
        flameLength: encodeFireArray(flameLen),
        scorchHeight: encodeFireArray(scorch),
        char: encodeFireArray(char),
        ash: encodeFireArray(ash),
        fuelLeft: encodeFireArray(fuelLeft),
        consumed: encodeFireArray(consumed),
        active: [...active],
      };
    },
    restore(s) {
      if (s.version !== 1) throw new Error("fire snapshot version is not supported");
      if (!Number.isFinite(s.time) || s.time < 0) throw new Error("fire snapshot time is invalid");
      decodeFireArray(s.fuel, fuel, "fuel");
      for (let i = 0; i < n; i++) if ((fuel[i] ?? 0) >= fuels.length) throw new Error("fire snapshot fuel index is outside the palette");
      decodeFireArray(s.arrival, arrival, "arrival");
      decodeFireArray(s.tentative, tentative, "tentative");
      decodeFireArray(s.crossRate, crossRate, "crossRate");
      decodeFireArray(s.flameEnd, flameEnd, "flameEnd");
      decodeFireArray(s.burnEnd, burnEnd, "burnEnd");
      decodeFireArray(s.state, state, "state");
      decodeFireArray(s.kind, kind, "kind");
      decodeFireArray(s.spotted, spotted, "spotted");
      decodeFireArray(s.intensity, intensity, "intensity");
      decodeFireArray(s.flameLength, flameLen, "flameLength");
      decodeFireArray(s.scorchHeight, scorch, "scorchHeight");
      decodeFireArray(s.char, char, "char");
      decodeFireArray(s.ash, ash, "ash");
      decodeFireArray(s.fuelLeft, fuelLeft, "fuelLeft");
      decodeFireArray(s.consumed, consumed, "consumed");
      if (!s.active.every((i) => Number.isInteger(i) && i >= 0 && i < n)) throw new Error("fire snapshot active cells are invalid");
      active = [...s.active];
      time = s.time;
      rng.restore(s.rng);
      epoch = Math.max(epoch, s.epoch) + 1;
      paletteBeds.clear();
      fm10Bed = undefined;
      rebuildHeap();
    },
    reset() {
      fuel.set(initialFuel);
      arrival.fill(Infinity);
      tentative.fill(Infinity);
      crossRate.fill(0);
      flameEnd.fill(0);
      burnEnd.fill(0);
      state.fill(0);
      kind.fill(0);
      spotted.fill(0);
      intensity.fill(0);
      flameLen.fill(0);
      scorch.fill(0);
      char.fill(0);
      ash.fill(0);
      consumed.fill(0);
      for (let i = 0; i < n; i++) fuelLeft[i] = initialLoad(i);
      active = [];
      heap.clear();
      time = 0;
      rng.restore(initialRng);
      epoch++;
      paletteBeds.clear();
      fm10Bed = undefined;
      weather = null;
    },
    retune(partial) {
      tune = validTuning({ ...tune, ...partial });
      epoch++;
    },
    tuning: () => ({ ...tune }),
  };
}
