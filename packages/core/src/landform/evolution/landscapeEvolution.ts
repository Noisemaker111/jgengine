// @skill jgengine-world
/**
 * A landscape evolution model: land grows from tectonic uplift and is cut down by rivers, hillslope
 * creep and landslides, and the eroded sediment is carried and laid down again as fans, floodplains,
 * lake fill and deltas. Each step, in order:
 *
 * 1. uplift raises the rock (and the strata with it);
 * 2. water is routed (Priority-Flood lakes, D8 receivers, the Braun & Willett stack, drainage area);
 * 3. rivers incise by the stream-power law, implicit and O(n);
 * 4. sediment runs downstream and settles: in standing water all of it, up to the water surface, and
 *    on land a share G·a/A of the passing flux (the ξ–q erosion–deposition model of Davy & Lague 2009,
 *    in the form of Yuan et al. 2019), which builds fans where rivers leave the mountains;
 * 5. hillslopes creep by linear diffusion, implicit;
 * 6. any slope steeper than its rock's critical angle fails and the debris rests at the angle of repose.
 *
 * Units are metres and years. State is plain arrays with {@link LandscapeEvolution.snapshot} and
 * {@link LandscapeEvolution.restore}; params retune between steps; randomness comes only from the
 * seed; one step costs O(n log n) in grid cells. Maths uses only operations every JS engine rounds
 * the same way, so a seed gives the same landscape, bit for bit, in bun and in a browser.
 *
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
import { seededRng } from "../../random/rng";
import { createFlowRouter, type FlowRouting } from "../flow/flowRouting";
import { landformTopology, type LandformGrid } from "../grid/landformGrid";
import { createHillslopeDiffuser } from "./hillslopeDiffusion";
import { createLandslider } from "./landsliding";
import { resolveStrata, tanDegrees, UNIFORM_ROCK, type LandformStrata, type ResolvedStrata } from "./rockStrata";
import { incise } from "./streamPower";

/** Physical parameters of a landscape evolution run; every one can be retuned between steps. */
export interface LandformParams {
  /** Rock uplift rate in m/yr. */
  uplift: number;
  /** Per-cell multiplier on uplift, row-major (a mountain belt, a tilted block). Default uniform. */
  upliftMap?: readonly number[];
  /** Per-cell multiplier on rainfall, weighting each cell's share of river discharge. Default uniform. */
  rainfall?: readonly number[];
  /** River erodibility K in m^(1−2m)/yr, before rock layers scale it. */
  erodibility: number;
  /** Drainage-area exponent m of the stream-power law. */
  areaExponent: number;
  /** Slope exponent n of the stream-power law. */
  slopeExponent: number;
  /** Hillslope diffusivity D in m²/yr on land. */
  diffusivity: number;
  /** Diffusivity in m²/yr under standing water, spreading deltas and lake floors. */
  marineDiffusivity: number;
  /** Dimensionless deposition coefficient G; 0 carries all sediment out, about 1 builds wide fans. */
  deposition: number;
  /** Multiplier on K where loose sediment covers the rock. */
  sedimentErodibility: number;
  /** Angle of repose of loose sediment and debris, in degrees. */
  reposeAngle: number;
  /** Sea surface in metres; base-level cells below it, and land joined to them below it, are sea. Default none. */
  seaLevel?: number;
  /** Default step length in years. */
  timeStep: number;
  /** Rock layers. Default one uniform rock standing at 45°. */
  strata?: LandformStrata;
}

/**
 * Sensible defaults for a 100 m grid: 1 mm/yr uplift, K = 2·10⁻⁵, m = 0.5, n = 1 (concavity 0.5),
 * D = 0.01 m²/yr, repose 34°, 10 kyr steps.
 */
export const DEFAULT_LANDFORM_PARAMS: LandformParams = {
  uplift: 1e-3,
  erodibility: 2e-5,
  areaExponent: 0.5,
  slopeExponent: 1,
  diffusivity: 0.01,
  marineDiffusivity: 1,
  deposition: 0,
  sedimentErodibility: 2,
  reposeAngle: 34,
  timeStep: 1e4,
};

/** Starting surface of a run. */
export interface LandformInitial {
  /** Starting heights in metres, row-major. Default flat at 0. */
  heights?: ArrayLike<number>;
  /** Amplitude in metres of seeded random roughness added to non-outlet cells, which seeds the drainage network. Default 1. */
  roughness?: number;
}

/** What one step did. Volumes in m³, rates in m/yr. */
export interface LandformStepReport {
  /** Rock and sediment volume rivers removed. */
  eroded: number;
  /** Sediment volume laid down by rivers and in standing water. */
  deposited: number;
  /** Volume that left the map through outlets. */
  exported: number;
  /** Volume that failed in landslides. */
  landslid: number;
  /** Largest |∂z/∂t| over non-outlet cells; near 0 at steady state, when erosion balances uplift. */
  maxRate: number;
  /** Mean |∂z/∂t| over non-outlet cells. */
  meanRate: number;
}

/** Plain-JSON state of a run, enough to resume it exactly. */
export interface LandformSnapshot {
  version: 1;
  grid: LandformGrid;
  params: LandformParams;
  seed: string;
  time: number;
  steps: number;
  height: readonly number[];
  sediment: readonly number[];
  exhumation: readonly number[];
  debris: readonly number[];
}

/** Per-cell fields of a run. The arrays are live; read them, never write them. */
export interface LandformFields {
  /** Ground surface in metres. */
  readonly height: Float64Array;
  /** Thickness in metres of loose sediment (alluvium, colluvium, debris) over bedrock. */
  readonly sediment: Float64Array;
  /** Rock uplifted through each cell since the start, in metres; the rock now at height z formed at z − exhumation. */
  readonly exhumation: Float64Array;
  /** Index into the strata's layers of the bedrock under each cell. */
  readonly layer: Uint8Array;
  /** Cumulative debris thickness laid by landslide runout, in metres. */
  readonly debris: Float64Array;
}

/** A running landscape. */
export interface LandscapeEvolution {
  readonly grid: LandformGrid;
  readonly seed: string;
  /** Current params. */
  params(): LandformParams;
  /** Change params between steps; arrays are copied. */
  retune(patch: Partial<LandformParams>): void;
  /** Advance one step of `dt` years (default the params' time step). */
  step(dt?: number): LandformStepReport;
  /** Advance `years` in whole time steps (at most `maxSteps`, default 100 000); returns the last report. */
  run(years: number, maxSteps?: number): LandformStepReport;
  /** Model years since the start. */
  time(): number;
  /** Steps taken since the start. */
  steps(): number;
  /** Live per-cell fields. */
  fields(): LandformFields;
  /** Water routing of the current surface: lakes, receivers, drainage area. */
  routing(): FlowRouting;
  /** Plain-JSON state. */
  snapshot(): LandformSnapshot;
  /** Resume from a snapshot taken on a grid of the same size. */
  restore(snapshot: LandformSnapshot): void;
  /** Back to the starting surface, time 0. */
  reset(): void;
  /** A hash of the surface and sediment bits; equal hashes mean identical landscapes. */
  hash(): string;
}

/** Options for {@link createLandscapeEvolution}. */
export interface LandscapeEvolutionOptions {
  grid: LandformGrid;
  /** Params over {@link DEFAULT_LANDFORM_PARAMS}. */
  params?: Partial<LandformParams>;
  /** Seed of the starting roughness. */
  seed: string;
  initial?: LandformInitial;
}

const LOOSE_DEPTH = 1;

function checkMap(name: string, map: readonly number[] | undefined, cells: number): void {
  if (map !== undefined && map.length !== cells) throw new Error(`landform ${name} has ${map.length} values for ${cells} cells`);
}

function copyParams(params: LandformParams): LandformParams {
  const { upliftMap, rainfall, strata, seaLevel, ...rest } = params;
  return {
    ...rest,
    ...(upliftMap === undefined ? {} : { upliftMap: [...upliftMap] }),
    ...(rainfall === undefined ? {} : { rainfall: [...rainfall] }),
    ...(strata === undefined ? {} : { strata: { ...strata, layers: strata.layers.map((layer) => ({ ...layer })) } }),
    ...(seaLevel === undefined ? {} : { seaLevel }),
  };
}

/**
 * Hash of float arrays by their exact bits (FNV-1a over 32-bit words), as 8 hex digits per array.
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
export function hashLandformArrays(...arrays: readonly Float64Array[]): string {
  let out = "";
  for (const array of arrays) {
    const words = new Uint32Array(array.buffer, array.byteOffset, array.length * 2);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < words.length; i += 1) {
      h ^= words[i] ?? 0;
      h = Math.imul(h, 16777619) >>> 0;
    }
    out += h.toString(16).padStart(8, "0");
  }
  return out;
}

/**
 * Start a landscape evolution run on a grid.
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
export function createLandscapeEvolution(options: LandscapeEvolutionOptions): LandscapeEvolution {
  const grid: LandformGrid = { ...options.grid, ...(options.grid.outlets === undefined ? {} : { outlets: [...options.grid.outlets] }) };
  const topology = landformTopology(grid);
  const { cells, base, cellArea, cols, rows, cellSize } = topology;
  const seed = options.seed;
  let params = copyParams({ ...DEFAULT_LANDFORM_PARAMS, ...options.params });
  checkMap("upliftMap", params.upliftMap, cells);
  checkMap("rainfall", params.rainfall, cells);
  let strata: ResolvedStrata = resolveStrata(params.strata ?? UNIFORM_ROCK, cols, rows, cellSize);
  let rockSlopes = strata.layers.map((layer) => tanDegrees(layer.criticalAngle ?? 45));
  let reposeSlope = tanDegrees(params.reposeAngle);

  const start = new Float64Array(cells);
  const heights = options.initial?.heights;
  if (heights !== undefined && heights.length !== cells) throw new Error(`landform initial heights have ${heights.length} values for ${cells} cells`);
  const roughness = options.initial?.roughness ?? 1;
  const random = seededRng(`${seed}/initial`);
  for (let i = 0; i < cells; i += 1) {
    const h = heights?.[i] ?? 0;
    start[i] = base[i] === 1 ? h : h + roughness * random();
  }

  const height = new Float64Array(start);
  const sediment = new Float64Array(cells);
  const exhumation = new Float64Array(cells);
  const debris = new Float64Array(cells);
  const failed = new Float64Array(cells);
  const layer = new Uint8Array(cells);
  const before = new Float64Array(cells);
  const erosion = new Float64Array(cells);
  const flux = new Float64Array(cells);
  const wet = new Uint8Array(cells);
  const kCell = new Float64Array(cells);
  const dCell = new Float64Array(cells);
  const critical = new Float64Array(cells);
  const router = createFlowRouter(topology);
  const diffuser = createHillslopeDiffuser(topology);
  const slider = createLandslider(topology);
  let time = 0;
  let steps = 0;

  function classify(): void {
    for (let i = 0; i < cells; i += 1) {
      const k = strata.layerAt(i, (height[i] ?? 0) - (sediment[i] ?? 0) - (exhumation[i] ?? 0));
      layer[i] = k;
    }
  }

  function route(): void {
    router.route(height, params.seaLevel ?? Number.NEGATIVE_INFINITY, params.rainfall);
    const { water } = router;
    for (let i = 0; i < cells; i += 1) wet[i] = (water[i] ?? 0) > (height[i] ?? 0) ? 1 : 0;
  }

  function materialProperties(): void {
    const layers = strata.layers;
    for (let i = 0; i < cells; i += 1) {
      const rock = layers[layer[i] ?? 0];
      const loose = (sediment[i] ?? 0) >= LOOSE_DEPTH;
      kCell[i] = params.erodibility * (rock?.erodibility ?? 1);
      dCell[i] = wet[i] === 1 ? params.marineDiffusivity : params.diffusivity * (loose ? 1 : (rock?.diffusivity ?? 1));
      critical[i] = rockSlopes[layer[i] ?? 0] ?? 1;
    }
  }

  function strip(i: number, loss: number): void {
    const s = sediment[i] ?? 0;
    sediment[i] = s > loss ? s - loss : 0;
  }

  function settle(report: LandformStepReport): void {
    const { stack, receiver, area, water } = router;
    flux.fill(0);
    const g = params.deposition;
    for (let s = cells - 1; s >= 0; s -= 1) {
      const i = stack[s] ?? 0;
      const volume = (flux[i] ?? 0) + (erosion[i] ?? 0) * cellArea;
      if (volume <= 0) continue;
      const r = receiver[i] ?? i;
      if (r === i) {
        report.exported += volume;
        continue;
      }
      let laid = 0;
      if (wet[i] === 1) {
        const room = ((water[i] ?? 0) - (height[i] ?? 0)) * cellArea;
        laid = room > 0 ? (volume < room ? volume : room) : 0;
      } else if (g > 0) {
        const share = (g * cellArea) / (area[i] ?? cellArea);
        laid = volume * (share < 1 ? share : 1);
      }
      if (laid > 0) {
        height[i] = (height[i] ?? 0) + laid / cellArea;
        sediment[i] = (sediment[i] ?? 0) + laid / cellArea;
        report.deposited += laid;
      }
      flux[r] = (flux[r] ?? 0) + volume - laid;
    }
  }

  function step(dtIn?: number): LandformStepReport {
    const dt = dtIn ?? params.timeStep;
    if (!(dt > 0)) throw new Error(`landform step needs a positive dt, got ${dt}`);
    const report: LandformStepReport = { eroded: 0, deposited: 0, exported: 0, landslid: 0, maxRate: 0, meanRate: 0 };
    before.set(height);
    const map = params.upliftMap;
    for (let i = 0; i < cells; i += 1) {
      if (base[i] === 1) continue;
      const u = params.uplift * (map?.[i] ?? 1) * dt;
      height[i] = (height[i] ?? 0) + u;
      exhumation[i] = (exhumation[i] ?? 0) + u;
    }
    classify();
    route();
    materialProperties();

    incise({
      height,
      routing: router,
      wet,
      erodibility: kCell,
      looseErodibility: params.erodibility * params.sedimentErodibility,
      sediment,
      areaExponent: params.areaExponent,
      slopeExponent: params.slopeExponent,
      dt,
      erosion,
    });
    for (let i = 0; i < cells; i += 1) {
      const e = erosion[i] ?? 0;
      if (e <= 0) continue;
      report.eroded += e * cellArea;
      strip(i, e);
    }
    settle(report);

    if (params.diffusivity > 0 || params.marineDiffusivity > 0) {
      erosion.set(height);
      diffuser.diffuse(height, dCell, dt);
      for (let i = 0; i < cells; i += 1) {
        const change = (height[i] ?? 0) - (erosion[i] ?? 0);
        if (change > 0) sediment[i] = (sediment[i] ?? 0) + change;
        else if (change < 0) strip(i, -change);
      }
    }

    failed.fill(0);
    flux.fill(0);
    const slid = slider.collapse(height, sediment, critical, reposeSlope, flux, failed);
    report.landslid = slid.failed;
    report.exported += slid.exported;
    for (let i = 0; i < cells; i += 1) debris[i] = (debris[i] ?? 0) + (flux[i] ?? 0);
    for (let i = 0; i < cells; i += 1) {
      if (base[i] === 1) continue;
      const rate = Math.abs((height[i] ?? 0) - (before[i] ?? 0)) / dt;
      if (rate > report.maxRate) report.maxRate = rate;
      report.meanRate += rate;
    }
    let interior = 0;
    for (let i = 0; i < cells; i += 1) if (base[i] !== 1) interior += 1;
    report.meanRate = interior > 0 ? report.meanRate / interior : 0;
    classify();
    route();
    time += dt;
    steps += 1;
    return report;
  }

  function restoreFrom(snapshot: LandformSnapshot): void {
    if (snapshot.grid.cols !== cols || snapshot.grid.rows !== rows) throw new Error(`landform snapshot is ${snapshot.grid.cols}×${snapshot.grid.rows}, this run is ${cols}×${rows}`);
    if (snapshot.height.length !== cells || snapshot.sediment.length !== cells || snapshot.exhumation.length !== cells || snapshot.debris.length !== cells) throw new Error("landform snapshot arrays do not match the grid");
    retune(snapshot.params);
    height.set(snapshot.height);
    sediment.set(snapshot.sediment);
    exhumation.set(snapshot.exhumation);
    debris.set(snapshot.debris);
    time = snapshot.time;
    steps = snapshot.steps;
    classify();
    route();
  }

  function retune(patch: Partial<LandformParams>): void {
    const next = copyParams({ ...params, ...patch });
    checkMap("upliftMap", next.upliftMap, cells);
    checkMap("rainfall", next.rainfall, cells);
    params = next;
    strata = resolveStrata(params.strata ?? UNIFORM_ROCK, cols, rows, cellSize);
    rockSlopes = strata.layers.map((rock) => tanDegrees(rock.criticalAngle ?? 45));
    reposeSlope = tanDegrees(params.reposeAngle);
  }

  classify();
  route();

  return {
    grid,
    seed,
    params: () => copyParams(params),
    retune(patch) {
      retune(patch);
      classify();
    },
    step,
    run(years, maxSteps = 100_000) {
      let last: LandformStepReport = { eroded: 0, deposited: 0, exported: 0, landslid: 0, maxRate: 0, meanRate: 0 };
      const count = Math.min(maxSteps, Math.ceil(years / params.timeStep - 1e-9));
      for (let k = 0; k < count; k += 1) last = step();
      return last;
    },
    time: () => time,
    steps: () => steps,
    fields: () => ({ height, sediment, exhumation, layer, debris }),
    routing: () => router,
    snapshot: () => ({
      version: 1,
      grid: { ...grid },
      params: copyParams(params),
      seed,
      time,
      steps,
      height: Array.from(height),
      sediment: Array.from(sediment),
      exhumation: Array.from(exhumation),
      debris: Array.from(debris),
    }),
    restore: restoreFrom,
    reset() {
      height.set(start);
      sediment.fill(0);
      exhumation.fill(0);
      debris.fill(0);
      time = 0;
      steps = 0;
      classify();
      route();
    },
    hash: () => hashLandformArrays(height, sediment),
  };
}
