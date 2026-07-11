import { CELLS, PRESS_MASKS, popcount } from "./board";

interface Equation {
  coef: number;
  rhs: number;
}

interface Elimination {
  particular: number;
  nulls: number[];
}

function eliminate(board: number): Elimination | null {
  const rows: Equation[] = [];
  for (let cell = 0; cell < CELLS; cell += 1) {
    rows.push({ coef: PRESS_MASKS[cell] >>> 0, rhs: (board >> cell) & 1 });
  }

  const pivotRowForCol: number[] = new Array<number>(CELLS).fill(-1);
  let rank = 0;
  for (let col = 0; col < CELLS && rank < CELLS; col += 1) {
    let sel = -1;
    for (let r = rank; r < CELLS; r += 1) {
      if (((rows[r].coef >> col) & 1) === 1) {
        sel = r;
        break;
      }
    }
    if (sel === -1) continue;
    const tmp = rows[rank];
    rows[rank] = rows[sel];
    rows[sel] = tmp;
    for (let r = 0; r < CELLS; r += 1) {
      if (r !== rank && ((rows[r].coef >> col) & 1) === 1) {
        rows[r].coef ^= rows[rank].coef;
        rows[r].rhs ^= rows[rank].rhs;
      }
    }
    pivotRowForCol[col] = rank;
    rank += 1;
  }

  for (let r = 0; r < CELLS; r += 1) {
    if (rows[r].coef === 0 && rows[r].rhs === 1) return null;
  }

  let particular = 0;
  for (let col = 0; col < CELLS; col += 1) {
    const row = pivotRowForCol[col];
    if (row !== -1 && rows[row].rhs === 1) particular |= 1 << col;
  }

  const nulls: number[] = [];
  for (let free = 0; free < CELLS; free += 1) {
    if (pivotRowForCol[free] !== -1) continue;
    let vec = 1 << free;
    for (let col = 0; col < CELLS; col += 1) {
      const row = pivotRowForCol[col];
      if (row !== -1 && ((rows[row].coef >> free) & 1) === 1) vec |= 1 << col;
    }
    nulls.push(vec >>> 0);
  }

  return { particular: particular >>> 0, nulls };
}

export function isSolvable(board: number): boolean {
  return eliminate(board) !== null;
}

export function nullSpace(): number[] {
  return eliminate(0)?.nulls ?? [];
}

export function solveLightsOut(board: number): number | null {
  const result = eliminate(board);
  if (result === null) return null;
  const { particular, nulls } = result;
  if (nulls.length === 0 || nulls.length > 20) return particular;

  let best = particular;
  let bestWeight = popcount(particular);
  const combos = 1 << nulls.length;
  for (let mask = 1; mask < combos; mask += 1) {
    let candidate = particular;
    for (let bit = 0; bit < nulls.length; bit += 1) {
      if ((mask & (1 << bit)) !== 0) candidate ^= nulls[bit];
    }
    const weight = popcount(candidate >>> 0);
    if (weight < bestWeight) {
      bestWeight = weight;
      best = candidate >>> 0;
    }
  }
  return best >>> 0;
}

export function optimalPressCount(board: number): number | null {
  const solution = solveLightsOut(board);
  return solution === null ? null : popcount(solution);
}

export function hintCell(board: number): number | null {
  const solution = solveLightsOut(board);
  if (solution === null || solution === 0) return null;
  for (let cell = 0; cell < CELLS; cell += 1) {
    if (((solution >> cell) & 1) === 1) return cell;
  }
  return null;
}
