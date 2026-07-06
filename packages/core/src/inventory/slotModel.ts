export type Slot<T> = T | null;

export type SlotGrid<T> = readonly Slot<T>[];

export type SlotResult<T> =
  | { status: "ok"; grid: Slot<T>[] }
  | { status: "rejected"; reason: "invalid-slot" | "slot-occupied" | "empty-slot" };

export function createSlots<T>(size: number): Slot<T>[] {
  return new Array<Slot<T>>(Math.max(0, size)).fill(null);
}

export function normalizeSlots<T>(values: SlotGrid<T>, size: number): Slot<T>[] {
  const grid = createSlots<T>(size);
  for (let index = 0; index < size; index++) grid[index] = values[index] ?? null;
  return grid;
}

function inRange<T>(grid: SlotGrid<T>, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < grid.length;
}

export function placeAt<T>(grid: SlotGrid<T>, index: number, value: T): SlotResult<T> {
  if (!inRange(grid, index)) return { status: "rejected", reason: "invalid-slot" };
  if (grid[index] !== null) return { status: "rejected", reason: "slot-occupied" };
  const next = grid.slice();
  next[index] = value;
  return { status: "ok", grid: next };
}

export function removeAt<T>(grid: SlotGrid<T>, index: number): SlotResult<T> {
  if (!inRange(grid, index)) return { status: "rejected", reason: "invalid-slot" };
  if (grid[index] === null) return { status: "rejected", reason: "empty-slot" };
  const next = grid.slice();
  next[index] = null;
  return { status: "ok", grid: next };
}

export function moveSlot<T>(grid: SlotGrid<T>, from: number, to: number): SlotResult<T> {
  if (!inRange(grid, from) || !inRange(grid, to)) return { status: "rejected", reason: "invalid-slot" };
  if (grid[from] === null) return { status: "rejected", reason: "empty-slot" };
  const next = grid.slice();
  const moved = next[from]!;
  next[from] = next[to];
  next[to] = moved;
  return { status: "ok", grid: next };
}

export function firstEmpty<T>(grid: SlotGrid<T>): number | null {
  for (let index = 0; index < grid.length; index++) {
    if (grid[index] === null) return index;
  }
  return null;
}

export function insertFirst<T>(grid: SlotGrid<T>, value: T): SlotResult<T> {
  const index = firstEmpty(grid);
  if (index === null) return { status: "rejected", reason: "slot-occupied" };
  return placeAt(grid, index, value);
}

export function compactSlots<T>(grid: SlotGrid<T>): Slot<T>[] {
  const filled = grid.filter((slot): slot is T => slot !== null);
  const next = createSlots<T>(grid.length);
  for (let index = 0; index < filled.length; index++) next[index] = filled[index]!;
  return next;
}

export function countFilled<T>(grid: SlotGrid<T>): number {
  let count = 0;
  for (const slot of grid) if (slot !== null) count += 1;
  return count;
}

export function indexOfSlot<T>(grid: SlotGrid<T>, match: (value: T, index: number) => boolean): number | null {
  for (let index = 0; index < grid.length; index++) {
    const slot = grid[index];
    if (slot !== null && match(slot, index)) return index;
  }
  return null;
}
