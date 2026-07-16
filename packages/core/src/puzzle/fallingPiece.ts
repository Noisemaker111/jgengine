import { cellAt, type CellGrid } from "./cellGrid";

export interface FallingPiece<TShape extends string = string> {
  readonly shape: TShape;
  readonly rotation: number;
  readonly x: number;
  readonly y: number;
}

export type ShapeTable<TShape extends string = string> = Record<
  TShape,
  readonly (readonly (readonly [number, number])[])[]
>;

/** @internal */
export function pieceCells<TShape extends string>(
  table: ShapeTable<TShape>,
  piece: FallingPiece<TShape>,
): readonly (readonly [number, number])[] {
  const rotations = table[piece.shape];
  const index = ((piece.rotation % rotations.length) + rotations.length) % rotations.length;
  const state = rotations[index]!;
  return state.map(([ox, oy]) => [piece.x + ox, piece.y + oy] as const);
}

/** @internal */
export function pieceCollides<T, TShape extends string>(
  grid: CellGrid<T>,
  table: ShapeTable<TShape>,
  piece: FallingPiece<TShape>,
): boolean {
  for (const [x, y] of pieceCells(table, piece)) {
    if (x < 0 || x >= grid.width || y >= grid.height) return true;
    if (y >= 0 && cellAt(grid, x, y) !== null) return true;
  }
  return false;
}

/** @internal */
export function mergePiece<T, TShape extends string>(
  grid: CellGrid<T>,
  table: ShapeTable<TShape>,
  piece: FallingPiece<TShape>,
  value: T,
): CellGrid<T> {
  const cells = grid.cells.slice();
  for (const [x, y] of pieceCells(table, piece)) {
    if (x >= 0 && x < grid.width && y >= 0 && y < grid.height) cells[y * grid.width + x] = value;
  }
  return { width: grid.width, height: grid.height, cells };
}

/** @internal */
export function dropDistance<T, TShape extends string>(
  grid: CellGrid<T>,
  table: ShapeTable<TShape>,
  piece: FallingPiece<TShape>,
): number {
  let distance = 0;
  while (!pieceCollides(grid, table, { ...piece, y: piece.y + distance + 1 })) distance += 1;
  return distance;
}

/** @internal */
export function gravityInterval(level: number, base = 0.8, perLevel = 0.07, min = 0.05): number {
  return Math.max(min, base - level * perLevel);
}

/** @internal */
export function levelForLines(lines: number, linesPerLevel = 10): number {
  return Math.floor(lines / linesPerLevel);
}

const CLASSIC_LINE_SCORE: readonly number[] = [0, 40, 100, 300, 1200];

/** @internal */
export function lineScore(
  cleared: number,
  level: number,
  table: readonly number[] = CLASSIC_LINE_SCORE,
): number {
  return (table[cleared] ?? 0) * (level + 1);
}

export interface LockDelayState {
  readonly delaySeconds: number;
  readonly elapsed: number;
}

/** @internal */
export function createLockDelay(delaySeconds: number): LockDelayState {
  return { delaySeconds, elapsed: 0 };
}

/** @internal */
export function stepLockDelay(
  state: LockDelayState,
  grounded: boolean,
  dt: number,
): { state: LockDelayState; locked: boolean } {
  if (!grounded) return { state: { ...state, elapsed: 0 }, locked: false };
  const elapsed = state.elapsed + dt;
  if (elapsed >= state.delaySeconds) return { state: { ...state, elapsed: 0 }, locked: true };
  return { state: { ...state, elapsed }, locked: false };
}
