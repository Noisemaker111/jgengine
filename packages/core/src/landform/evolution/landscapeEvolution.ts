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
 * 6. glaciers, when on, flow, slide and carve their beds, and drop the rock they carry as till where
 *    the ice ends ({@link GlacialParams});
 * 7. waves, when on, cut sea cliffs back and wear down the platforms they leave ({@link CoastalParams});
 * 8. any slope steeper than its rock's critical angle fails and the debris rests at the angle of repose.
 *
 * Units are metres and years. State is plain arrays with {@link LandscapeEvolution.snapshot} and
 * {@link LandscapeEvolution.restore}; params retune between steps; randomness comes only from the
 * seed; one step costs O(n log n) in grid cells. Maths uses only operations every JS engine rounds
 * the same way, so a seed gives the same landscape, bit for bit, in bun and in a browser.
 *
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
import { seededRng } from "../../random/rng";
import { createWaveEroder } from "../coastal/waveErosion";
import { createFlowRouter, type FlowRouting } from "../flow/flowRouting";
import { createIceFlow, GLEN_RATE_FACTOR, iceDeformationRate } from "../glacial/iceFlow";
import { landformTopology, type LandformGrid } from "../grid/landformGrid";
import { COVER, COVER_CLASSES, createSedimentCover, DEFAULT_GRAIN_SIZES, DEFAULT_ROCK_YIELD, settlingVelocity, weatheredDepth, type GrainSizes } from "../materials/sedimentCover";
import { createHillslopeDiffuser } from "./hillslopeDiffusion";
import { createLandslider } from "./landsliding";
import { resolveStrata, tanDegrees, UNIFORM_ROCK, type LandformStrata, type ResolvedStrata } from "./rockStrata";
import { incise } from "./streamPower";

/** Glaciers: shallow-ice flow with sliding, which erodes the bed (see `glacial/iceFlow`). */
export interface GlacialParams {
  /** Equilibrium line altitude in metres: ice grows above it and melts below. */
  ela: number;
  /** Mass balance gradient in (m/yr of ice) per metre of altitude. Default 0.005. */
  balanceGradient?: number;
  /** Largest accumulation in m/yr. Default 2. */
  maxAccumulation?: number;
  /** Glen's flow rate factor A in Pa⁻³ yr⁻¹. Default 7.57·10⁻¹⁷, temperate ice. */
  flowRate?: number;
  /** Sliding coefficient C of u_b = C·τ_b, in m yr⁻¹ Pa⁻¹. Default 5·10⁻⁴ (50 m/yr under 100 kPa). */
  sliding?: number;
  /** Effective ice viscosity in Pa·yr that couples neighbouring columns' sliding (lateral drag). Default 3·10⁶ (about 10¹⁴ Pa·s). */
  lateralDrag?: number;
  /** Share of the rock a glacier plucks that it drops as till where the ice ends; meltwater carries the rest away. Default 0.25. */
  tillShare?: number;
  /** Erosion constant K_g of ė = K_g·u_b, dimensionless. Default 10⁻⁴ (Humphrey & Raymond 1994). */
  erosion?: number;
  /** Years the ice flows each step; a glacier settles within centuries, so less than a step is enough. Default 1000. */
  iceYears?: number;
  /** Implicit ice steps per landscape step, bounding the work. Default 10. */
  iceSteps?: number;
}

/** Waves on the coast: cliff retreat and platform wear (see `coastal/waveErosion`). Needs a `seaLevel`. */
export interface CoastalParams {
  /** Cliff retreat rate R₀ in m/yr under waves that arrive across deep water. */
  cliffRetreat: number;
  /** Distance W* in metres of shallow water over which waves lose a factor e of their energy. Default 200. */
  attenuation?: number;
  /** Wave base in metres: deeper water does not damp waves. Default 10. */
  waveBase?: number;
  /** Lowering rate in m/yr of a platform at the waterline under full waves. Default 10⁻⁴. */
  platformErosion?: number;
  /** Depth in metres over which platform lowering falls by e. Default 2. */
  platformDepthScale?: number;
  /** Depth below sea level in metres that a retreating cliff is cut to. Default 1. */
  notchDepth?: number;
  /** Share of the sand cut from a cliff that stays as beach; the rest drifts away along the shore. Default 0.5. */
  beachShare?: number;
  /** Most wave sub-steps per step. Default 64. */
  maxSubsteps?: number;
}

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
  /**
   * Dimensionless deposition coefficient G of sand; gravel and silt scale it by their settling
   * speed against sand's. 0 carries all sediment out, about 1 builds wide fans.
   */
  deposition: number;
  /** Multiplier on K where loose sediment covers the rock. */
  sedimentErodibility: number;
  /** Soil production rate P₀ in m/yr from bare bedrock (Heimsath et al. 1997 measured 7.7·10⁻⁵). */
  soilProduction: number;
  /** Soil depth scale h₀ in metres over which production falls by e. */
  soilDepthScale: number;
  /** Representative grain diameters in metres; their settling speeds sort what rivers lay down. Default 20 mm, 0.5 mm, 0.02 mm. */
  grainSizes?: GrainSizes;
  /** Angle of repose of loose sediment and debris, in degrees. */
  reposeAngle: number;
  /** Sea surface in metres; base-level cells below it, and land joined to them below it, are sea. Default none. */
  seaLevel?: number;
  /** Default step length in years. */
  timeStep: number;
  /** Rock layers. Default one uniform rock standing at 45°. */
  strata?: LandformStrata;
  /** Glaciers. Default none. */
  glacial?: GlacialParams;
  /** Waves on the coast, which need `seaLevel`. Default none. */
  coastal?: CoastalParams;
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
  soilProduction: 7.7e-5,
  soilDepthScale: 0.5,
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
  version: 2;
  grid: LandformGrid;
  params: LandformParams;
  seed: string;
  time: number;
  steps: number;
  height: readonly number[];
  sediment: readonly number[];
  exhumation: readonly number[];
  debris: readonly number[];
  /** Cover thickness per cell and class, cell-major in `COVER_CLASSES` order. */
  cover: readonly number[];
  /** Ice thickness per cell in metres. */
  ice: readonly number[];
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
  /** Loose cover per cell and class in metres, `cells × 7`, cell-major in `COVER_CLASSES` order (gravel, sand, silt, scree, soil, till, beach); each cell sums to `sediment`. */
  readonly cover: Float64Array;
  /** Glacier ice thickness in metres. */
  readonly ice: Float64Array;
  /** Glacier sliding speed in m/yr after the last step. */
  readonly iceSliding: Float64Array;
  /** Wave energy, 0..1 of open-sea waves, on sea and cliff cells after the last step. */
  readonly waveEnergy: Float64Array;
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
  const { upliftMap, rainfall, strata, seaLevel, grainSizes, glacial, coastal, ...rest } = params;
  return {
    ...rest,
    ...(upliftMap === undefined ? {} : { upliftMap: [...upliftMap] }),
    ...(rainfall === undefined ? {} : { rainfall: [...rainfall] }),
    ...(strata === undefined ? {} : { strata: { ...strata, layers: strata.layers.map((layer) => ({ ...layer })) } }),
    ...(seaLevel === undefined ? {} : { seaLevel }),
    ...(grainSizes === undefined ? {} : { grainSizes: { ...grainSizes } }),
    ...(glacial === undefined ? {} : { glacial: { ...glacial } }),
    ...(coastal === undefined ? {} : { coastal: { ...coastal } }),
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

function settlingShares(sizes: GrainSizes): readonly number[] {
  const sand = settlingVelocity(sizes.sand);
  return [settlingVelocity(sizes.gravel) / sand, 1, settlingVelocity(sizes.silt) / sand];
}

/**
 * Start a landscape evolution run on a grid.
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
export function createLandscapeEvolution(options: LandscapeEvolutionOptions): LandscapeEvolution {
  const grid: LandformGrid = { ...options.grid, ...(options.grid.outlets === undefined ? {} : { outlets: [...options.grid.outlets] }) };
  const topology = landformTopology(grid);
  const { cells, base, cellArea, cols, rows, cellSize, neighbour } = topology;
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
  const flux = new Float64Array(cells * 3);
  const source = new Float64Array(cells * 3);
  const laid = new Float64Array(cells);
  const coverBefore = new Float64Array(cells);
  const cover = createSedimentCover(cells);
  const lake = new Int32Array(cells);
  const lakeStart = new Int32Array(cells + 1);
  const lakeCells = new Int32Array(cells);
  const pool = new Float64Array(cells);
  const settled = new Uint8Array(cells);
  const wet = new Uint8Array(cells);
  const kCell = new Float64Array(cells);
  const dCell = new Float64Array(cells);
  const critical = new Float64Array(cells);
  const router = createFlowRouter(topology);
  const diffuser = createHillslopeDiffuser(topology);
  const slider = createLandslider(topology);
  const iceFlow = createIceFlow(topology);
  const ice = new Float64Array(cells);
  const carried = new Float64Array(cells);
  const order = new Int32Array(cells);
  const waves = createWaveEroder(topology);
  const grains = new Float64Array(cells * 3);
  let settling: readonly number[] = settlingShares(params.grainSizes ?? DEFAULT_GRAIN_SIZES);
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

  function strip(i: number, loss: number): number {
    const taken = cover.remove(i, loss);
    sediment[i] = cover.total(i);
    return taken;
  }

  function weather(dt: number): void {
    if (params.soilProduction <= 0) return;
    for (let i = 0; i < cells; i += 1) {
      if (base[i] === 1 || wet[i] === 1) continue;
      const depth = sediment[i] ?? 0;
      const rate = params.soilProduction * (strata.layers[layer[i] ?? 0]?.weathering ?? 1);
      const made = weatheredDepth(depth, rate, params.soilDepthScale, dt) - depth;
      if (made <= 0) continue;
      cover.add(i, COVER.soil, made);
      sediment[i] = cover.total(i);
    }
  }

  // What each cell's erosion put into the river, as gravel, sand and silt: the cover it lost, then rock.
  function release(): void {
    source.fill(0);
    const layers = strata.layers;
    for (let i = 0; i < cells; i += 1) {
      const e = erosion[i] ?? 0;
      if (e <= 0) continue;
      const fromCover = cover.remove(i, e, source);
      sediment[i] = cover.total(i);
      const rock = e - fromCover;
      if (rock <= 0) continue;
      const mix = layers[layer[i] ?? 0]?.yields ?? DEFAULT_ROCK_YIELD;
      source[i * 3] = (source[i * 3] ?? 0) + rock * mix.gravel;
      source[i * 3 + 1] = (source[i * 3 + 1] ?? 0) + rock * mix.sand;
      source[i * 3 + 2] = (source[i * 3 + 2] ?? 0) + rock * mix.silt;
    }
  }

  // Each body of standing water (cells joined at one water level) gets a label, and its cells are
  // listed together, so the silt it catches can settle over its whole floor.
  function labelWater(): number {
    const { water } = router;
    lake.fill(-1);
    let count = 0;
    let written = 0;
    for (let seedCell = 0; seedCell < cells; seedCell += 1) {
      if (wet[seedCell] !== 1 || lake[seedCell] !== -1) continue;
      const level = water[seedCell] ?? 0;
      lakeStart[count] = written;
      lake[seedCell] = count;
      lakeCells[written] = seedCell;
      let read = written;
      written += 1;
      while (read < written) {
        const c = lakeCells[read] ?? 0;
        read += 1;
        for (let k = 0; k < 8; k += 1) {
          const n = neighbour[c * 8 + k] ?? -1;
          if (n < 0 || wet[n] !== 1 || lake[n] !== -1 || water[n] !== level) continue;
          lake[n] = count;
          lakeCells[written] = n;
          written += 1;
        }
      }
      count += 1;
    }
    lakeStart[count] = written;
    return count;
  }

  // Lay a body of water's suspended silt over its floor in proportion to depth; returns what did not fit.
  function settleSilt(label: number, report: LandformStepReport): number {
    const volume = pool[label] ?? 0;
    pool[label] = 0;
    if (volume <= 0) return 0;
    const { water } = router;
    const from = lakeStart[label] ?? 0;
    const to = lakeStart[label + 1] ?? 0;
    let room = 0;
    for (let j = from; j < to; j += 1) {
      const c = lakeCells[j] ?? 0;
      if (base[c] === 1) continue;
      const depth = (water[c] ?? 0) - (height[c] ?? 0);
      if (depth > 0) room += depth;
    }
    room *= cellArea;
    if (room <= 0) return volume;
    const laidTotal = volume < room ? volume : room;
    const share = laidTotal / room;
    for (let j = from; j < to; j += 1) {
      const c = lakeCells[j] ?? 0;
      if (base[c] === 1) continue;
      const depth = (water[c] ?? 0) - (height[c] ?? 0);
      if (depth <= 0) continue;
      const thickness = depth * share;
      cover.add(c, COVER.silt, thickness);
      height[c] = (height[c] ?? 0) + thickness;
      sediment[c] = cover.total(c);
    }
    report.deposited += laidTotal;
    return volume - laidTotal;
  }

  // Carry each grain size down the stack. On land each size settles a share G·v/v_sand·a/A of what
  // passes. Standing water keeps gravel and sand where the river enters, building a delta, and holds
  // silt in suspension until it settles over the whole floor, when the stack reaches the outlet.
  function settle(report: LandformStepReport): void {
    const { stack, receiver, area, water } = router;
    const bodies = labelWater();
    pool.fill(0, 0, bodies);
    settled.fill(0, 0, bodies);
    flux.fill(0);
    const g = params.deposition;
    for (let s = cells - 1; s >= 0; s -= 1) {
      const i = stack[s] ?? 0;
      const r = receiver[i] ?? i;
      let passing = 0;
      for (let c = 0; c < 3; c += 1) {
        const volume = (flux[i * 3 + c] ?? 0) + (source[i * 3 + c] ?? 0) * cellArea;
        flux[i * 3 + c] = volume;
        passing += volume;
      }
      const label = lake[i] ?? -1;
      if (passing > 0 && label >= 0) {
        pool[label] = (pool[label] ?? 0) + (flux[i * 3 + 2] ?? 0);
        passing -= flux[i * 3 + 2] ?? 0;
        flux[i * 3 + 2] = 0;
      }
      if (r === i) {
        report.exported += passing;
        continue;
      }
      let room = label >= 0 ? ((water[i] ?? 0) - (height[i] ?? 0)) * cellArea : 0;
      let laidHere = 0;
      for (let c = 0; c < 3; c += 1) {
        const volume = flux[i * 3 + c] ?? 0;
        let kept = 0;
        if (volume > 0) {
          if (label >= 0) {
            kept = room > 0 ? (volume < room ? volume : room) : 0;
            room -= kept;
          } else if (g > 0) {
            const share = (g * (settling[c] ?? 1) * cellArea) / (area[i] ?? cellArea);
            kept = volume * (share < 1 ? share : 1);
          }
        }
        if (kept > 0) {
          cover.add(i, c, kept / cellArea);
          laidHere += kept;
        }
        flux[r * 3 + c] = (flux[r * 3 + c] ?? 0) + volume - kept;
      }
      if (laidHere > 0) {
        height[i] = (height[i] ?? 0) + laidHere / cellArea;
        sediment[i] = cover.total(i);
        report.deposited += laidHere;
      }
      // The lake's outlet: every inflow is in, so its silt settles and the rest spills on.
      if (label >= 0 && lake[r] !== label) {
        flux[r * 3 + 2] = (flux[r * 3 + 2] ?? 0) + settleSilt(label, report);
        settled[label] = 1;
      }
    }
    // Bodies that drain off the map (the sea) settle last; what does not fit leaves.
    for (let label = 0; label < bodies; label += 1) if (settled[label] !== 1) report.exported += settleSilt(label, report);
  }

  // Remove `depth` metres from cell i, cover first, then rock, and leave what it was made of in `grains`.
  function wear(i: number, depth: number): void {
    grains[i * 3] = 0;
    grains[i * 3 + 1] = 0;
    grains[i * 3 + 2] = 0;
    const fromCover = cover.remove(i, depth, grains);
    sediment[i] = cover.total(i);
    const rock = depth - fromCover;
    if (rock <= 0) return;
    const mix = strata.layers[layer[i] ?? 0]?.yields ?? DEFAULT_ROCK_YIELD;
    grains[i * 3] = (grains[i * 3] ?? 0) + rock * mix.gravel;
    grains[i * 3 + 1] = (grains[i * 3 + 1] ?? 0) + rock * mix.sand;
    grains[i * 3 + 2] = (grains[i * 3 + 2] ?? 0) + rock * mix.silt;
  }

  // Glaciers flow and erode their beds by sliding, carry what they pluck down their own surface to
  // where the ice ends, and drop it there as till: terminal and lateral moraines.
  function glaciate(dt: number, report: LandformStepReport): void {
    const g = params.glacial;
    if (g === undefined) return;
    iceFlow.relax(
      height,
      ice,
      Math.min(g.iceYears ?? 1000, dt),
      g.iceSteps ?? 10,
      {
        deformation: iceDeformationRate(g.flowRate ?? GLEN_RATE_FACTOR),
        sliding: g.sliding ?? 5e-4,
        ela: g.ela,
        balanceGradient: g.balanceGradient ?? 0.005,
        maxAccumulation: g.maxAccumulation ?? 2,
        lateralDrag: g.lateralDrag ?? 3e6,
      },
    );
    const kg = g.erosion ?? 1e-4;
    const tillShare = g.tillShare ?? 0.25;
    const { sliding } = iceFlow;
    carried.fill(0);
    let count = 0;
    for (let i = 0; i < cells; i += 1) {
      if (base[i] === 1 || (ice[i] ?? 0) <= 0) continue;
      order[count] = i;
      count += 1;
      const depth = kg * (sliding[i] ?? 0) * dt;
      if (depth <= 0) continue;
      cover.remove(i, depth);
      sediment[i] = cover.total(i);
      height[i] = (height[i] ?? 0) - depth;
      carried[i] = depth * cellArea;
      report.eroded += depth * cellArea;
    }
    // Ice cells from the highest surface down, so each passes on everything carried from above.
    const surface = (i: number): number => (height[i] ?? 0) + (ice[i] ?? 0);
    const flowing = order.subarray(0, count);
    flowing.sort((a, b) => surface(b) - surface(a) || a - b);
    for (const i of flowing) {
      const load = carried[i] ?? 0;
      if (load <= 0) continue;
      let next = -1;
      let lowest = surface(i);
      for (let k = 0; k < 8; k += 1) {
        const n = neighbour[i * 8 + k] ?? -1;
        if (n < 0) continue;
        const s = surface(n);
        if (s < lowest) {
          lowest = s;
          next = n;
        }
      }
      if (next < 0) continue;
      carried[next] = (carried[next] ?? 0) + load;
      carried[i] = 0;
    }
    for (let i = 0; i < cells; i += 1) {
      const load = carried[i] ?? 0;
      if (load <= 0) continue;
      if (base[i] === 1) {
        report.exported += load;
        continue;
      }
      const kept = load * tillShare;
      const thickness = kept / cellArea;
      cover.add(i, COVER.till, thickness);
      height[i] = (height[i] ?? 0) + thickness;
      sediment[i] = cover.total(i);
      report.deposited += kept;
      report.exported += load - kept;
    }
  }

  // Waves cut cliffs back and wear platforms down; part of each cliff's sand stays as beach.
  function batter(dt: number, report: LandformStepReport): void {
    const c = params.coastal;
    const seaLevel = params.seaLevel;
    if (c === undefined || seaLevel === undefined) return;
    const notchDepth = c.notchDepth ?? 1;
    carried.fill(0);
    waves.erode(
      height,
      {
        seaLevel,
        cliffRetreat: c.cliffRetreat,
        attenuation: c.attenuation ?? 200,
        waveBase: c.waveBase ?? 10,
        platformErosion: c.platformErosion ?? 1e-4,
        platformDepthScale: c.platformDepthScale ?? 2,
        notchDepth,
      },
      dt,
      carried,
      c.maxSubsteps ?? 64,
    );
    const beachShare = c.beachShare ?? 0.5;
    const beachTop = seaLevel - 0.5 * notchDepth;
    for (let i = 0; i < cells; i += 1) {
      const depth = carried[i] ?? 0;
      if (depth <= 0) continue;
      wear(i, depth);
      report.eroded += depth * cellArea;
      const room = beachTop - (height[i] ?? 0);
      let beach = (grains[i * 3 + 1] ?? 0) * beachShare;
      if (beach > room) beach = room > 0 ? room : 0;
      if (beach > 0) {
        cover.add(i, COVER.beach, beach);
        height[i] = (height[i] ?? 0) + beach;
        sediment[i] = cover.total(i);
        report.deposited += beach * cellArea;
      }
      report.exported += (depth - beach) * cellArea;
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
    weather(dt);

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
    for (let i = 0; i < cells; i += 1) report.eroded += (erosion[i] ?? 0) * cellArea;
    release();
    settle(report);

    if (params.diffusivity > 0 || params.marineDiffusivity > 0) {
      erosion.set(height);
      diffuser.diffuse(height, dCell, dt);
      for (let i = 0; i < cells; i += 1) {
        const change = (height[i] ?? 0) - (erosion[i] ?? 0);
        if (change > 0) {
          // Creep lays colluvium, which reads as soil.
          cover.add(i, COVER.soil, change);
          sediment[i] = cover.total(i);
        } else if (change < 0) strip(i, -change);
      }
    }

    glaciate(dt, report);
    batter(dt, report);

    failed.fill(0);
    laid.fill(0);
    coverBefore.set(sediment);
    const slid = slider.collapse(height, sediment, critical, reposeSlope, laid, failed);
    report.landslid = slid.failed;
    report.exported += slid.exported;
    for (let i = 0; i < cells; i += 1) {
      const fresh = laid[i] ?? 0;
      if (fresh <= 0 && (failed[i] ?? 0) <= 0) continue;
      // Cover that slid away is what the cell lost beyond the debris it gained; the debris is scree.
      const lostCover = fresh - ((sediment[i] ?? 0) - (coverBefore[i] ?? 0));
      if (lostCover > 0) cover.remove(i, lostCover);
      cover.add(i, COVER.scree, fresh);
      sediment[i] = cover.total(i);
      debris[i] = (debris[i] ?? 0) + fresh;
    }
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
    if (snapshot.height.length !== cells || snapshot.sediment.length !== cells || snapshot.exhumation.length !== cells || snapshot.debris.length !== cells || snapshot.cover.length !== cells * COVER_CLASSES.length || snapshot.ice.length !== cells) throw new Error("landform snapshot arrays do not match the grid");
    retune(snapshot.params);
    height.set(snapshot.height);
    sediment.set(snapshot.sediment);
    exhumation.set(snapshot.exhumation);
    debris.set(snapshot.debris);
    cover.thickness.set(snapshot.cover);
    ice.set(snapshot.ice);
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
    settling = settlingShares(params.grainSizes ?? DEFAULT_GRAIN_SIZES);
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
    fields: () => ({ height, sediment, exhumation, layer, debris, cover: cover.thickness, ice, iceSliding: iceFlow.sliding, waveEnergy: waves.energy }),
    routing: () => router,
    snapshot: () => ({
      version: 2,
      grid: { ...grid },
      params: copyParams(params),
      seed,
      time,
      steps,
      height: Array.from(height),
      sediment: Array.from(sediment),
      exhumation: Array.from(exhumation),
      debris: Array.from(debris),
      cover: Array.from(cover.thickness),
      ice: Array.from(ice),
    }),
    restore: restoreFrom,
    reset() {
      height.set(start);
      sediment.fill(0);
      exhumation.fill(0);
      debris.fill(0);
      cover.thickness.fill(0);
      ice.fill(0);
      time = 0;
      steps = 0;
      classify();
      route();
    },
    hash: () => hashLandformArrays(height, sediment, cover.thickness, ice),
  };
}
