import {
  autoStep,
  canAutoComplete,
  deal,
  drawStock,
  moveCard,
  smartMove,
  type CardSource,
  type DrawMode,
  type KlondikeState,
  type MoveTarget,
} from "./klondike/engine";
import { currentBests, recordWin, type BestSnapshot } from "./records";

export const STORE_KEY = "klondike";
export type SeedSource = "daily" | "seed" | "random";

const HISTORY_LIMIT = 600;

export interface KlondikeSession {
  state: KlondikeState;
  history: KlondikeState[];
  seed: string;
  seedSource: SeedSource;
  startedAtMs: number | null;
  finishedMs: number | null;
  bests: BestSnapshot;
  improved: string[];
}

export function newSession(seed: string, seedSource: SeedSource, drawMode: DrawMode): KlondikeSession {
  return {
    state: deal(seed, drawMode),
    history: [],
    seed,
    seedSource,
    startedAtMs: null,
    finishedMs: null,
    bests: currentBests(drawMode),
    improved: [],
  };
}

function advance(session: KlondikeSession, next: KlondikeState | null): KlondikeSession {
  if (next === null) return session;
  const startedAtMs = session.startedAtMs ?? Date.now();
  let finishedMs = session.finishedMs;
  let bests = session.bests;
  let improved = session.improved;
  if (next.won && finishedMs === null) {
    finishedMs = Math.max(0, Date.now() - startedAtMs);
    improved = recordWin(next.drawMode, finishedMs, next.moves).improved;
    bests = currentBests(next.drawMode);
  }
  const history = [...session.history, session.state];
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
  return { ...session, state: next, history, startedAtMs, finishedMs, bests, improved };
}

export function applyDraw(session: KlondikeSession): KlondikeSession {
  return advance(session, drawStock(session.state));
}

export function applySmart(session: KlondikeSession, source: CardSource): KlondikeSession {
  return advance(session, smartMove(session.state, source));
}

export function applyMoveCard(
  session: KlondikeSession,
  source: CardSource,
  target: MoveTarget,
): KlondikeSession {
  return advance(session, moveCard(session.state, source, target));
}

export function applyAutoStep(session: KlondikeSession): KlondikeSession {
  return advance(session, autoStep(session.state));
}

export function applyUndo(session: KlondikeSession): KlondikeSession {
  if (session.history.length === 0 || session.state.won) return session;
  const prev = session.history[session.history.length - 1];
  return { ...session, state: prev, history: session.history.slice(0, -1) };
}

export { canAutoComplete };
