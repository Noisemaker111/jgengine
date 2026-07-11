import { createRecordBook, type RecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";

import {
  allLegalJumps,
  boardOf,
  cellKey,
  classifyOutcome,
  decodeScore,
  encodeScore,
  hasAnyJump,
  initialPegs,
  jumpBetween,
  keyOf,
  legalJumpsFrom,
  parseKey,
  type BoardDef,
  type BoardId,
  type Cell,
  type Jump,
  type Outcome,
} from "./logic";

export const HOP_MS = 240;
export const POP_MS = 300;
export const NUDGE_MS = 360;
export const HINT_MS = 2600;

export interface PegView {
  readonly id: number;
  readonly r: number;
  readonly c: number;
}

export type PegStatus = "playing" | "over";

export interface PegSnapshot {
  readonly boardId: BoardId;
  readonly boardName: string;
  readonly size: number;
  readonly holes: readonly Cell[];
  readonly center: Cell;
  readonly pegs: readonly PegView[];
  readonly capturing: readonly PegView[];
  readonly selected: Cell | null;
  readonly landings: readonly Cell[];
  readonly movable: readonly string[];
  readonly hint: Jump | null;
  readonly nudge: string | null;
  readonly hopping: number | null;
  readonly moves: number;
  readonly pegsLeft: number;
  readonly startPegs: number;
  readonly canUndo: boolean;
  readonly status: PegStatus;
  readonly outcome: Outcome | null;
  readonly bestPegs: number | null;
  readonly bestMoves: number | null;
  readonly newRecord: boolean;
}

export interface PegStore {
  getState(): PegSnapshot;
  subscribe(listener: (snapshot: PegSnapshot) => void): () => void;
  init(): void;
  setBoard(id: BoardId): void;
  restart(): void;
  pickHole(r: number, c: number): void;
  jumpTo(fromR: number, fromC: number, toR: number, toC: number): void;
  undo(): void;
  showHint(): void;
  clearSelection(): void;
  tick(dt: number): void;
  preview(): void;
}

interface HistoryEntry {
  readonly occupants: readonly (readonly [string, number])[];
  readonly moves: number;
}

interface Capture {
  readonly id: number;
  readonly r: number;
  readonly c: number;
  elapsed: number;
}

function resolveStorage(): RecordStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function createPegStore(): PegStore {
  const storage = resolveStorage();
  const books = new Map<BoardId, RecordBook<"score">>();
  const bookFor = (id: BoardId): RecordBook<"score"> => {
    let book = books.get(id);
    if (book === undefined) {
      book = createRecordBook<"score">({
        key: `peg-solitaire:best:${id}`,
        fields: { score: "lower" },
        storage,
      });
      books.set(id, book);
    }
    return book;
  };

  let board: BoardDef = boardOf("english");
  let occupants = new Map<string, number>();
  let nextId = 1;
  let moves = 0;
  let startPegs = 0;
  let history: HistoryEntry[] = [];
  let selected: string | null = null;
  let hint: Jump | null = null;
  let hintElapsed = 0;
  let nudge: string | null = null;
  let nudgeElapsed = 0;
  let hopping: number | null = null;
  let hopElapsed = 0;
  let capturing: Capture[] = [];
  let status: PegStatus = "playing";
  let outcome: Outcome | null = null;
  let newRecord = false;

  const listeners = new Set<(snapshot: PegSnapshot) => void>();

  function occupiedSet(): Set<string> {
    return new Set(occupants.keys());
  }

  function snapshot(): PegSnapshot {
    const occupied = occupiedSet();
    const pegs: PegView[] = [];
    for (const [key, id] of occupants) {
      const { r, c } = parseKey(key);
      pegs.push({ id, r, c });
    }
    const movable: string[] = [];
    for (const key of occupants.keys()) {
      if (legalJumpsFrom(board, occupied, parseKey(key)).length > 0) movable.push(key);
    }
    const selectedCell = selected === null ? null : parseKey(selected);
    const landings =
      selectedCell === null ? [] : legalJumpsFrom(board, occupied, selectedCell).map((j) => j.to);
    const best = bookFor(board.id).bestOf("score");
    const decoded = best === null ? null : decodeScore(best);
    return {
      boardId: board.id,
      boardName: board.name,
      size: board.size,
      holes: board.holes,
      center: board.center,
      pegs,
      capturing: capturing.map((cap) => ({ id: cap.id, r: cap.r, c: cap.c })),
      selected: selectedCell,
      landings,
      movable,
      hint,
      nudge,
      hopping,
      moves,
      pegsLeft: occupants.size,
      startPegs,
      canUndo: history.length > 0,
      status,
      outcome,
      bestPegs: decoded === null ? null : decoded.pegsLeft,
      bestMoves: decoded === null ? null : decoded.moves,
      newRecord,
    };
  }

  let current = snapshot();
  function emit(): void {
    current = snapshot();
    for (const listener of listeners) listener(current);
  }

  function resetBoard(next: BoardDef): void {
    board = next;
    occupants = new Map();
    for (const key of initialPegs(board)) {
      occupants.set(key, nextId);
      nextId += 1;
    }
    startPegs = occupants.size;
    moves = 0;
    history = [];
    selected = null;
    hint = null;
    hintElapsed = 0;
    nudge = null;
    hopping = null;
    capturing = [];
    status = "playing";
    outcome = null;
    newRecord = false;
  }

  function snapshotHistory(): void {
    history.push({ occupants: [...occupants.entries()], moves });
  }

  function finishIfOver(): void {
    if (hasAnyJump(board, occupiedSet())) return;
    status = "over";
    selected = null;
    hint = null;
    outcome = classifyOutcome(board, occupiedSet());
    const result = bookFor(board.id).submit({ score: encodeScore(outcome.pegsLeft, moves) });
    newRecord = result.improved.includes("score");
  }

  function performJump(jump: Jump): void {
    const fromKey = keyOf(jump.from);
    const overKey = keyOf(jump.over);
    const toKey = keyOf(jump.to);
    const moverId = occupants.get(fromKey);
    const capturedId = occupants.get(overKey);
    if (moverId === undefined || capturedId === undefined) return;
    snapshotHistory();
    occupants.delete(fromKey);
    occupants.delete(overKey);
    occupants.set(toKey, moverId);
    moves += 1;
    hopping = moverId;
    hopElapsed = 0;
    capturing.push({ id: capturedId, r: jump.over.r, c: jump.over.c, elapsed: 0 });
    nudge = null;
    hint = null;
    const landedFurther = legalJumpsFrom(board, occupiedSet(), jump.to).length > 0;
    selected = landedFurther ? toKey : null;
    finishIfOver();
    emit();
  }

  function selectPeg(key: string, cell: Cell): void {
    if (legalJumpsFrom(board, occupiedSet(), cell).length === 0) {
      nudge = key;
      nudgeElapsed = 0;
      emit();
      return;
    }
    selected = key;
    hint = null;
    emit();
  }

  return {
    getState: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    init() {
      resetBoard(boardOf("english"));
      emit();
    },
    setBoard(id) {
      resetBoard(boardOf(id));
      emit();
    },
    restart() {
      resetBoard(board);
      emit();
    },
    pickHole(r, c) {
      if (status === "over") return;
      const key = cellKey(r, c);
      if (!board.holeSet.has(key)) return;
      if (occupants.has(key)) {
        if (selected === key) {
          selected = null;
          emit();
          return;
        }
        selectPeg(key, { r, c });
        return;
      }
      if (selected !== null) {
        const jump = jumpBetween(board, occupiedSet(), parseKey(selected), { r, c });
        if (jump !== null) {
          performJump(jump);
          return;
        }
      }
      if (selected !== null) {
        selected = null;
        emit();
      }
    },
    jumpTo(fromR, fromC, toR, toC) {
      if (status === "over") return;
      const jump = jumpBetween(board, occupiedSet(), { r: fromR, c: fromC }, { r: toR, c: toC });
      if (jump !== null) performJump(jump);
    },
    undo() {
      const entry = history.pop();
      if (entry === undefined) return;
      occupants = new Map(entry.occupants.map(([k, v]) => [k, v]));
      moves = entry.moves;
      selected = null;
      hint = null;
      nudge = null;
      hopping = null;
      capturing = [];
      status = "playing";
      outcome = null;
      newRecord = false;
      emit();
    },
    showHint() {
      if (status === "over") return;
      const jumps = allLegalJumps(board, occupiedSet());
      if (jumps.length === 0) return;
      hint = jumps[0] ?? null;
      hintElapsed = 0;
      emit();
    },
    clearSelection() {
      if (selected === null && hint === null) return;
      selected = null;
      hint = null;
      emit();
    },
    tick(dt) {
      const ms = dt * 1000;
      let dirty = false;
      if (hopping !== null) {
        hopElapsed += ms;
        if (hopElapsed >= HOP_MS) {
          hopping = null;
          dirty = true;
        }
      }
      if (capturing.length > 0) {
        const before = capturing.length;
        for (const cap of capturing) cap.elapsed += ms;
        capturing = capturing.filter((cap) => cap.elapsed < POP_MS);
        if (capturing.length !== before) dirty = true;
      }
      if (nudge !== null) {
        nudgeElapsed += ms;
        if (nudgeElapsed >= NUDGE_MS) {
          nudge = null;
          dirty = true;
        }
      }
      if (hint !== null) {
        hintElapsed += ms;
        if (hintElapsed >= HINT_MS) {
          hint = null;
          dirty = true;
        }
      }
      if (dirty) emit();
    },
    preview() {
      resetBoard(boardOf("english"));
      for (let i = 0; i < 10; i += 1) {
        const jumps = allLegalJumps(board, occupiedSet());
        const jump = jumps[0];
        if (jump === undefined) break;
        const fromKey = keyOf(jump.from);
        const moverId = occupants.get(fromKey) ?? nextId++;
        occupants.delete(fromKey);
        occupants.delete(keyOf(jump.over));
        occupants.set(keyOf(jump.to), moverId);
        moves += 1;
      }
      const occupied = occupiedSet();
      let bestKey: string | null = null;
      let bestLandings = 0;
      for (const key of occupants.keys()) {
        const count = legalJumpsFrom(board, occupied, parseKey(key)).length;
        if (count > bestLandings) {
          bestLandings = count;
          bestKey = key;
        }
      }
      selected = bestKey;
      bookFor("english").submit({ score: encodeScore(2, startPegs - 2) });
      emit();
    },
  };
}

export const store = createPegStore();
