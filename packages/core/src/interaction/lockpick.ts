import { seededRng } from "../random/rng";

/** One discrete pick move: how far the pick drives into the lock this step. */
export type LockAction = "hardSet" | "set" | "steady" | "ease" | "drop";

/** Vertical row delta applied to the pick for each action. Row 0 is the shallow/top row. */
export const LOCK_ACTION_DELTA: Readonly<Record<LockAction, number>> = {
  hardSet: -2,
  set: -1,
  steady: 0,
  ease: 1,
  drop: 2,
};

/** The five pick actions, in display order (shallow → deep). */
export const LOCK_ACTIONS: readonly LockAction[] = ["hardSet", "set", "steady", "ease", "drop"];

/** Difficulty dials for one lock: board size, forgiveness band, gates, fog window, traps. */
export interface LockTierSpec {
  cols: number;
  rows: number;
  width: number;
  gateCount: number;
  visibilityWindow: number;
  allowedActions: readonly LockAction[];
  trapCount?: number;
}

/** A generated lock board. `open[col]` holds every enterable row in that column. */
export interface LockSpec {
  seed: string | number;
  tier: LockTierSpec;
  open: readonly (readonly number[])[];
  gates: readonly number[];
  traps: readonly (readonly number[])[];
  startRow: number;
  seatRow: number;
}

/** Outcome of one {@link stepLock} call: `advanced`/`success` move the pick, `slip`/`bind`/`trap`
 * do not and should cost a life. */
export type LockStepResult = "advanced" | "slip" | "bind" | "trap" | "success";

/** What a revealed cell renders as: a plain open notch, an exact tumbler gate, the bolt seat
 * (win condition), or a ward-trap that looks open but jams on contact. */
export type LockCellKind = "open" | "gate" | "seat" | "trap";

/** One cell inside the fogged {@link visibleCells} window: its board position and kind. */
export interface LockCell {
  col: number;
  row: number;
  kind: LockCellKind;
}

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function legalDeltas(tier: LockTierSpec): number[] {
  return tier.allowedActions.map((action) => LOCK_ACTION_DELTA[action]);
}

function sampleGateColumns(rng: () => number, cols: number, count: number): number[] {
  const candidates: number[] = [];
  for (let c = 1; c <= cols - 2; c += 1) candidates.push(c);
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = randInt(rng, 0, i);
    const tmp = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = tmp;
  }
  return candidates.slice(0, Math.max(0, Math.min(count, candidates.length))).sort((a, b) => a - b);
}

/**
 * Generate a solvable depth-puzzle lock: a "Tumbler's Path" board with a guaranteed solution
 * path carved first, an open-row forgiveness band wrapped around it, tumbler gate columns that
 * pinch to a single exact row, and optional ward-traps that look open but jam on contact.
 * Deterministic: the same (seed, tier) always yields the same board.
 *
 * @capability lockpick a solvable grid depth-puzzle with fog-of-war, gates, and hidden traps
 */
export function generateLock(seed: string | number, tier: LockTierSpec): LockSpec {
  const rng = seededRng(seed);
  const rows = tier.rows;
  const cols = tier.cols;
  const deltas = legalDeltas(tier);

  const path: number[] = new Array(cols);
  path[0] = randInt(rng, 0, rows - 1);
  for (let c = 1; c < cols; c += 1) {
    const legal = deltas.filter((d) => path[c - 1]! + d >= 0 && path[c - 1]! + d <= rows - 1);
    path[c] = path[c - 1]! + (legal.length > 0 ? legal[randInt(rng, 0, legal.length - 1)]! : 0);
  }

  const gates = sampleGateColumns(rng, cols, tier.gateCount);
  const gateSet = new Set(gates);

  const open: number[][] = new Array(cols);
  for (let c = 0; c < cols; c += 1) {
    if (c === cols - 1 || gateSet.has(c)) {
      open[c] = [path[c]!];
      continue;
    }
    const band: number[] = [];
    for (let r = path[c]! - tier.width; r <= path[c]! + tier.width; r += 1) {
      if (r >= 0 && r <= rows - 1) band.push(r);
    }
    open[c] = band;
  }

  for (let c = 1; c < cols; c += 1) {
    const prev = open[c - 1]!;
    open[c] = open[c]!.filter((r) => prev.some((pr) => deltas.includes(r - pr)));
  }
  for (let c = cols - 2; c >= 0; c -= 1) {
    const next = open[c + 1]!;
    open[c] = open[c]!.filter((r) => next.some((nr) => deltas.includes(nr - r)));
  }

  const traps: number[][] = open.map(() => []);
  const trapBudget = Math.max(0, tier.trapCount ?? 0);
  if (trapBudget > 0) {
    const candidates: Array<[number, number]> = [];
    for (let c = 1; c < cols - 1; c += 1) {
      if (gateSet.has(c)) continue;
      for (const r of open[c]!) if (r !== path[c]) candidates.push([c, r]);
    }
    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const j = randInt(rng, 0, i);
      const tmp = candidates[i]!;
      candidates[i] = candidates[j]!;
      candidates[j] = tmp;
    }
    for (const [c, r] of candidates.slice(0, Math.min(trapBudget, candidates.length))) traps[c]!.push(r);
    for (const t of traps) t.sort((a, b) => a - b);
  }

  return { seed, tier, open, gates, traps, startRow: path[0]!, seatRow: path[cols - 1]! };
}

/** Return a concrete row-per-column solution, or null if the board is unsolvable. */
export function solveLockPath(spec: LockSpec): number[] | null {
  const deltas = legalDeltas(spec.tier);
  const cols = spec.open.length;
  const safe = (c: number, r: number): boolean => spec.open[c]!.includes(r) && !spec.traps[c]?.includes(r);
  if (!safe(0, spec.startRow)) return null;
  const parents: Map<number, number>[] = [];
  let reach = new Set<number>([spec.startRow]);
  parents[0] = new Map();
  for (let c = 1; c < cols; c += 1) {
    const next = new Set<number>();
    const par = new Map<number, number>();
    for (const r of reach) {
      for (const d of deltas) {
        const nr = r + d;
        if (safe(c, nr) && !par.has(nr)) {
          par.set(nr, r);
          next.add(nr);
        }
      }
    }
    parents[c] = par;
    reach = next;
    if (reach.size === 0) return null;
  }
  if (!reach.has(spec.seatRow)) return null;
  const path: number[] = new Array(cols);
  path[cols - 1] = spec.seatRow;
  for (let c = cols - 1; c > 0; c -= 1) path[c - 1] = parents[c]!.get(path[c]!)!;
  return path;
}

/** Whether the board has a path from the start row to the bolt seat at all. */
export function solveLock(spec: LockSpec): boolean {
  return solveLockPath(spec) !== null;
}

/** Authoritative single step. The caller owns the lives economy: a slip/bind/trap does not
 * advance the pick and should cost a life; advanced/success move the pick. */
export function stepLock(
  spec: LockSpec,
  col: number,
  row: number,
  action: LockAction,
): { result: LockStepResult; col: number; row: number } {
  const rows = spec.tier.rows;
  const newRow = Math.max(0, Math.min(rows - 1, row + LOCK_ACTION_DELTA[action]));
  const newCol = col + 1;
  const colOpen = spec.open[newCol];
  if (colOpen === undefined || !colOpen.includes(newRow)) {
    const isGate = spec.gates.includes(newCol);
    return { result: isGate ? "bind" : "slip", col, row };
  }
  if (spec.traps[newCol]?.includes(newRow) === true) {
    return { result: "trap", col, row };
  }
  if (newCol === spec.open.length - 1 && newRow === spec.seatRow) {
    return { result: "success", col: newCol, row: newRow };
  }
  return { result: "advanced", col: newCol, row: newRow };
}

/** The render-safe slice: every open cell in columns [0, col + window]. The single source of
 * truth for fog and the anti-cheat boundary — never serialize the full spec to a client. */
export function visibleCells(spec: LockSpec, col: number, window: number): LockCell[] {
  const last = spec.open.length - 1;
  const maxCol = window >= spec.tier.cols ? last : Math.min(last, col + window);
  const cells: LockCell[] = [];
  for (let c = 0; c <= maxCol; c += 1) {
    const trapRows = spec.traps[c];
    for (const r of spec.open[c]!) {
      const kind: LockCellKind =
        c === last ? "seat" : spec.gates.includes(c) ? "gate" : trapRows?.includes(r) === true ? "trap" : "open";
      cells.push({ col: c, row: r, kind });
    }
  }
  return cells;
}
