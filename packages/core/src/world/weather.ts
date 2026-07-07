import type { WindVector } from "./wind";

export type WeatherKind = string;

export interface WeatherState {
  /** Game-defined kind: "clear", "rain", "storm", "snow", "fog", "sandstorm". */
  kind: WeatherKind;
  /** 0..1 severity — scales every modifier. */
  intensity: number;
  wind?: WindVector;
}

/** Per-kind gameplay effect values at full intensity. Intensity interpolates from neutral. */
export interface WeatherModifier {
  /** Movement traction multiplier at full intensity — <1 = mud/ice slows, 1 = normal. */
  grip?: number;
  /** View distance multiplier at full intensity — 0..1, 1 = clear. */
  visibility?: number;
  /** Structure HP lost per game-second at full intensity (hail, storm). */
  structureDamage?: number;
  /** Temperature delta at full intensity (a blizzard chills). */
  chill?: number;
  /** Lightning ignition chance per game-second at full intensity. */
  ignition?: number;
  /** Fire spread-rate multiplier at full intensity — rain suppresses (<1). Default neutral 1. */
  spread?: number;
}

export type WeatherModifierTable = Record<WeatherKind, WeatherModifier>;

export interface ResolvedWeather {
  grip: number;
  visibility: number;
  structureDamage: number;
  chill: number;
  ignition: number;
  spread: number;
}

const NEUTRAL: ResolvedWeather = {
  grip: 1,
  visibility: 1,
  structureDamage: 0,
  chill: 0,
  ignition: 0,
  spread: 1,
};

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Resolve a weather state against a game-owned modifier table into concrete gameplay
 * numbers. Multiplier-style effects (grip, visibility, spread) interpolate from the
 * neutral 1 by intensity; rate-style effects (structureDamage, ignition, chill) scale
 * linearly. Games read `grip`/`visibility` in movement and AI, `structureDamage` on a
 * building tick, and `spread`/`ignition` feed the fire grid.
 */
export function resolveWeather(state: WeatherState, table: WeatherModifierTable): ResolvedWeather {
  const entry = table[state.kind];
  if (entry === undefined) return { ...NEUTRAL };
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
}

export interface FireStepOptions {
  /** Global spread multiplier this step (rain suppression from resolveWeather().spread). Default 1. */
  spread?: number;
  /** Per-cell wetness 0..1 that resists ignition — from an environment field. */
  wetnessAt?: (col: number, row: number) => number;
}

export interface FireGrid {
  readonly cols: number;
  readonly rows: number;
  /** Advance the cellular propagation by game-time `dt`. */
  step(dt: number, options?: FireStepOptions): void;
  igniteCell(col: number, row: number): void;
  /** Ignite the cell under a world position; no-op if outside the grid. */
  ignite(x: number, z: number): boolean;
  cell(col: number, row: number): FireCell;
  cellAt(x: number, z: number): FireCell | null;
  cellCoord(x: number, z: number): { col: number; row: number } | null;
  /** Count of currently burning cells. */
  readonly burning: number;
  /** Flat snapshot (row-major) for rendering. */
  snapshot(): FireCell[];
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
  if (cols <= 0 || rows <= 0) throw new Error("createFireGrid: cols/rows must be positive");
  const originX = config.origin?.[0] ?? 0;
  const originZ = config.origin?.[1] ?? 0;
  const ignitionThreshold = config.ignitionThreshold ?? 1;
  const spreadRate = config.spreadRate ?? 0.6;
  const burnRate = config.burnRate ?? 0.25;
  const windBias = Math.max(0, Math.min(1, config.windBias ?? 0.6));
  const wind = config.wind;
  const windLen = wind === undefined ? 0 : Math.hypot(wind[0], wind[1]);
  const windX = windLen > 0 ? wind![0] / windLen : 0;
  const windZ = windLen > 0 ? wind![1] / windLen : 0;

  const cells: FireCell[] = new Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const fuel = config.fuelAt?.(col, row) ?? 1;
      cells[row * cols + col] = { fuel: Math.max(0, fuel), heat: 0, state: "unburnt" };
    }
  }

  const index = (col: number, row: number): number => row * cols + col;
  const inBounds = (col: number, row: number): boolean =>
    col >= 0 && col < cols && row >= 0 && row < rows;

  const cellCoord = (x: number, z: number): { col: number; row: number } | null => {
    const col = Math.round((x - originX) / cellSize);
    const row = Math.round((z - originZ) / cellSize);
    return inBounds(col, row) ? { col, row } : null;
  };

  const directionalWeight = (dx: number, dz: number): number => {
    if (windLen === 0) return 1;
    const len = Math.hypot(dx, dz) || 1;
    const alignment = (dx / len) * windX + (dz / len) * windZ;
    return 1 + windBias * alignment;
  };

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

  return {
    cols,
    rows,
    step(dt, options) {
      if (dt <= 0) return;
      const globalSpread = options?.spread ?? 1;
      const wetnessAt = options?.wetnessAt;
      const addedHeat = new Float64Array(cols * rows);

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const cell = cells[index(col, row)]!;
          if (cell.state !== "burning") continue;
          for (const [dx, dz] of NEIGHBOURS) {
            const nc = col + dx;
            const nr = row + dz;
            if (!inBounds(nc, nr)) continue;
            const neighbour = cells[index(nc, nr)]!;
            if (neighbour.state === "burnt" || neighbour.fuel <= 0) continue;
            addedHeat[index(nc, nr)] +=
              spreadRate * globalSpread * directionalWeight(dx, dz) * dt;
          }
        }
      }

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const i = index(col, row);
          const cell = cells[i]!;
          if (cell.state === "burning") {
            cell.fuel = Math.max(0, cell.fuel - burnRate * dt);
            if (cell.fuel <= 0) {
              cell.state = "burnt";
              cell.heat = 0;
              burning -= 1;
            }
            continue;
          }
          if (cell.state !== "unburnt" || addedHeat[i] === 0) continue;
          const resist = wetnessAt === undefined ? 0 : Math.max(0, Math.min(1, wetnessAt(col, row)));
          cell.heat += addedHeat[i]! * (1 - resist);
          if (cell.heat >= ignitionThreshold && cell.fuel > 0) {
            cell.state = "burning";
            burning += 1;
          }
        }
      }
    },
    igniteCell,
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
