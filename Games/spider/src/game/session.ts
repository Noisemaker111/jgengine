import {
  canDeal,
  dealFromStock,
  deal,
  moveCard,
  smartMove,
  type CardSource,
  type MoveTarget,
  type SpiderState,
  type SuitCount,
} from "./spider/engine";
import { currentBests, recordWin, type BestSnapshot } from "./records";

export const STORE_KEY = "spider";
export type SeedSource = "daily" | "seed" | "random";

const HISTORY_LIMIT = 1000;

export interface SpiderSession {
  state: SpiderState;
  history: SpiderState[];
  seed: string;
  seedSource: SeedSource;
  startedAtMs: number | null;
  finishedMs: number | null;
  bests: BestSnapshot;
  improved: string[];
}

export function newSession(seed: string, seedSource: SeedSource, suits: SuitCount): SpiderSession {
  return {
    state: deal(seed, suits),
    history: [],
    seed,
    seedSource,
    startedAtMs: null,
    finishedMs: null,
    bests: currentBests(suits),
    improved: [],
  };
}

function advance(session: SpiderSession, next: SpiderState | null): SpiderSession {
  if (next === null) return session;
  const startedAtMs = session.startedAtMs ?? Date.now();
  let finishedMs = session.finishedMs;
  let bests = session.bests;
  let improved = session.improved;
  if (next.won && finishedMs === null) {
    finishedMs = Math.max(0, Date.now() - startedAtMs);
    improved = recordWin(next.suits, next.score, finishedMs).improved;
    bests = currentBests(next.suits);
  }
  const history = [...session.history, session.state];
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
  return { ...session, state: next, history, startedAtMs, finishedMs, bests, improved };
}

export function applyDeal(session: SpiderSession): SpiderSession {
  return advance(session, dealFromStock(session.state));
}

export function applySmart(session: SpiderSession, source: CardSource): SpiderSession {
  return advance(session, smartMove(session.state, source));
}

export function applyMoveCard(
  session: SpiderSession,
  source: CardSource,
  target: MoveTarget,
): SpiderSession {
  return advance(session, moveCard(session.state, source, target));
}

export function applyUndo(session: SpiderSession): SpiderSession {
  if (session.history.length === 0 || session.state.won) return session;
  const prev = session.history[session.history.length - 1];
  return { ...session, state: prev, history: session.history.slice(0, -1) };
}

export { canDeal };
