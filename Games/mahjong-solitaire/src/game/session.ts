import { findFreePairs, findHint, generateDeal, reshuffleRemaining } from "./mahjong/deal";
import { freeSlots, isFree, SLOT_COUNT } from "./mahjong/layout";
import { matchable } from "./mahjong/tiles";
import { currentBest, recordWin } from "./records";

export const STORE_KEY = "mahjong-session";
export const RESHUFFLES = 3;

export type SeedSource = "random" | "seed" | "daily";
export type Status = "playing" | "won";
export type TileState = "free" | "blocked" | "selected" | "hinted";

interface RemovedPair {
  readonly a: number;
  readonly b: number;
  readonly faceA: string;
  readonly faceB: string;
}

export interface Session {
  readonly seed: string;
  readonly source: SeedSource;
  readonly faces: ReadonlyArray<string | null>;
  readonly selected: number | null;
  readonly hint: readonly [number, number] | null;
  readonly hintsUsed: number;
  readonly reshufflesLeft: number;
  readonly history: readonly RemovedPair[];
  readonly moves: number;
  readonly startedAtMs: number | null;
  readonly finishedMs: number | null;
  readonly status: Status;
  readonly best: number | null;
  readonly improved: readonly string[];
}

function presentSet(faces: ReadonlyArray<string | null>): Set<number> {
  const present = new Set<number>();
  for (let i = 0; i < faces.length; i += 1) if (faces[i] !== null) present.add(i);
  return present;
}

export function newSession(seed: string, source: SeedSource): Session {
  const { faces } = generateDeal(seed);
  return {
    seed,
    source,
    faces,
    selected: null,
    hint: null,
    hintsUsed: 0,
    reshufflesLeft: RESHUFFLES,
    history: [],
    moves: 0,
    startedAtMs: null,
    finishedMs: null,
    status: "playing",
    best: currentBest(),
    improved: [],
  };
}

export function applyPick(session: Session, slotId: number): Session {
  if (session.status === "won") return session;
  const present = presentSet(session.faces);
  if (!present.has(slotId) || !isFree(slotId, present)) return session;

  const selected = session.selected;
  if (selected === null) return { ...session, selected: slotId, hint: null };
  if (selected === slotId) return { ...session, selected: null, hint: null };

  const faceA = session.faces[selected];
  const faceB = session.faces[slotId];
  if (faceA === null || !present.has(selected) || !isFree(selected, present)) {
    return { ...session, selected: slotId, hint: null };
  }
  if (faceB === null || !matchable(faceA, faceB)) {
    return { ...session, selected: slotId, hint: null };
  }

  const faces = session.faces.slice();
  faces[selected] = null;
  faces[slotId] = null;
  const history = [...session.history, { a: selected, b: slotId, faceA, faceB }];
  const now = Date.now();
  const startedAtMs = session.startedAtMs ?? now;
  const remaining = faces.reduce((n, f) => (f !== null ? n + 1 : n), 0);

  if (remaining === 0) {
    const finishedMs = now - startedAtMs;
    const record = recordWin(finishedMs);
    return {
      ...session,
      faces,
      selected: null,
      hint: null,
      history,
      moves: session.moves + 1,
      startedAtMs,
      finishedMs,
      status: "won",
      best: record.best,
      improved: record.improved,
    };
  }

  return {
    ...session,
    faces,
    selected: null,
    hint: null,
    history,
    moves: session.moves + 1,
    startedAtMs,
  };
}

export function applyUndo(session: Session): Session {
  if (session.history.length === 0) return session;
  const history = session.history.slice();
  const last = history.pop();
  if (last === undefined) return session;
  const faces = session.faces.slice();
  faces[last.a] = last.faceA;
  faces[last.b] = last.faceB;
  return {
    ...session,
    faces,
    history,
    selected: null,
    hint: null,
    moves: Math.max(0, session.moves - 1),
    status: "playing",
    finishedMs: null,
    improved: [],
  };
}

export function applyHint(session: Session): Session {
  if (session.status === "won") return session;
  const hint = findHint(presentSet(session.faces), session.faces);
  if (hint === null) return { ...session, hint: null };
  return { ...session, hint, hintsUsed: session.hintsUsed + 1, selected: null };
}

export function clearHint(session: Session): Session {
  return session.hint === null ? session : { ...session, hint: null };
}

export function applyReshuffle(session: Session): Session {
  if (session.status === "won" || session.reshufflesLeft <= 0) return session;
  const present = presentSet(session.faces);
  const result = reshuffleRemaining(present, session.faces, `${session.seed}~rs${session.reshufflesLeft}`);
  if (result === null) return session;
  return {
    ...session,
    faces: result.faces,
    selected: null,
    hint: null,
    reshufflesLeft: session.reshufflesLeft - 1,
  };
}

// ---- derived views for the HUD ----

export function remainingTiles(session: Session): number {
  return session.faces.reduce((n, f) => (f !== null ? n + 1 : n), 0);
}

export function remainingPairs(session: Session): number {
  return remainingTiles(session) / 2;
}

export function freeMatchPairs(session: Session): number {
  return findFreePairs(presentSet(session.faces), session.faces).length;
}

export function freeTileCount(session: Session): number {
  return freeSlots(presentSet(session.faces)).length;
}

export function isStuck(session: Session): boolean {
  if (session.status !== "playing") return false;
  if (remainingTiles(session) === 0) return false;
  return findHint(presentSet(session.faces), session.faces) === null;
}

export function tileStates(session: Session): ReadonlyArray<TileState | null> {
  const present = presentSet(session.faces);
  const out: Array<TileState | null> = new Array<TileState | null>(SLOT_COUNT).fill(null);
  for (let i = 0; i < session.faces.length; i += 1) {
    if (session.faces[i] === null) continue;
    out[i] = isFree(i, present) ? "free" : "blocked";
  }
  if (session.hint !== null) {
    out[session.hint[0]] = "hinted";
    out[session.hint[1]] = "hinted";
  }
  if (session.selected !== null) out[session.selected] = "selected";
  return out;
}
