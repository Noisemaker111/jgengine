export const SIZE = 9;
export const CELLS = 81;
export const EMPTY = 0;
export const ALL_DIGITS = 0b1111111110; // bits 1..9 set, bit 0 unused

export function rowOf(i: number): number {
  return Math.floor(i / SIZE);
}

export function colOf(i: number): number {
  return i % SIZE;
}

export function boxOf(i: number): number {
  return Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);
}

export function indexOf(row: number, col: number): number {
  return row * SIZE + col;
}

function buildUnits(): number[][] {
  const units: number[][] = [];
  for (let r = 0; r < SIZE; r += 1) {
    const unit: number[] = [];
    for (let c = 0; c < SIZE; c += 1) unit.push(indexOf(r, c));
    units.push(unit);
  }
  for (let c = 0; c < SIZE; c += 1) {
    const unit: number[] = [];
    for (let r = 0; r < SIZE; r += 1) unit.push(indexOf(r, c));
    units.push(unit);
  }
  for (let b = 0; b < SIZE; b += 1) {
    const unit: number[] = [];
    const br = Math.floor(b / 3) * 3;
    const bc = (b % 3) * 3;
    for (let dr = 0; dr < 3; dr += 1) for (let dc = 0; dc < 3; dc += 1) unit.push(indexOf(br + dr, bc + dc));
    units.push(unit);
  }
  return units;
}

/** The 27 units (9 rows, 9 columns, 9 boxes) as index lists. */
export const UNITS: number[][] = buildUnits();

function buildPeers(): number[][] {
  const peers: number[][] = [];
  for (let i = 0; i < CELLS; i += 1) {
    const set = new Set<number>();
    const r = rowOf(i);
    const c = colOf(i);
    for (let k = 0; k < SIZE; k += 1) {
      set.add(indexOf(r, k));
      set.add(indexOf(k, c));
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr += 1) for (let dc = 0; dc < 3; dc += 1) set.add(indexOf(br + dr, bc + dc));
    set.delete(i);
    peers.push([...set]);
  }
  return peers;
}

/** For each cell, its 20 peers (same row, column, or box), excluding itself. */
export const PEERS: number[][] = buildPeers();

/** Bitmask (bits 1..9) of digits still legal at cell `i` given `grid`. */
export function candidatesMask(grid: readonly number[], i: number): number {
  let used = 0;
  for (const p of PEERS[i]) {
    const v = grid[p];
    if (v !== 0) used |= 1 << v;
  }
  return ~used & ALL_DIGITS;
}

export function candidateList(grid: readonly number[], i: number): number[] {
  const mask = candidatesMask(grid, i);
  const out: number[] = [];
  for (let d = 1; d <= SIZE; d += 1) if (mask & (1 << d)) out.push(d);
  return out;
}

export function hasNote(mask: number, digit: number): boolean {
  return (mask & (1 << digit)) !== 0;
}

export function toggleNoteBit(mask: number, digit: number): number {
  return mask ^ (1 << digit);
}
