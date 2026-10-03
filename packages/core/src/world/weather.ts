import type { WindVector } from "./wind";

export type WeatherKind = string;

export interface WeatherState {
  kind: WeatherKind;
  intensity: number;
  wind?: WindVector;
}

export interface WeatherModifier {
  grip?: number;
  visibility?: number;
  structureDamage?: number;
  chill?: number;
  ignition?: number;
  spread?: number;
}

export type WeatherModifierTable<K extends string = string> = Record<K, WeatherModifier>;

export type WeatherKindOf<TTable extends WeatherModifierTable> = Extract<keyof TTable, string>;

export interface ResolvedWeather {
  grip: number;
  visibility: number;
  structureDamage: number;
  chill: number;
  ignition: number;
  spread: number;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function resolveWeather<TTable extends WeatherModifierTable>(
  state: WeatherState,
  table: TTable,
): ResolvedWeather {
  const entry = table[state.kind as WeatherKindOf<TTable>] as WeatherModifier | undefined;
  if (entry === undefined) {
    const known = Object.keys(table).sort().join(", ");
    throw new Error(
      `Unknown weather kind "${state.kind}". Known kinds: ${known.length > 0 ? known : "(none)"}.`,
    );
  }
  const t = Math.max(0, Math.min(1, state.intensity));
  return {
    grip: lerp(1, entry.grip ?? 1, t),
    visibility: lerp(1, entry.visibility ?? 1, t),
    structureDamage: (entry.structureDamage ?? 0) * t,
    chill: (entry.chill ?? 0) * t,
    ignition: (entry.ignition ?? 0) * t,
    spread: lerp(1, entry.spread ?? 1, t),
  };
}

// --- Coarse cellular fire spread (not a fluid solver) ---

export type FireCellState = "unburnt" | "burning" | "burnt";

export interface FireCell {
  fuel: number;
  heat: number;
  state: FireCellState;
}

export interface FireGridConfig {
  cols: number;
  rows: number;
  cellSize: number;
  /** World x,z of the center of cell (0,0). Default [0,0]. */
  origin?: readonly [number, number];
  /** Initial fuel 0..1 per cell; default 1 everywhere. */
  fuelAt?: (col: number, row: number) => number;
  /** Accumulated heat needed to ignite a fuelled cell. Default 1. */
  ignitionThreshold?: number;
  /** Heat pushed to each neighbour per second from a burning cell. Default 0.6. */
  spreadRate?: number;
  /** Fuel consumed per second while burning. Default 0.25. */
  burnRate?: number;
  /** Prevailing wind biasing spread direction. */
  wind?: WindVector;
  /** How strongly wind biases downwind vs upwind spread, 0..1. Default 0.6. */
  windBias?: number;
  /** Hard allocation bound; defaults to 65536 cells. */
  maxCells?: number;
}

/** Live fire ignition, spread, consumption and wind policies; grid geometry stays fixed. */
export type FireGridTuning = Pick<FireGridConfig, "ignitionThreshold" | "spreadRate" | "burnRate" | "wind" | "windBias">;

export interface FireStepOptions {
  /** Global spread multiplier this step (rain suppression from resolveWeather().spread). Default 1. */
  spread?: number;
  /** Live wind in metres/second along world X,Z, overriding configured wind this step. */
  wind?: WindVector;
  windAt?: (x: number, z: number) => WindVector;
  /** Per-cell wetness 0..1 that resists ignition — from an environment field. */
  wetnessAt?: (col: number, row: number) => number;
  /** Heat removed per second at full wetness; 0 (default) leaves extinction to game policy. */
  extinguishRate?: number;
}

export interface FireGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly origin: readonly [number, number];
  /** Advance the cellular propagation by game-time `dt`. */
  step(dt: number, options?: FireStepOptions): void;
  igniteCell(col: number, row: number): void;
  /** Cool a burning cell to unburnt without replacing its remaining fuel. */
  extinguishCell(col: number, row: number): boolean;
  /** Extinguish the cell under a world position; false outside the grid or when not burning. */
  extinguish(x: number, z: number): boolean;
  /** Ignite the cell under a world position; no-op if outside the grid. */
  ignite(x: number, z: number): boolean;
  cell(col: number, row: number): FireCell;
  cellAt(x: number, z: number): FireCell | null;
  cellCoord(x: number, z: number): { col: number; row: number } | null;
  /** Count of currently burning cells. */
  readonly burning: number;
  /** Flat snapshot (row-major) for rendering. */
  snapshot(): FireCell[];
  restore(state: readonly FireCell[]): void;
  retune(tuning: FireGridTuning): void;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export function createFireGrid(config: FireGridConfig): FireGrid {
  const { cols, rows, cellSize } = config;
  const maxCells = config.maxCells ?? 65_536;
  if (!Number.isSafeInteger(maxCells) || maxCells < 1 || maxCells > 1_048_576) throw new Error("createFireGrid: maxCells must be an integer in 1..1048576");
  if (!Number.isSafeInteger(cols) || !Number.isSafeInteger(rows) || cols <= 0 || rows <= 0 || cols * rows > maxCells) throw new Error("createFireGrid: cols/rows must be positive integers within maxCells");
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error("createFireGrid: cellSize must be finite and positive");
  const originX = config.origin?.[0] ?? 0;
  const originZ = config.origin?.[1] ?? 0;
  if (!Number.isFinite(originX) || !Number.isFinite(originZ)) throw new Error("createFireGrid: origin must be finite");
  let ignitionThreshold = 1;
  let spreadRate = 0.6;
  let burnRate = 0.25;
  let windBias = 0.6;
  let wind: WindVector | undefined;
  function retune(tuning: FireGridTuning): void {
    for (const key of ["ignitionThreshold", "spreadRate", "burnRate", "windBias"] as const) {
      const value = tuning[key];
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || (key === "windBias" && value > 1))) throw new Error(`fire ${key} is invalid`);
    }
    if (tuning.wind !== undefined && (!Number.isFinite(tuning.wind[0]) || !Number.isFinite(tuning.wind[1]))) throw new Error("fire wind must be finite");
    ignitionThreshold = tuning.ignitionThreshold ?? ignitionThreshold;
    spreadRate = tuning.spreadRate ?? spreadRate;
    burnRate = tuning.burnRate ?? burnRate;
    windBias = tuning.windBias ?? windBias;
    if (tuning.wind !== undefined) wind = [tuning.wind[0], tuning.wind[1]];
  }
  retune(config);

  const cells: FireCell[] = new Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const fuel = config.fuelAt?.(col, row) ?? 1;
      if (!Number.isFinite(fuel) || fuel < 0) throw new Error("fire initial fuel must be finite and nonnegative");
      cells[row * cols + col] = { fuel: Math.max(0, fuel), heat: 0, state: "unburnt" };
    }
  }

  const index = (col: number, row: number): number => row * cols + col;
  const inBounds = (col: number, row: number): boolean =>
    Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < cols && row >= 0 && row < rows;

  const cellCoord = (x: number, z: number): { col: number; row: number } | null => {
    const col = Math.round((x - originX) / cellSize);
    const row = Math.round((z - originZ) / cellSize);
    return inBounds(col, row) ? { col, row } : null;
  };

  const directionalWeight = (dx: number, dz: number, vector: WindVector | undefined): number => {
    if (vector === undefined) return 1;
    const windLen = Math.hypot(vector[0], vector[1]);
    if (windLen === 0) return 1;
    const len = Math.hypot(dx, dz) || 1;
    const alignment = (dx / len) * vector[0] / windLen + (dz / len) * vector[1] / windLen;
    return 1 + windBias * alignment;
  };
  const addedHeat = new Float64Array(cols * rows);
  const wetness = new Float64Array(cols * rows);

  let burning = 0;
  for (const cell of cells) if (cell.state === "burning") burning += 1;

  const igniteCell = (col: number, row: number): void => {
    if (!inBounds(col, row)) return;
    const cell = cells[index(col, row)]!;
    if (cell.state === "burnt" || cell.fuel <= 0) return;
    if (cell.state !== "burning") burning += 1;
    cell.state = "burning";
    cell.heat = Math.max(cell.heat, ignitionThreshold);
  };

  const extinguishCell = (col: number, row: number): boolean => {
    if (!inBounds(col, row)) return false;
    const cell = cells[index(col, row)]!;
    if (cell.state !== "burning") return false;
    cell.state = "unburnt";
    cell.heat = 0;
    burning -= 1;
    return true;
  };

  return {
    cols,
    rows,
    cellSize,
    origin: [originX, originZ],
    retune,
    restore(state) {
      if (state.length !== cells.length) throw new Error("fire snapshot dimensions do not match");
      const next = state.map((cell) => {
        if (!Number.isFinite(cell.fuel) || cell.fuel < 0 || !Number.isFinite(cell.heat) || cell.heat < 0 || !["unburnt", "burning", "burnt"].includes(cell.state) || (cell.state === "burning" && cell.fuel <= 0) || (cell.state === "burnt" && (cell.fuel !== 0 || cell.heat !== 0))) throw new Error("invalid fire snapshot cell");
        return { ...cell };
      });
      burning = 0;
      for (let i = 0; i < cells.length; i += 1) { cells[i] = next[i]!; if (cells[i]!.state === "burning") burning += 1; }
    },
    step(dt, options) {
      if (!Number.isFinite(dt) || dt < 0) throw new Error("fire dt must be finite and nonnegative");
      if (dt === 0) return;
      const globalSpread = options?.spread ?? 1;
      if (!Number.isFinite(globalSpread) || globalSpread < 0) throw new Error("fire spread multiplier must be finite and nonnegative");
      const wetnessAt = options?.wetnessAt;
      const extinguishRate = options?.extinguishRate ?? 0;
      if (!Number.isFinite(extinguishRate) || extinguishRate < 0) throw new Error("fire extinguishRate must be finite and nonnegative");
      const resolveWetness = (col: number, row: number): number => {
        const value = wetnessAt?.(col, row) ?? 0;
        if (!Number.isFinite(value)) throw new Error("fire wetness must be finite");
        return Math.max(0, Math.min(1, value));
      };
      addedHeat.fill(0);
      wetness.fill(0);

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const cell = cells[index(col, row)]!;
          if (cell.state !== "burning") continue;
          const vector = options?.windAt?.(originX + col * cellSize, originZ + row * cellSize) ?? options?.wind ?? wind;
          if (vector !== undefined && (!Number.isFinite(vector[0]) || !Number.isFinite(vector[1]))) throw new Error("fire step wind must be finite");
          const i = index(col, row);
          if (extinguishRate > 0) wetness[i] = resolveWetness(col, row);
          const coolingRate = extinguishRate * wetness[i]!;
          const burningDt = Math.min(dt, burnRate === 0 ? Infinity : cell.fuel / burnRate, coolingRate === 0 ? Infinity : cell.heat / coolingRate);
          for (const [dx, dz] of NEIGHBOURS) {
            const nc = col + dx;
            const nr = row + dz;
            if (!inBounds(nc, nr)) continue;
            const neighbour = cells[index(nc, nr)]!;
            if (neighbour.state === "burnt" || neighbour.fuel <= 0) continue;
            addedHeat[index(nc, nr)] +=
              spreadRate * globalSpread * directionalWeight(dx, dz, vector) * burningDt;
          }
        }
      }

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const i = index(col, row);
          const cell = cells[i]!;
          if (cell.state === "unburnt" && (addedHeat[i]! > 0 || (extinguishRate > 0 && cell.heat > 0))) wetness[i] = resolveWetness(col, row);
        }
      }

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const i = index(col, row);
          const cell = cells[i]!;
          const coolingRate = extinguishRate * wetness[i]!;
          if (cell.state === "burning") {
            const burningDt = Math.min(dt, coolingRate === 0 ? Infinity : cell.heat / coolingRate);
            cell.fuel = Math.max(0, cell.fuel - burnRate * burningDt);
            cell.heat = Math.max(0, cell.heat - coolingRate * dt);
            if (cell.fuel <= 0) {
              cell.state = "burnt";
              cell.heat = 0;
              burning -= 1;
            } else if (coolingRate > 0 && cell.heat <= 0) {
              extinguishCell(col, row);
            }
            continue;
          }
          if (cell.state !== "unburnt" || (addedHeat[i] === 0 && coolingRate === 0)) continue;
          cell.heat = Math.max(0, cell.heat + addedHeat[i]! * (1 - wetness[i]!) - coolingRate * dt);
          if (cell.heat >= ignitionThreshold && cell.fuel > 0) {
            cell.state = "burning";
            burning += 1;
          }
        }
      }
    },
    igniteCell,
    extinguishCell,
    extinguish(x, z) {
      const coord = cellCoord(x, z);
      return coord !== null && extinguishCell(coord.col, coord.row);
    },
    ignite(x, z) {
      const coord = cellCoord(x, z);
      if (coord === null) return false;
      igniteCell(coord.col, coord.row);
      return true;
    },
    cell(col, row) {
      if (!inBounds(col, row)) throw new Error(`fire cell out of bounds: ${col},${row}`);
      return cells[index(col, row)]!;
    },
    cellAt(x, z) {
      const coord = cellCoord(x, z);
      return coord === null ? null : cells[index(coord.col, coord.row)]!;
    },
    cellCoord,
    get burning() {
      return burning;
    },
    snapshot() {
      return cells.map((cell) => ({ ...cell }));
    },
  };
}
