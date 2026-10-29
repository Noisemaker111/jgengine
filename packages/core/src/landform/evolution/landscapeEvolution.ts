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
import { plantPow } from "../../plants/growth/plantMath";
import { seededRng } from "../../random/rng";
import { createWaveEroder } from "../coastal/waveErosion";
import { createFlowRouter, type FlowRouting } from "../flow/flowRouting";
import { temperateBed } from "../glacial/basalTemperature";
import { snowlineAt, type SnowlineHistory } from "../glacial/glacialClimate";
import { createGlacierFlow, type GlacierModel } from "../glacial/glacierFlow";
import { GLEN_RATE_FACTOR, iceDeformationRate } from "../glacial/iceFlow";
import { landformTopology, type LandformGrid } from "../grid/landformGrid";
import { COVER, COVER_CLASSES, createSedimentCover, DEFAULT_GRAIN_SIZES, DEFAULT_ROCK_YIELD, settlingVelocity, weatheredDepth, type GrainSizes } from "../materials/sedimentCover";
import { createHillslopeDiffuser } from "./hillslopeDiffusion";
import { createLandslider } from "./landsliding";
import { resolveStrata, tanDegrees, UNIFORM_ROCK, type LandformStrata, type ResolvedStrata } from "./rockStrata";
import { incise } from "./streamPower";

/** Glaciers: ice that flows and slides, and erodes its bed by sliding (see `glacial/glacierFlow`). */
export interface GlacialParams {
  /**
   * Ice model. `"first-order"` solves the first-order Stokes equations (Blatter–Pattyn), so valley
   * walls drag on the ice and carve U-shaped troughs; `"shallow-ice"` is several times cheaper and
   * keeps V-shaped valleys closer to V. Default `"first-order"`.
   */
  model?: GlacierModel;
  /** First-order layers per ice column. Default 8. */
  layers?: number;

  /** Equilibrium line altitude in metres: ice grows above it and melts below. Needed unless `elaHistory` is given. */
  ela?: number;
  /** The ELA through time, [model year, metres] points (see `snowlineHistory` for glacial cycles from the LR04 record); each step uses its midpoint's ELA, and it overrides `ela`. */
  elaHistory?: SnowlineHistory;
  /** Mass balance gradient in (m/yr of ice) per metre of altitude. Default 0.005. */
  balanceGradient?: number;
  /** Largest accumulation in m/yr. Default 2. */
  maxAccumulation?: number;
  /** Glen's flow rate factor A in Pa⁻³ yr⁻¹. Default 7.57·10⁻¹⁷, temperate ice. */
  flowRate?: number;
  /** Sliding coefficient C of u_b = C·τ_b, in m yr⁻¹ Pa⁻¹. Default 5·10⁻⁴ (50 m/yr under 100 kPa). */
  sliding?: number;
  /** Mean annual air temperature at the ELA in °C; colder freezes more thin ice to its bed, where it neither slides nor erodes (see `glacial/basalTemperature`). Default −2. */
  snowlineTemperature?: number;
  /** Fall of air temperature with altitude in K/m. Default 0.0065. */
  lapseRate?: number;
  /** Geothermal heat flux in W/m² warming the bed. Default 0.06. */
  geothermalFlux?: number;
  /** Shallow-ice only: effective ice viscosity in Pa·yr through which neighbouring columns and valley walls drag on sliding ice. Default 10⁶ (about 3·10¹³ Pa·s). */
  lateralDrag?: number;
  /** Share of the rock a glacier plucks that it drops as till where the ice ends; meltwater carries the rest away. Default 0.25. */
  tillShare?: number;
  /**
   * Depth in metres of the till that deforms under sliding ice and moves with it at half the sliding
   * speed, to be laid where the ice ends. Default 0.5 (Boulton & Hindmarsh 1987).
   */
  deformingTill?: number;

  /**
   * Erosion constant K_g of ė = K_g·u_bˡ, normal to the bed, in m^(1−l) yr^(l−1). Default 10⁻⁴·50^(1−l),
   * so 50 m/yr of sliding wears 5 mm/yr whatever l (10⁻⁴ for l = 1, Humphrey & Raymond 1994); field
   * rates of temperate valley glaciers run 0.1–10 mm/yr (Hallet, Hunter & Bogen 1996).
   */
  erosion?: number;
  /** Exponent l of sliding speed in the erosion law. Default 1; abrasion theory (Hallet 1979) and Harbor (1992) use 2. */
  erosionExponent?: number;
  /** Longest implicit ice step in years, and the shortest turn of ice flow and bed wear: ice and bed take turns, each wearing at most a tenth of a cell. Default 50. */
  iceStep?: number;
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
  version: 5;
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
  /** Per cell, first-order over shallow-ice flux through its east face from the last step (1 where there is no ice). */
  iceEastScale: readonly number[];
  /** The same through each cell's south face. */
  iceSouthScale: readonly number[];
  /** Glacier sliding speed per cell in m/yr from the last step, which sizes the next step's first turn. */
  iceSliding: readonly number[];
  /** Length in years of the last full turn of ice flow and erosion. */
  iceTurn: number;
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

// Most of a cell a glacier wears its bed in one turn of ice flow and erosion.
const COUPLED_WEAR = 0.1;
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
    ...(glacial === undefined ? {} : { glacial: { ...glacial, ...(glacial.elaHistory === undefined ? {} : { elaHistory: glacial.elaHistory.map(([year, ela]) => [year, ela] as const) }) } }),
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
  const shielded = new Uint8Array(cells);
  const router = createFlowRouter(topology);
  const diffuser = createHillslopeDiffuser(topology);
  const slider = createLandslider(topology);
  const glacier = createGlacierFlow(topology);
  const ice = new Float64Array(cells);
  const iceTemperate = new Float64Array(cells);
  const iceEastScale = new Float64Array(cells).fill(1);
  const iceSouthScale = new Float64Array(cells).fill(1);
  let iceTurn = 50;
  const iceHeld = new Uint8Array(cells);
  const carried = new Float64Array(cells);
  const bedArea = new Float64Array(cells);
  const wearRate = new Float64Array(cells);
  const iceSurface = new Float64Array(cells);
  const iceRouter = createFlowRouter(topology);
  const iceDischarge = new Float64Array(cells);
  const onSurface = new Float64Array(cells);
  const dragged = new Float64Array(cells);
  // The mass balance of the last glacial step, which says where carried debris melts out.
  const balance = { ela: Number.POSITIVE_INFINITY, gradient: 0.005, max: 2 };
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
    // A basin full of glacier ice holds no lake.
    for (let i = 0; i < cells; i += 1) wet[i] = (water[i] ?? 0) > (height[i] ?? 0) && !((ice[i] ?? 0) > 0) ? 1 : 0;
  }

  function materialProperties(): void {
    const layers = strata.layers;
    for (let i = 0; i < cells; i += 1) {
      const rock = layers[layer[i] ?? 0];
      const loose = (sediment[i] ?? 0) >= LOOSE_DEPTH;
      kCell[i] = params.erodibility * (rock?.erodibility ?? 1);
      // Glacier ice shields its bed from rivers and creep; only the ice wears it. Its walls still fail.
      const iced = (ice[i] ?? 0) > 0;
      shielded[i] = iced ? 1 : 0;
      dCell[i] = iced ? 0 : wet[i] === 1 ? params.marineDiffusivity : params.diffusivity * (loose ? 1 : (rock?.diffusivity ?? 1));
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
          } else if (g > 0 && shielded[i] !== 1) {
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
  // Ice and bed move in turns: the ice flows over a fixed bed for a while, then the bed wears under
  // fixed ice. A turn that wears much of a cell lets erosion run ahead of the ice it depends on, and
  // u_b² wear then digs slots that feed ever faster sliding (#2790). So a turn wears at most
  // COUPLED_WEAR of a cell at the last sliding speed, grows to at most twice the last turn, and is
  // never shorter than the ice's own longest step: at most one turn per `iceStep` years.
  function glaciate(dt: number, report: LandformStepReport): void {
    const g = params.glacial;
    if (g === undefined) return;
    const power = g.erosionExponent ?? 1;
    const kg = g.erosion ?? 1e-4 * plantPow(50, 1 - power);
    const shortest = g.iceStep ?? 50;
    const limit = COUPLED_WEAR * cellSize;
    let elapsed = 0;
    while (elapsed < dt) {
      let fastest = 0;
      const { sliding } = glacier;
      for (let i = 0; i < cells; i += 1) {
        if (base[i] === 1 || (ice[i] ?? 0) <= 0) continue;
        const rate = kg * plantPow(sliding[i] ?? 0, power);
        if (rate > fastest) fastest = rate;
      }
      let span = 2 * iceTurn;
      if (fastest > 0 && limit / fastest < span) span = limit / fastest;
      if (span < shortest) span = shortest;
      if (span > dt - elapsed) span = dt - elapsed;
      else iceTurn = span;
      const wore = glacialTurn(g, span, time + elapsed, kg, power, report);
      elapsed += span;
      // Walls fail as the ice undercuts them; the step's own collapse follows the last turn.
      if (wore && elapsed < dt) collapseSlopes(report);
    }
  }

  // One turn of ice flow and then bed wear; true if the ice wore its bed.
  function glacialTurn(g: GlacialParams, dt: number, start: number, kg: number, power: number, report: LandformStepReport): boolean {
    const rateFactor = g.flowRate ?? GLEN_RATE_FACTOR;
    const ela = g.elaHistory !== undefined ? snowlineAt(g.elaHistory, start + 0.5 * dt) : g.ela;
    if (ela === undefined) throw new Error("landform glacial params need an ela or an elaHistory");
    balance.ela = ela;
    balance.gradient = g.balanceGradient ?? 0.005;
    balance.max = g.maxAccumulation ?? 2;
    temperateBed(iceTemperate, height, ice, { ela, snowlineTemperature: g.snowlineTemperature ?? -2, lapseRate: g.lapseRate ?? 0.0065, geothermalFlux: g.geothermalFlux ?? 0.06 });
    glacier.flow(height, ice, iceEastScale, iceSouthScale, dt, {
      model: g.model ?? "first-order",
      rateFactor,
      layers: g.layers ?? 8,
      deformation: iceDeformationRate(rateFactor),
      sliding: g.sliding ?? 5e-4,
      ela,
      maxStep: g.iceStep ?? 50,
      balanceGradient: g.balanceGradient ?? 0.005,
      maxAccumulation: g.maxAccumulation ?? 2,
      lateralDrag: g.lateralDrag ?? 1e6,
      temperate: iceTemperate,
    });
    const tillShare = g.tillShare ?? 0.25;
    const { sliding } = glacier;
    // Ice wears its bed along the bed's normal at K_g·u_bˡ, which lowers a sloping bed by √(1 + |∇b|²)
    // times as much; the slope is the upwind (Godunov) one, so a trough's floor keeps its point and a
    // ridge wears from both sides. That update is stable while a step wears less than half a cell
    // (the eikonal CFL condition), so a step that would wear more is split, at most 256 ways.
    // Out of an overdeepening, meltwater climbing a bed that rises more than 1.2 times as steeply as
    // the ice surface falls supercools and freezes, and by 1.7 times the bed stops wearing (Alley et
    // al. 2003), which bounds how deep a glacier digs below its outlet.
    for (let i = 0; i < cells; i += 1) iceSurface[i] = (height[i] ?? 0) + (ice[i] ?? 0);
    let fastest = 0;
    for (let i = 0; i < cells; i += 1) {
      const rate = base[i] === 1 || (ice[i] ?? 0) <= 0 ? 0 : kg * plantPow(sliding[i] ?? 0, power);
      wearRate[i] = rate;
      if (rate > fastest) fastest = rate;
    }
    const parts = Math.min(256, Math.max(1, Math.ceil((fastest * dt) / (0.5 * cellSize))));
    const part = dt / parts;
    carried.fill(0);
    for (let k = 0; k < parts; k += 1) {
      for (let i = 0; i < cells; i += 1) {
        if ((wearRate[i] ?? 0) <= 0) continue;
        const h = height[i] ?? 0;
        let slope2 = 0;
        for (const [ahead, behind] of [[0, 4], [2, 6]] as const) {
          const a = neighbour[i * 8 + ahead] ?? -1;
          const b = neighbour[i * 8 + behind] ?? -1;
          const rise = a < 0 ? 0 : ((height[a] ?? 0) - h) / cellSize;
          const fall = b < 0 ? 0 : (h - (height[b] ?? 0)) / cellSize;
          const up = fall > 0 ? fall : 0;
          const down = rise < 0 ? -rise : 0;
          const steepest = up > down ? up : down;
          slope2 += steepest * steepest;
        }
        bedArea[i] = Math.sqrt(1 + slope2);
      }
      for (let i = 0; i < cells; i += 1) {
        const rate = (wearRate[i] ?? 0) > 0 ? (wearRate[i] ?? 0) * supercooling(i) : 0;
        if (rate <= 0) continue;
        const depth = rate * part * (bedArea[i] ?? 1);
        cover.remove(i, depth);
        sediment[i] = cover.total(i);
        height[i] = (height[i] ?? 0) - depth;
        carried[i] = (carried[i] ?? 0) + depth * cellArea;
        report.eroded += depth * cellArea;
      }
    }
    // Till under sliding ice deforms and travels with it, a layer `deformingTill` deep at half the
    // sliding speed, so a glacier clears loose cover from its bed and pushes it to its margin.
    const deforming = g.deformingTill ?? 0.5;
    dragged.fill(0);
    for (let i = 0; i < cells; i += 1) {
      const loose = sediment[i] ?? 0;
      if (base[i] === 1 || (ice[i] ?? 0) <= 0 || loose <= 0) continue;
      const layer = loose < deforming ? loose : deforming;
      const reach = (0.5 * (sliding[i] ?? 0) * layer * dt) / cellSize;
      const depth = reach < loose ? reach : loose;
      if (depth <= 0) continue;
      cover.remove(i, depth);
      sediment[i] = cover.total(i);
      height[i] = (height[i] ?? 0) - depth;
      dragged[i] = depth * cellArea;
      report.eroded += depth * cellArea;
    }
    rideIce(tillShare, report, dragged);
    return fastest > 0;
  }

  // Slopes steeper than they can stand fail; debris that lands on a glacier rides it and is laid as till.
  function collapseSlopes(report: LandformStepReport): void {
    failed.fill(0);
    laid.fill(0);
    coverBefore.set(sediment);
    for (let i = 0; i < cells; i += 1) iceHeld[i] = (ice[i] ?? 0) > 0 ? 1 : 0;
    const slid = slider.collapse(height, sediment, critical, reposeSlope, laid, failed, iceHeld);
    report.landslid += slid.failed;
    report.exported += slid.exported;
    carried.fill(0);
    let onIce = false;
    for (let i = 0; i < cells; i += 1) {
      const fresh = laid[i] ?? 0;
      if (fresh <= 0 && (failed[i] ?? 0) <= 0) continue;
      if ((ice[i] ?? 0) > 0) {
        // Debris that ends up on a glacier rides it to the snout and is laid there as moraine: the
        // cover's net gain here, since debris can land and slide on within one collapse.
        const gained = (sediment[i] ?? 0) - (coverBefore[i] ?? 0);
        if (gained < 0) cover.remove(i, -gained);
        else if (gained > 0) {
          height[i] = (height[i] ?? 0) - gained;
          carried[i] = gained * cellArea;
          onIce = true;
        }
        sediment[i] = cover.total(i);
        continue;
      }
      // Cover that slid away is what the cell lost beyond the debris it gained; the debris is scree.
      const lostCover = fresh - ((sediment[i] ?? 0) - (coverBefore[i] ?? 0));
      if (lostCover > 0) cover.remove(i, lostCover);
      cover.add(i, COVER.scree, fresh);
      debris[i] = (debris[i] ?? 0) + fresh;
      sediment[i] = cover.total(i);
    }
    if (onIce) rideIce(1, report);
  }

  // Share of the bed's wear left by supercooling: 1 while the bed out of an overdeepening rises less
  // than 1.2 times as steeply as the ice surface falls, 0 from 1.7 times.
  function supercooling(i: number): number {
    let bedDotSurface = 0;
    let surfaceSlope2 = 0;
    for (const [ahead, behind] of [[0, 4], [2, 6]] as const) {
      const a = neighbour[i * 8 + ahead] ?? -1;
      const b = neighbour[i * 8 + behind] ?? -1;
      const from = b < 0 ? i : b;
      const to = a < 0 ? i : a;
      const span = (to === i ? 0 : 1) + (from === i ? 0 : 1);
      if (span === 0) continue;
      const bed = ((height[to] ?? 0) - (height[from] ?? 0)) / span;
      const top = ((iceSurface[to] ?? 0) - (iceSurface[from] ?? 0)) / span;
      bedDotSurface += bed * top;
      surfaceSlope2 += top * top;
    }
    if (bedDotSurface >= 0) return 1;
    const ratio = -bedDotSurface / (surfaceSlope2 > 1e-12 ? surfaceSlope2 : 1e-12);
    return ratio <= 1.2 ? 1 : ratio >= 1.7 ? 0 : (1.7 - ratio) / 0.5;
  }

  // Debris in `carried` rides the ice down its surface, pits filled (Priority-Flood), and melts out
  // where the ice melts: each cell releases the share of the arriving ice that ablates there. `share`
  // of what melts out stays; meltwater carries the rest away. What stays emerges on the ice surface as
  // the ice above it ablates and rides on to where the ice ends, and is laid as till on the ground in
  // front of it: end and lateral moraines, not a blanket under the glacier that would shield its bed. Till in `atBed` goes
  // there whole. Debris that reaches the map's edge leaves it.
  function rideIce(share: number, report: LandformStepReport, atBed?: Float64Array): void {
    for (let i = 0; i < cells; i += 1) iceSurface[i] = (height[i] ?? 0) + (ice[i] ?? 0);
    iceRouter.route(iceSurface, Number.NEGATIVE_INFINITY);
    const { stack, receiver } = iceRouter;
    iceDischarge.fill(0);
    if (atBed === undefined) onSurface.fill(0);
    else onSurface.set(atBed);
    for (let k = cells - 1; k >= 0; k -= 1) {
      const i = stack[k] ?? 0;
      const load = carried[i] ?? 0;
      const next = receiver[i] ?? i;
      let released = load;
      let melting = 0;
      if ((ice[i] ?? 0) > 0 && base[i] !== 1 && next !== i) {
        const rule = balance.gradient * ((iceSurface[i] ?? 0) - balance.ela);
        const b = (rule < balance.max ? rule : balance.max) * cellArea;
        const arriving = (iceDischarge[i] ?? 0) + (b > 0 ? b : 0);
        const melt = b < 0 ? -b : 0;
        melting = arriving > melt ? melt / arriving : 1;
        released = load * melting;
        iceDischarge[next] = (iceDischarge[next] ?? 0) + (arriving > melt ? arriving - melt : 0);
        carried[next] = (carried[next] ?? 0) + load - released;
      }
      carried[i] = 0;
      const kept = released * share;
      report.exported += released - kept;
      const riding = (onSurface[i] ?? 0) + kept;
      onSurface[i] = 0;
      if (riding <= 0) continue;
      if (base[i] === 1) report.exported += riding;
      else if ((ice[i] ?? 0) > 0 && next !== i && (ice[next] ?? 0) > 0) {
        // At the glacier's side, the ice thinning under the debris strands its share at the edge: a
        // lateral moraine.
        const stranded = melting > 0 && besideBare(i) ? riding * melting : 0;
        if (stranded > 0) layTill(i, stranded, report);
        onSurface[next] = (onSurface[next] ?? 0) + riding - stranded;
      } else layTill((ice[i] ?? 0) > 0 && next !== i ? next : i, riding, report);
    }
  }

  // Till melts out in place of the debris-laden ice that held it, so it takes that ice's room.
  function layTillAt(i: number, thickness: number, report: LandformStepReport): void {
    const h = ice[i] ?? 0;
    if (h > 0) ice[i] = h > thickness ? h - thickness : 0;
    cover.add(i, COVER.till, thickness);
    height[i] = (height[i] ?? 0) + thickness;
    sediment[i] = cover.total(i);
    report.deposited += thickness * cellArea;
  }

  // Till piles no higher than the ice it melts out of or falls from, a moraine's crest standing at the
  // ice margin, and no steeper than its angle of repose above the bare ground around it. The rest runs
  // down the ground, filling each cell no higher than the one above it, while it stays against the
  // ice; what runs clear of the ice, meltwater carries away as outwash.
  function layTill(from: number, volume: number, report: LandformStepReport): void {
    let top = (ice[from] ?? 0) > 0 ? (iceSurface[from] ?? 0) : Number.NEGATIVE_INFINITY;
    for (let k = 0; k < 8 && (ice[from] ?? 0) <= 0; k += 1) {
      const n = neighbour[from * 8 + k] ?? -1;
      if (n >= 0 && (ice[n] ?? 0) > 0 && (iceSurface[n] ?? 0) > top) top = iceSurface[n] ?? 0;
    }
    let i = from;
    let left = volume;
    for (let hop = 0; hop < cells && left > 0; hop += 1) {
      if (base[i] === 1 || !nearIce(i)) {
        report.exported += left;
        return;
      }
      const here = height[i] ?? 0;
      let crest = top;
      for (let k = 0; k < 8; k += 1) {
        const n = neighbour[i * 8 + k] ?? -1;
        if (n < 0 || (ice[n] ?? 0) > 0) continue;
        const toe = (height[n] ?? 0) + reposeSlope * (topology.distance[k] ?? cellSize);
        if (toe < crest) crest = toe;
      }
      const room = crest - here;
      if (room > 0) {
        const depth = left / cellArea < room ? left / cellArea : room;
        layTillAt(i, depth, report);
        left -= depth * cellArea;
        if (left <= 0) return;
      }
      let next = -1;
      let lowest = height[i] ?? 0;
      for (let k = 0; k < 8; k += 1) {
        const n = neighbour[i * 8 + k] ?? -1;
        if (n >= 0 && (height[n] ?? 0) < lowest) {
          lowest = height[n] ?? 0;
          next = n;
        }
      }
      if (next < 0) break;
      top = height[i] ?? 0;
      i = next;
    }
    if (left > 0) layTillAt(i, left / cellArea, report);
  }

  function besideBare(i: number): boolean {
    for (let k = 0; k < 8; k += 1) {
      const n = neighbour[i * 8 + k] ?? -1;
      if (n >= 0 && base[n] !== 1 && (ice[n] ?? 0) <= 0) return true;
    }
    return false;
  }

  function nearIce(i: number): boolean {
    if ((ice[i] ?? 0) > 0) return true;
    for (let k = 0; k < 8; k += 1) {
      const n = neighbour[i * 8 + k] ?? -1;
      if (n >= 0 && (ice[n] ?? 0) > 0) return true;
    }
    return false;
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
      shielded,
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

    collapseSlopes(report);
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
    if (snapshot.height.length !== cells || snapshot.sediment.length !== cells || snapshot.exhumation.length !== cells || snapshot.debris.length !== cells || snapshot.cover.length !== cells * COVER_CLASSES.length || snapshot.ice.length !== cells || snapshot.iceEastScale.length !== cells || snapshot.iceSouthScale.length !== cells || snapshot.iceSliding.length !== cells) throw new Error("landform snapshot arrays do not match the grid");
    retune(snapshot.params);
    height.set(snapshot.height);
    sediment.set(snapshot.sediment);
    exhumation.set(snapshot.exhumation);
    debris.set(snapshot.debris);
    cover.thickness.set(snapshot.cover);
    ice.set(snapshot.ice);
    iceEastScale.set(snapshot.iceEastScale);
    iceSouthScale.set(snapshot.iceSouthScale);
    glacier.sliding.set(snapshot.iceSliding);
    iceTurn = snapshot.iceTurn;
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
    fields: () => ({ height, sediment, exhumation, layer, debris, cover: cover.thickness, ice, iceSliding: glacier.sliding, waveEnergy: waves.energy }),
    routing: () => router,
    snapshot: () => ({
      version: 5,
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
      iceEastScale: Array.from(iceEastScale),
      iceSouthScale: Array.from(iceSouthScale),
      iceSliding: Array.from(glacier.sliding),
      iceTurn,
    }),
    restore: restoreFrom,
    reset() {
      height.set(start);
      sediment.fill(0);
      exhumation.fill(0);
      debris.fill(0);
      cover.thickness.fill(0);
      ice.fill(0);
      iceEastScale.fill(1);
      iceSouthScale.fill(1);
      glacier.sliding.fill(0);
      iceTurn = 50;
      time = 0;
      steps = 0;
      classify();
      route();
    },
    hash: () => hashLandformArrays(height, sediment, cover.thickness, ice),
  };
}
