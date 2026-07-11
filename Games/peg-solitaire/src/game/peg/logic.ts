export interface Cell {
  readonly r: number;
  readonly c: number;
}

export type BoardId = "english" | "european";

export interface BoardDef {
  readonly id: BoardId;
  readonly name: string;
  readonly size: number;
  readonly holes: readonly Cell[];
  readonly holeSet: ReadonlySet<string>;
  readonly center: Cell;
}

export interface Jump {
  readonly from: Cell;
  readonly over: Cell;
  readonly to: Cell;
}

export type OutcomeTier = "brilliant" | "solved" | "stuck";

export interface Outcome {
  readonly tier: OutcomeTier;
  readonly pegsLeft: number;
  readonly atCenter: boolean;
}

export const BOARD_SIZE = 7;
const CENTER: Cell = { r: 3, c: 3 };

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export function cellKey(r: number, c: number): string {
  return `${r},${c}`;
}

export function keyOf(cell: Cell): string {
  return cellKey(cell.r, cell.c);
}

export function parseKey(key: string): Cell {
  const comma = key.indexOf(",");
  return { r: Number(key.slice(0, comma)), c: Number(key.slice(comma + 1)) };
}

export function centerKey(board: BoardDef): string {
  return keyOf(board.center);
}

function englishHole(r: number, c: number): boolean {
  const midCol = c >= 2 && c <= 4;
  const midRow = r >= 2 && r <= 4;
  return midCol || midRow;
}

const EUROPEAN_ROW_SPANS: readonly (readonly [number, number])[] = [
  [2, 4],
  [1, 5],
  [0, 6],
  [0, 6],
  [0, 6],
  [1, 5],
  [2, 4],
];

function europeanHole(r: number, c: number): boolean {
  const span = EUROPEAN_ROW_SPANS[r];
  if (span === undefined) return false;
  return c >= span[0] && c <= span[1];
}

function buildBoard(id: BoardId, name: string, member: (r: number, c: number) => boolean): BoardDef {
  const holes: Cell[] = [];
  const holeSet = new Set<string>();
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (!member(r, c)) continue;
      holes.push({ r, c });
      holeSet.add(cellKey(r, c));
    }
  }
  return { id, name, size: BOARD_SIZE, holes, holeSet, center: CENTER };
}

const BOARDS: Readonly<Record<BoardId, BoardDef>> = {
  english: buildBoard("english", "English cross", englishHole),
  european: buildBoard("european", "European", europeanHole),
};

export const BOARD_IDS: readonly BoardId[] = ["english", "european"];

export function boardOf(id: BoardId): BoardDef {
  return BOARDS[id];
}

export function isHole(board: BoardDef, r: number, c: number): boolean {
  return board.holeSet.has(cellKey(r, c));
}

/** Orthogonal neighbours that are themselves valid holes on this board. */
export function orthoNeighbors(board: BoardDef, cell: Cell): Cell[] {
  const out: Cell[] = [];
  for (const [dr, dc] of DIRECTIONS) {
    const r = cell.r + dr;
    const c = cell.c + dc;
    if (isHole(board, r, c)) out.push({ r, c });
  }
  return out;
}

/** The canonical opening: every hole filled except the centre. */
export function initialPegs(board: BoardDef): Set<string> {
  const pegs = new Set<string>();
  const center = centerKey(board);
  for (const key of board.holeSet) {
    if (key !== center) pegs.add(key);
  }
  return pegs;
}

/**
 * Legal jumps that start from one peg: a peg leaps orthogonally over an
 * adjacent peg into the empty hole two cells away in a straight line. All
 * three cells must be valid holes; the middle occupied, the landing empty.
 */
export function legalJumpsFrom(board: BoardDef, occupied: ReadonlySet<string>, cell: Cell): Jump[] {
  const jumps: Jump[] = [];
  if (!occupied.has(keyOf(cell))) return jumps;
  for (const [dr, dc] of DIRECTIONS) {
    const over: Cell = { r: cell.r + dr, c: cell.c + dc };
    const to: Cell = { r: cell.r + 2 * dr, c: cell.c + 2 * dc };
    const overKey = keyOf(over);
    const toKey = keyOf(to);
    if (
      board.holeSet.has(overKey) &&
      board.holeSet.has(toKey) &&
      occupied.has(overKey) &&
      !occupied.has(toKey)
    ) {
      jumps.push({ from: { r: cell.r, c: cell.c }, over, to });
    }
  }
  return jumps;
}

/** Every legal jump on the board, scanning from each occupied peg. */
export function allLegalJumps(board: BoardDef, occupied: ReadonlySet<string>): Jump[] {
  const jumps: Jump[] = [];
  for (const key of occupied) {
    jumps.push(...legalJumpsFrom(board, occupied, parseKey(key)));
  }
  return jumps;
}

export function hasAnyJump(board: BoardDef, occupied: ReadonlySet<string>): boolean {
  for (const key of occupied) {
    if (legalJumpsFrom(board, occupied, parseKey(key)).length > 0) return true;
  }
  return false;
}

/** The jump matching a start peg and a chosen landing, or null if illegal. */
export function jumpBetween(
  board: BoardDef,
  occupied: ReadonlySet<string>,
  from: Cell,
  to: Cell,
): Jump | null {
  for (const jump of legalJumpsFrom(board, occupied, from)) {
    if (jump.to.r === to.r && jump.to.c === to.c) return jump;
  }
  return null;
}

/** Apply a jump: the mover leaves `from`, the jumped peg is removed, `to` fills. */
export function applyJump(occupied: ReadonlySet<string>, jump: Jump): Set<string> {
  const next = new Set(occupied);
  next.delete(keyOf(jump.from));
  next.delete(keyOf(jump.over));
  next.add(keyOf(jump.to));
  return next;
}

export function isGameOver(board: BoardDef, occupied: ReadonlySet<string>): boolean {
  return !hasAnyJump(board, occupied);
}

/**
 * Classify a finished board. One peg in the centre is brilliant; one peg
 * anywhere is solved; anything else is stuck with its peg count.
 */
export function classifyOutcome(board: BoardDef, occupied: ReadonlySet<string>): Outcome {
  const pegsLeft = occupied.size;
  if (pegsLeft === 1) {
    const only = occupied.values().next().value as string;
    const atCenter = only === centerKey(board);
    return { tier: atCenter ? "brilliant" : "solved", pegsLeft, atCenter };
  }
  return { tier: "stuck", pegsLeft, atCenter: false };
}

const SCORE_MOVE_BASE = 1000;

/** Lexicographic best key: fewest pegs first, then fewest moves. Lower is better. */
export function encodeScore(pegsLeft: number, moves: number): number {
  return pegsLeft * SCORE_MOVE_BASE + moves;
}

export function decodeScore(score: number): { pegsLeft: number; moves: number } {
  return { pegsLeft: Math.floor(score / SCORE_MOVE_BASE), moves: score % SCORE_MOVE_BASE };
}
