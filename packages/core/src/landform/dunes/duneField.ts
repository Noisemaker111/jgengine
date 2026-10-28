// @skill jgengine-world
/**
 * Aeolian dunes by Werner's (1995) slab model: sand is a stack of slabs per cell; the wind picks a
 * cell at random, lifts its top slab unless it lies in the lee shadow of an upwind crest, and hops it
 * downwind until it lands (more often on sand than on bare bed, always in a shadow). Slabs that pile
 * past the angle of repose avalanche down the steepest neighbour, building slip faces. From these
 * rules alone, sparse sand under one wind grows barchans, abundant sand transverse ridges, two winds
 * more than 90° apart linear dunes along the resultant (Rubin & Hunter 1987), and winds from every
 * side star dunes.
 *
 * The field wraps at its edges, so sand that leaves one side enters the opposite one and the total
 * never changes. One sweep is one event per cell; work per sweep is bounded by the hop and shadow
 * reach. State round-trips through {@link DuneField.snapshot}; randomness comes only from the seed;
 * the model uses integers and table lookups, so a seed gives the same field in bun and a browser.
 *
 * @capability landform-dunes grow barchan, transverse, linear and star dunes from a wind regime and sand supply
 */

import { seededRng } from "../../random/rng";
import { plantAtan, plantCos, plantSin, PLANT_PI } from "../../plants/growth/plantMath";
import { LANDFORM_MAX_SIDE } from "../grid/landformGrid";

/** One wind of a regime: the bearing sand moves toward (degrees clockwise from north) and its share of the time. */
export interface WindMode {
  readonly toward: number;
  readonly share: number;
}

/** Dune rules. All of them retune between sweeps. */
export interface DuneParams {
  /** The winds, taken in turn within each wind period by their shares. Default one wind toward the east. */
  wind: readonly WindMode[];
  /** Sweeps per full cycle of the wind regime. Default 4. */
  windPeriod: number;
  /** Cells a slab moves per hop over bare bed. Default 1. */
  hop: number;
  /** Chance a slab lands where there is sand. Default 0.6 (Werner 1995). */
  depositOnSand: number;
  /** Chance a slab lands on bare bed. Default 0.4 (Werner 1995). */
  depositOnBed: number;
  /** Angle in degrees of the lee shadow behind a crest, where wind lifts no sand and every slab lands. Default 15. */
  shadowAngle: number;
}

/** Werner's (1995) rules: one wind toward the east, hop 1, landing 0.6 on sand and 0.4 on bed, 15° shadow. */
export const DEFAULT_DUNE_PARAMS: DuneParams = {
  wind: [{ toward: 90, share: 1 }],
  windPeriod: 4,
  hop: 1,
  depositOnSand: 0.6,
  depositOnBed: 0.4,
  shadowAngle: 15,
};

/** A dune field grid: `cols` × `rows` cells, `cellSize` metres a side, row 0 at the north edge, wrapping at every edge. */
export interface DuneGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  /** Angle of repose of dry sand in degrees, which sets the slab thickness. Default 34. */
  readonly reposeAngle?: number;
}

/** Starting sand: a mean thickness spread at random, or slab counts per cell. */
export interface DuneInitial {
  /** Mean sand thickness in metres, dropped slab by slab on random cells. */
  readonly sand?: number;
  /** Slab count per cell, row-major; overrides `sand`. */
  readonly slabs?: ArrayLike<number>;
}

/** Everything that defines a dune field at one moment, as plain JSON. */
export interface DuneSnapshot {
  version: 1;
  grid: DuneGrid;
  params: DuneParams;
  seed: string;
  /** Events run so far. */
  events: number;
  random: number;
  slabs: number[];
}

/** A running dune field. */
export interface DuneField {
  readonly grid: DuneGrid;
  readonly seed: string;
  /** Sand thickness of one slab in metres: two slabs over one cell stand at the angle of repose. */
  readonly slabThickness: number;
  params(): DuneParams;
  retune(patch: Partial<DuneParams>): void;
  /** Run whole sweeps (one event per cell each). */
  step(sweeps?: number): void;
  /** Sweeps run so far, fractional while a step is inside a sweep. */
  sweeps(): number;
  /** Slab count per cell, row-major. Live; do not write. */
  slabs(): Int32Array;
  /** Sand thickness per cell in metres. */
  thickness(out?: Float64Array): Float64Array;
  snapshot(): DuneSnapshot;
  restore(snapshot: DuneSnapshot): void;
  reset(): void;
  /** Hex hash of the slab field. */
  hash(): string;
}

/** Options for {@link createDuneField}. */
export interface DuneFieldOptions {
  grid: DuneGrid;
  params?: Partial<DuneParams>;
  seed: string;
  initial?: DuneInitial;
}

// Two slabs over one cell stand exactly at the angle of repose.
const REPOSE_SLABS = 2;

function degrees(angle: number): number {
  return (angle * PLANT_PI) / 180;
}

function copyParams(params: DuneParams): DuneParams {
  return { ...params, wind: params.wind.map((w) => ({ toward: w.toward, share: w.share })) };
}

function checkParams(params: DuneParams): void {
  if (params.wind.length === 0) throw new Error("dune wind needs at least one mode");
  let total = 0;
  for (const w of params.wind) {
    if (!(w.share >= 0) || !Number.isFinite(w.toward)) throw new Error(`dune wind mode must have a finite bearing and a share ≥ 0, got ${w.toward}/${w.share}`);
    total += w.share;
  }
  if (!(total > 0)) throw new Error("dune wind shares must sum above 0");
  if (!Number.isInteger(params.hop) || params.hop < 1) throw new Error(`dune hop must be a whole number of cells ≥ 1, got ${params.hop}`);
  if (!(params.windPeriod > 0)) throw new Error(`dune windPeriod must be positive, got ${params.windPeriod}`);
  for (const p of [params.depositOnSand, params.depositOnBed]) if (!(p > 0 && p <= 1)) throw new Error(`dune deposit chances must be in (0, 1], got ${p}`);
  if (!(params.shadowAngle > 0 && params.shadowAngle < 90)) throw new Error(`dune shadowAngle must be in (0, 90), got ${params.shadowAngle}`);
}

// Cell offsets along a bearing: entry d is the cell d cells away from a cell centre, as a column and row step.
function bearingSteps(toward: number, reach: number): Int32Array {
  const dcol = plantSin(degrees(toward));
  const drow = -plantCos(degrees(toward));
  const steps = new Int32Array((reach + 1) * 2);
  for (let d = 0; d <= reach; d += 1) {
    steps[d * 2] = Math.floor(0.5 + d * dcol);
    steps[d * 2 + 1] = Math.floor(0.5 + d * drow);
  }
  return steps;
}

/**
 * Start a dune field.
 * @capability landform-dunes grow barchan, transverse, linear and star dunes from a wind regime and sand supply
 */
export function createDuneField(options: DuneFieldOptions): DuneField {
  const { cols, rows, cellSize } = options.grid;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 3 || rows < 3) throw new Error(`dune grid must be at least 3×3 whole cells, got ${cols}×${rows}`);
  if (cols > LANDFORM_MAX_SIDE || rows > LANDFORM_MAX_SIDE) throw new Error(`dune grid side is at most ${LANDFORM_MAX_SIDE}, got ${cols}×${rows}`);
  if (!(cellSize > 0)) throw new Error(`dune cellSize must be positive, got ${cellSize}`);
  const reposeAngle = options.grid.reposeAngle ?? 34;
  if (!(reposeAngle > 0 && reposeAngle < 90)) throw new Error(`dune reposeAngle must be in (0, 90), got ${reposeAngle}`);
  const grid: DuneGrid = { cols, rows, cellSize, reposeAngle };
  const seed = options.seed;
  const cells = cols * rows;
  const reposeTan = plantSin(degrees(reposeAngle)) / plantCos(degrees(reposeAngle));
  const slabThickness = (cellSize * reposeTan) / REPOSE_SLABS;
  const reach = cols + rows;

  const neighbour = new Int32Array(cells * 8);
  const DCOL = [1, 1, 0, -1, -1, -1, 0, 1];
  const DROW = [0, 1, 1, 1, 0, -1, -1, -1];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      for (let k = 0; k < 8; k += 1) neighbour[(row * cols + col) * 8 + k] = ((row + (DROW[k] ?? 0) + rows) % rows) * cols + ((col + (DCOL[k] ?? 0) + cols) % cols);
    }
  }
  // A slab drop of more than two over a cell side (2√2 on a diagonal) is past repose.
  const limit = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2].map((v) => v * REPOSE_SLABS);

  let params = copyParams({ ...DEFAULT_DUNE_PARAMS, ...options.params });
  checkParams(params);
  const random = seededRng(`${seed}/dunes`);
  const slabs = new Int32Array(cells);
  const start = new Int32Array(cells);
  let events = 0;

  let downwind: Int32Array[] = [];
  let upwind: Int32Array[] = [];
  let cumulative: number[] = [];
  let shadowRise = 0;
  function prepare(): void {
    downwind = params.wind.map((w) => bearingSteps(w.toward, reach));
    upwind = params.wind.map((w) => bearingSteps(w.toward + 180, reach));
    const total = params.wind.reduce((sum, w) => sum + w.share, 0);
    let run = 0;
    cumulative = params.wind.map((w) => {
      run += w.share / total;
      return run;
    });
    // Rise in slabs per cell of the shadow line.
    shadowRise = (REPOSE_SLABS * plantSin(degrees(params.shadowAngle))) / plantCos(degrees(params.shadowAngle)) / reposeTan;
  }
  prepare();

  {
    const initial = options.initial ?? {};
    if (initial.slabs !== undefined) {
      if (initial.slabs.length !== cells) throw new Error(`dune initial slabs need ${cells} cells, got ${initial.slabs.length}`);
      for (let i = 0; i < cells; i += 1) {
        const n = initial.slabs[i] ?? 0;
        if (!Number.isInteger(n) || n < 0) throw new Error(`dune initial slabs must be whole and ≥ 0, got ${n} at ${i}`);
        start[i] = n;
      }
    } else if (initial.sand !== undefined && initial.sand > 0) {
      const place = seededRng(`${seed}/dunes-initial`);
      const count = Math.round((initial.sand / slabThickness) * cells);
      for (let k = 0; k < count; k += 1) {
        const i = Math.floor(place() * cells);
        start[i] = (start[i] ?? 0) + 1;
      }
    }
    slabs.set(start);
  }

  function offset(cell: number, steps: Int32Array, d: number): number {
    const col = cell % cols;
    const row = (cell - col) / cols;
    const c = (((col + (steps[d * 2] ?? 0)) % cols) + cols) % cols;
    const r = (((row + (steps[d * 2 + 1] ?? 0)) % rows) + rows) % rows;
    return r * cols + c;
  }

  let tallest = 0;
  function inShadow(cell: number, steps: Int32Array): boolean {
    const h = slabs[cell] ?? 0;
    const far = Math.min(reach, Math.ceil((tallest - h) / shadowRise));
    for (let d = 1; d <= far; d += 1) {
      if ((slabs[offset(cell, steps, d)] ?? 0) - h >= shadowRise * d) return true;
    }
    return false;
  }

  const pending: number[] = [];
  // Let slabs avalanche until no drop between neighbours is past repose. Each move lowers a slab by
  // more than two, so the field's potential energy falls and the loop ends.
  function avalanche(from: number): void {
    pending.push(from);
    while (pending.length > 0) {
      const c = pending.pop() ?? 0;
      const h = slabs[c] ?? 0;
      let down = -1;
      let downExcess = 0;
      let up = -1;
      let upExcess = 0;
      const first = Math.floor(random() * 8);
      for (let j = 0; j < 8; j += 1) {
        const k = (first + j) & 7;
        const n = neighbour[c * 8 + k] ?? c;
        const drop = (h - (slabs[n] ?? 0)) / (limit[k] ?? 2);
        if (drop > 1 && drop > downExcess) {
          downExcess = drop;
          down = n;
        }
        if (-drop > 1 && -drop > upExcess) {
          upExcess = -drop;
          up = n;
        }
      }
      if (down >= 0) {
        slabs[c] = h - 1;
        slabs[down] = (slabs[down] ?? 0) + 1;
        pending.push(c, down);
      } else if (up >= 0) {
        slabs[up] = (slabs[up] ?? 0) - 1;
        slabs[c] = h + 1;
        pending.push(c, up);
      }
    }
  }

  function modeAt(event: number): number {
    const cycle = params.windPeriod * cells;
    const phase = (event % cycle) / cycle;
    for (let k = 0; k < cumulative.length; k += 1) if (phase < (cumulative[k] ?? 1)) return k;
    return cumulative.length - 1;
  }

  function event(): void {
    const mode = modeAt(events);
    events += 1;
    const cell = Math.floor(random() * cells);
    if ((slabs[cell] ?? 0) <= 0) return;
    const down = downwind[mode];
    const up = upwind[mode];
    if (down === undefined || up === undefined || inShadow(cell, up)) return;
    slabs[cell] = (slabs[cell] ?? 0) - 1;
    avalanche(cell);
    const hop = params.hop;
    let land = cell;
    // The shadow line over the path: it falls by the shadow slope each cell and rises to any higher
    // ground passed. A grain that crosses below it is in a crest's lee and falls out there, building
    // the slip face; otherwise it lands at the end of each hop by chance.
    let line = slabs[cell] ?? 0;
    for (let d = 1; d <= reach; d += 1) {
      line -= shadowRise;
      land = offset(cell, down, d);
      const h = slabs[land] ?? 0;
      if (h <= line) break;
      line = h;
      if (d % hop === 0 && random() < (h > 0 ? params.depositOnSand : params.depositOnBed)) break;
    }
    slabs[land] = (slabs[land] ?? 0) + 1;
    if ((slabs[land] ?? 0) > tallest) tallest = slabs[land] ?? 0;
    avalanche(land);
  }

  function measureTallest(): void {
    tallest = 0;
    for (let i = 0; i < cells; i += 1) if ((slabs[i] ?? 0) > tallest) tallest = slabs[i] ?? 0;
  }

  return {
    grid,
    seed,
    slabThickness,
    params: () => copyParams(params),
    retune(patch) {
      const next = copyParams({ ...params, ...patch });
      checkParams(next);
      params = next;
      prepare();
    },
    step(sweeps = 1) {
      if (!(sweeps >= 0) || !Number.isFinite(sweeps)) throw new Error(`dune sweeps must be finite and ≥ 0, got ${sweeps}`);
      const total = Math.round(sweeps * cells);
      for (let k = 0; k < total; k += 1) {
        if (k % cells === 0) measureTallest();
        event();
      }
    },
    sweeps: () => events / cells,
    slabs: () => slabs,
    thickness(out = new Float64Array(cells)) {
      for (let i = 0; i < cells; i += 1) out[i] = (slabs[i] ?? 0) * slabThickness;
      return out;
    },
    snapshot: () => ({ version: 1, grid: { ...grid }, params: copyParams(params), seed, events, random: random.state(), slabs: Array.from(slabs) }),
    restore(snapshot) {
      if (snapshot.version !== 1) throw new Error(`dune snapshot version ${String(snapshot.version)} is not supported`);
      if (snapshot.grid.cols !== cols || snapshot.grid.rows !== rows || snapshot.slabs.length !== cells) throw new Error("dune snapshot grid does not match this field");
      const next = copyParams(snapshot.params);
      checkParams(next);
      params = next;
      prepare();
      slabs.set(snapshot.slabs);
      events = snapshot.events;
      random.restore(snapshot.random);
    },
    reset() {
      slabs.set(start);
      events = 0;
      random.restore(seededRng(`${seed}/dunes`).state());
    },
    hash() {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < cells; i += 1) {
        h ^= slabs[i] ?? 0;
        h = Math.imul(h, 16777619) >>> 0;
      }
      return `${h.toString(16).padStart(8, "0")}${(events >>> 0).toString(16)}`;
    },
  };
}

/** Angle in degrees of a slope that drops `slabDrop` slabs over `cells` cells, for a field's slab thickness. */
export function duneSlopeAngle(field: DuneField, slabDrop: number, cells = 1): number {
  return (plantAtan((slabDrop * field.slabThickness) / (cells * field.grid.cellSize)) * 180) / PLANT_PI;
}
