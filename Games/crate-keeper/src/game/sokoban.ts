export type Dir = "U" | "D" | "L" | "R";

export const DIRS: readonly Dir[] = ["U", "D", "L", "R"];

const DELTA: Record<Dir, { dx: number; dy: number }> = {
  U: { dx: 0, dy: -1 },
  D: { dx: 0, dy: 1 },
  L: { dx: -1, dy: 0 },
  R: { dx: 1, dy: 0 },
};

export type CellKind = "wall" | "floor" | "goal";

export type ParsedLevel = {
  readonly width: number;
  readonly height: number;
  readonly walls: readonly boolean[];
  readonly goals: readonly boolean[];
  readonly cells: readonly CellKind[];
  readonly crateStarts: readonly number[];
  readonly playerStart: number;
  readonly goalCount: number;
};

export type BoardState = {
  readonly parsed: ParsedLevel;
  crates: number[];
  player: number;
  moves: number;
  pushes: number;
  lastDir: Dir | null;
  lastPushed: boolean;
};

export function idx(parsed: ParsedLevel, x: number, y: number): number {
  return y * parsed.width + x;
}

export function coords(parsed: ParsedLevel, i: number): { x: number; y: number } {
  return { x: i % parsed.width, y: Math.floor(i / parsed.width) };
}

export function parseLevel(grid: readonly string[]): ParsedLevel {
  const height = grid.length;
  const width = Math.max(...grid.map((row) => row.length));
  const walls: boolean[] = new Array(width * height).fill(false);
  const goals: boolean[] = new Array(width * height).fill(false);
  const crateStarts: number[] = [];
  let playerStart = -1;
  for (let y = 0; y < height; y += 1) {
    const row = grid[y];
    for (let x = 0; x < width; x += 1) {
      const ch = x < row.length ? row[x] : "#";
      const i = y * width + x;
      if (ch === "#") walls[i] = true;
      if (ch === "." || ch === "*" || ch === "+") goals[i] = true;
      if (ch === "$" || ch === "*") crateStarts.push(i);
      if (ch === "@" || ch === "+") playerStart = i;
    }
  }
  const cells: CellKind[] = walls.map((wall, i) => (wall ? "wall" : goals[i] ? "goal" : "floor"));
  return {
    width,
    height,
    walls,
    goals,
    cells,
    crateStarts,
    playerStart,
    goalCount: goals.filter(Boolean).length,
  };
}

export function initBoard(parsed: ParsedLevel): BoardState {
  return {
    parsed,
    crates: [...parsed.crateStarts],
    player: parsed.playerStart,
    moves: 0,
    pushes: 0,
    lastDir: null,
    lastPushed: false,
  };
}

export function cloneBoard(board: BoardState): BoardState {
  return {
    parsed: board.parsed,
    crates: board.crates.slice(),
    player: board.player,
    moves: board.moves,
    pushes: board.pushes,
    lastDir: board.lastDir,
    lastPushed: board.lastPushed,
  };
}

export type MoveResult = { moved: boolean; pushed: boolean };

export function applyMove(board: BoardState, dir: Dir): MoveResult {
  const { parsed } = board;
  const { width, walls } = parsed;
  const { dx, dy } = DELTA[dir];
  const step = dy * width + dx;
  const target = board.player + step;
  if (walls[target]) return { moved: false, pushed: false };
  const crateSlot = board.crates.indexOf(target);
  if (crateSlot >= 0) {
    const beyond = target + step;
    if (walls[beyond] || board.crates.includes(beyond)) return { moved: false, pushed: false };
    board.crates[crateSlot] = beyond;
    board.player = target;
    board.moves += 1;
    board.pushes += 1;
    board.lastDir = dir;
    board.lastPushed = true;
    return { moved: true, pushed: true };
  }
  board.player = target;
  board.moves += 1;
  board.lastDir = dir;
  board.lastPushed = false;
  return { moved: true, pushed: false };
}

export function isSolved(board: BoardState): boolean {
  for (const crate of board.crates) if (!board.parsed.goals[crate]) return false;
  return true;
}

export function replay(parsed: ParsedLevel, solution: string): BoardState {
  const board = initBoard(parsed);
  for (const ch of solution) applyMove(board, ch as Dir);
  return board;
}
