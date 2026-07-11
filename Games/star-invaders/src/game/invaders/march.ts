import {
  CELL_W,
  CELL_SLOT_W,
  EDGE_MARGIN,
  FIELD_W,
  MARCH_FAST,
  MARCH_FLOOR,
  MARCH_SLOW,
  STEP_X,
  STEP_Y,
  WAVE_SPEEDUP,
} from "./constants";

export type AliveGrid = readonly (readonly boolean[])[];

export interface ColumnRange {
  readonly minCol: number;
  readonly maxCol: number;
}

export function aliveColumnRange(alive: AliveGrid): ColumnRange | null {
  let minCol = Infinity;
  let maxCol = -Infinity;
  for (const row of alive) {
    for (let col = 0; col < row.length; col += 1) {
      if (!row[col]) continue;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }
  if (maxCol < 0) return null;
  return { minCol, maxCol };
}

export function countAlive(alive: AliveGrid): number {
  let total = 0;
  for (const row of alive) for (const cell of row) if (cell) total += 1;
  return total;
}

export function marchInterval(aliveCount: number, totalCount: number, wave: number): number {
  const fraction = totalCount > 0 ? aliveCount / totalCount : 0;
  const base = MARCH_FAST + (MARCH_SLOW - MARCH_FAST) * fraction;
  const scaled = base * Math.pow(WAVE_SPEEDUP, Math.max(0, wave - 1));
  return Math.max(MARCH_FLOOR, scaled);
}

export interface MarchState {
  readonly originX: number;
  readonly dir: 1 | -1;
}

export interface MarchStep {
  readonly originX: number;
  readonly dir: 1 | -1;
  readonly dropY: number;
  readonly descended: boolean;
}

export function stepFormation(state: MarchState, range: ColumnRange): MarchStep {
  const proposedX = state.originX + state.dir * STEP_X;
  const newLeft = proposedX + range.minCol * CELL_W;
  const newRight = proposedX + range.maxCol * CELL_W + CELL_SLOT_W;
  if (state.dir > 0 && newRight > FIELD_W - EDGE_MARGIN) {
    return { originX: state.originX, dir: -1, dropY: STEP_Y, descended: true };
  }
  if (state.dir < 0 && newLeft < EDGE_MARGIN) {
    return { originX: state.originX, dir: 1, dropY: STEP_Y, descended: true };
  }
  return { originX: proposedX, dir: state.dir, dropY: 0, descended: false };
}
