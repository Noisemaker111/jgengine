export interface CellStateGridConfig<TState extends string> {
  cols: number;
  rows: number;
  /** The ordered escalation ladder; every cell starts at `states[0]`. */
  states: readonly TState[];
  /** World-space center of cell (0, 0), for `cellOf` world→cell mapping. Default `[0, 0]`. */
  origin?: readonly [number, number];
  /** World units per cell, for `cellOf`. Default `1`. */
  cellSize?: number;
}

export interface CellRef {
  col: number;
  row: number;
}

/**
 * A uniform world grid whose cells step through a discrete state ladder — pristine → cracked →
 * burning → ruined — driven by whatever world events the game routes in (#284.8). Pure storage plus
 * ladder mechanics; the game decides *when* to escalate, the grid guarantees ordered, clamped steps
 * and cheap queries. `version()` bumps on every change for dirty-checked rendering.
 */
export interface CellStateGrid<TState extends string> {
  readonly cols: number;
  readonly rows: number;
  readonly states: readonly TState[];
  stateAt(col: number, row: number): TState | null;
  /** Ladder index at a cell; `-1` outside the grid. */
  indexAt(col: number, row: number): number;
  /** Step a cell up the ladder (clamped at the last state); returns the new state or `null` outside the grid. */
  escalate(col: number, row: number, steps?: number): TState | null;
  /** Step a cell back down (clamped at the first state). */
  regress(col: number, row: number, steps?: number): TState | null;
  set(col: number, row: number, state: TState): boolean;
  /** Escalate every cell the predicate matches; returns how many changed. */
  escalateWhere(predicate: (col: number, row: number, state: TState) => boolean, steps?: number): number;
  cellsIn(state: TState): CellRef[];
  counts(): Record<TState, number>;
  /** World position → cell, using `origin`/`cellSize`; `null` outside the grid. */
  cellOf(x: number, z: number): CellRef | null;
  /** World-space center of a cell. */
  centerOf(col: number, row: number): readonly [number, number];
  /** Bumps on every state change — key re-renders/dirty checks off it. */
  version(): number;
  reset(): void;
}

export function createCellStateGrid<TState extends string>(config: CellStateGridConfig<TState>): CellStateGrid<TState> {
  if (config.states.length === 0) throw new Error("cell state grid needs at least one state");
  if (!(config.cols > 0) || !(config.rows > 0)) {
    throw new Error(`cell state grid needs positive dimensions, got ${config.cols}x${config.rows}`);
  }
  const stateIndex = new Map<TState, number>();
  config.states.forEach((state, index) => {
    if (stateIndex.has(state)) throw new Error(`duplicate cell state: ${state}`);
    stateIndex.set(state, index);
  });
  const [originX, originZ] = config.origin ?? [0, 0];
  const cellSize = config.cellSize ?? 1;
  const cells = new Int32Array(config.cols * config.rows);
  let version = 0;

  function inBounds(col: number, row: number): boolean {
    return Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < config.cols && row >= 0 && row < config.rows;
  }

  function indexOf(col: number, row: number): number {
    return row * config.cols + col;
  }

  function step(col: number, row: number, steps: number): TState | null {
    if (!inBounds(col, row)) return null;
    const at = indexOf(col, row);
    const next = Math.max(0, Math.min(config.states.length - 1, cells[at]! + steps));
    if (next !== cells[at]) {
      cells[at] = next;
      version += 1;
    }
    return config.states[next]!;
  }

  return {
    cols: config.cols,
    rows: config.rows,
    states: config.states,
    stateAt: (col, row) => (inBounds(col, row) ? config.states[cells[indexOf(col, row)]!]! : null),
    indexAt: (col, row) => (inBounds(col, row) ? cells[indexOf(col, row)]! : -1),
    escalate: (col, row, steps = 1) => step(col, row, Math.max(0, steps)),
    regress: (col, row, steps = 1) => step(col, row, -Math.max(0, steps)),
    set(col, row, state) {
      const target = stateIndex.get(state);
      if (target === undefined || !inBounds(col, row)) return false;
      const at = indexOf(col, row);
      if (cells[at] !== target) {
        cells[at] = target;
        version += 1;
      }
      return true;
    },
    escalateWhere(predicate, steps = 1) {
      let changed = 0;
      for (let row = 0; row < config.rows; row += 1) {
        for (let col = 0; col < config.cols; col += 1) {
          const at = indexOf(col, row);
          if (!predicate(col, row, config.states[cells[at]!]!)) continue;
          const next = Math.min(config.states.length - 1, cells[at]! + Math.max(0, steps));
          if (next !== cells[at]) {
            cells[at] = next;
            changed += 1;
          }
        }
      }
      if (changed > 0) version += 1;
      return changed;
    },
    cellsIn(state) {
      const target = stateIndex.get(state);
      const refs: CellRef[] = [];
      if (target === undefined) return refs;
      for (let row = 0; row < config.rows; row += 1) {
        for (let col = 0; col < config.cols; col += 1) {
          if (cells[indexOf(col, row)] === target) refs.push({ col, row });
        }
      }
      return refs;
    },
    counts() {
      const result = Object.fromEntries(config.states.map((state) => [state, 0])) as Record<TState, number>;
      for (let at = 0; at < cells.length; at += 1) {
        result[config.states[cells[at]!]!] += 1;
      }
      return result;
    },
    cellOf(x, z) {
      const col = Math.round((x - originX) / cellSize);
      const row = Math.round((z - originZ) / cellSize);
      return inBounds(col, row) ? { col, row } : null;
    },
    centerOf: (col, row) => [originX + col * cellSize, originZ + row * cellSize],
    version: () => version,
    reset() {
      cells.fill(0);
      version += 1;
    },
  };
}
