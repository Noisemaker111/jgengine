// Pure minesweeper board logic — no engine imports, fully unit-testable.
// The board is an N x N grid; cells are addressed by index = row * n + col.

export interface Board {
  readonly n: number;
  readonly bomb: readonly boolean[];
  readonly adjacent: readonly number[];
  readonly revealed: boolean[];
  readonly flagged: boolean[];
}

export const idx = (n: number, col: number, row: number): number => row * n + col;
export const colOf = (n: number, index: number): number => index % n;
export const rowOf = (n: number, index: number): number => Math.floor(index / n);

/** Deterministic PRNG (mulberry32) so boards are reproducible across clients + in tests. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function neighbors(n: number, index: number): number[] {
  const col = colOf(n, index);
  const row = rowOf(n, index);
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || c >= n || r < 0 || r >= n) continue;
      out.push(idx(n, c, r));
    }
  }
  return out;
}

/**
 * Build a board with `bombCount` bombs, guaranteeing `safeIndex` and its
 * neighbours are bomb-free (classic first-dig-is-safe). Bombs are placed with
 * the supplied RNG so the layout is reproducible.
 */
export function createBoard(
  n: number,
  bombCount: number,
  rng: () => number,
  safeIndex?: number,
): Board {
  const total = n * n;
  const forbidden = new Set<number>();
  if (safeIndex !== undefined) {
    forbidden.add(safeIndex);
    for (const nb of neighbors(n, safeIndex)) forbidden.add(nb);
  }
  const candidates: number[] = [];
  for (let i = 0; i < total; i += 1) if (!forbidden.has(i)) candidates.push(i);

  // Fisher-Yates shuffle, then take the first `bombCount`.
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = tmp;
  }
  const placeable = Math.min(bombCount, candidates.length);
  const bomb = new Array<boolean>(total).fill(false);
  for (let i = 0; i < placeable; i += 1) bomb[candidates[i]!] = true;

  const adjacent = new Array<number>(total).fill(0);
  for (let i = 0; i < total; i += 1) {
    if (bomb[i]) continue;
    let count = 0;
    for (const nb of neighbors(n, i)) if (bomb[nb]) count += 1;
    adjacent[i] = count;
  }

  return {
    n,
    bomb,
    adjacent,
    revealed: new Array<boolean>(total).fill(false),
    flagged: new Array<boolean>(total).fill(false),
  };
}

export function isBomb(board: Board, index: number): boolean {
  return board.bomb[index] === true;
}

/**
 * Reveal `index`. If it's a bomb, returns `{ hitBomb: true }` and reveals it.
 * Otherwise flood-fills zero-adjacency regions and returns the list of newly
 * revealed non-bomb indices.
 */
export function reveal(board: Board, index: number): { hitBomb: boolean; opened: number[] } {
  if (board.revealed[index]) return { hitBomb: false, opened: [] };
  if (isBomb(board, index)) {
    board.revealed[index] = true;
    return { hitBomb: true, opened: [index] };
  }
  const opened: number[] = [];
  const stack = [index];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (board.revealed[cur] || isBomb(board, cur)) continue;
    board.revealed[cur] = true;
    board.flagged[cur] = false;
    opened.push(cur);
    if (board.adjacent[cur] === 0) {
      for (const nb of neighbors(board.n, cur)) {
        if (!board.revealed[nb] && !isBomb(board, nb)) stack.push(nb);
      }
    }
  }
  return { hitBomb: false, opened };
}

export function toggleFlag(board: Board, index: number): boolean {
  if (board.revealed[index]) return board.flagged[index] ?? false;
  board.flagged[index] = !board.flagged[index];
  return board.flagged[index] ?? false;
}

export function countRevealed(board: Board): number {
  let c = 0;
  for (const r of board.revealed) if (r) c += 1;
  return c;
}

export function countFlagged(board: Board): number {
  let c = 0;
  for (const f of board.flagged) if (f) c += 1;
  return c;
}

/** Safe cells remaining to reveal before the board is cleared. */
export function safeRemaining(board: Board): number {
  const total = board.n * board.n;
  let bombs = 0;
  for (const b of board.bomb) if (b) bombs += 1;
  return total - bombs - countRevealed(board);
}

export function isWin(board: Board): boolean {
  return safeRemaining(board) === 0;
}

export function bombTotal(board: Board): number {
  let bombs = 0;
  for (const b of board.bomb) if (b) bombs += 1;
  return bombs;
}
