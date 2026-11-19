// @skill jgengine-gameplay
import { pickWeighted } from "../random/pick";
import { seededRng } from "../random/rng";
import { publishReadout } from "../runtime/pageHandle";

export type SessionPhase = "idle" | "open" | "closed";

export interface SessionOfferOption<T> {
  id: string;
  value: T;
  /** Relative draw weight (default `1`); a non-positive weight is never drawn. */
  weight?: number;
  /** Sessions that must close before this option can be drawn (default `0`). */
  after?: number;
}

export interface SessionOffer<T> {
  /** 1-based session number: `1` is the first session, before any boundary has closed. */
  session: number;
  optionId: string | null;
  option: T | null;
}

export interface SessionChoice<T> {
  id: string;
  value: T;
}

export interface SettlingSession<I = void> {
  /** 1-based number of the session closing. */
  session: number;
  carried: number;
  input: I;
}

export interface SessionSettlement<R = void, T = never> {
  session: number;
  carried: number;
  closed: number;
  result: R;
  next: SessionOffer<T>;
}

export interface SessionReadout {
  session: number;
  phase: SessionPhase;
  kind: string | null;
  carried: number;
  closed: number;
  offered: string | null;
}

/** Read-only handle a capture or devtools uses to prove a session loop is live, not merely imported. */
export interface SessionProbe {
  read(): SessionReadout;
}

export interface SessionLoopState {
  /** The session in progress, or the last one started; `0` before the first `start`. */
  session: number;
  closed: number;
  carried: number;
  optionId: string | null;
}

/**
 * Where a loop keeps what a live session carries, so a reload mid-session does not silently lose it.
 * `load` runs once when the loop is created; `save` runs on each state change that a player can see -
 * a carried amount (`every` carries between writes, default every one) and every open, adopt or close.
 */
export interface SessionLoopPersistence {
  load?: () => SessionLoopState | null;
  /** Write the loop's own state. A throw reaches the carry that asked for it, so a failed write is never mistaken for a kept one. */
  save: (state: SessionLoopState) => void;
  every?: number;
}

export interface SessionLoopConfig<T = never, I = void, R = void> {
  kind?: string;
  carries?: boolean;
  settle?: (session: SettlingSession<I>) => R;
  /** Authored options the next session may open with. Omitted means sessions never open with one. */
  offers?: readonly SessionOfferOption<T>[];
  seed?: string | number;
  /**
   * Keep the session's live state durable. Without it the loop only holds state in memory, and a
   * reload loses what the session carried until the game writes a snapshot itself.
   */
  persist?: SessionLoopPersistence;
}

export interface SessionLoop<T = never, I = void, R = void> {
  kind(): string | null;
  start(): SessionOffer<T>;
  carry(amount: number): number;
  carried(): number;
  phase(): SessionPhase;
  offer(): SessionOffer<T>;
  /**
   * Up to `count` distinct options the next session could open with, drawn weighted and in draw order,
   * so a game can offer a choice instead of the single option {@link SessionOffer} names. `choose` takes one.
   */
  present(count: number): SessionChoice<T>[];
  choose(optionId: string | null): boolean;
  /**
   * Close the session in progress and hand what it carried to the game's `settle` rule. Throws when no
   * session is open, so a double close cannot settle the same quantity twice.
   */
  settle(input?: I): SessionSettlement<R, T>;
  snapshot(): SessionLoopState;
  restore(next: SessionLoopState): void;
}

function positive(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * The shared shape of a game session, with the game's own rules supplied as config: a session opens,
 * it may carry a quantity, its boundary closes it, and the game's `settle` callback decides what
 * happens to what it carried. A park day, a night shift and a wave are the same base with a different
 * `settle`, a different `kind` and, where nothing is at stake, `carries: false`.
 *
 * `offers` is optional and defaults to nothing, so a game whose sessions never differ says nothing:
 * sessions open plain. A game that wants its next session to open with an authored change supplies the
 * table and gets the same draw rules everywhere - eligible when `after <= closed`, never the option
 * just played unless it is the only one eligible, weighted by `weight`, drawn as
 * `seededRng(seed:offer:N)` so the same seed and history replay the same sequence before or after a
 * save/load. `present(count)` draws several for a choice screen and `choose(id)` adopts the pick.
 *
 * @capability session-loop open and close a game session, settle the quantity it carried and optionally draw the next session's authored option
 */
export function createSessionLoop<T = never, I = void, R = void>(
  config: SessionLoopConfig<T, I, R> = {},
): SessionLoop<T, I, R> {
  const table = config.offers ?? [];
  const carries = config.carries !== false;
  const seed = config.seed ?? "session";
  const known = new Set<string>();
  for (const option of table) {
    if (known.has(option.id)) throw new Error(`session option "${option.id}" is declared twice`);
    known.add(option.id);
  }

  let session = 0;
  let closed = 0;
  let carried = 0;
  let optionId: string | null = null;

  const isOpen = (): boolean => session > closed;

  const every = config.persist === undefined ? 0 : Math.max(1, Math.floor(config.persist.every ?? 1));
  let carriesSinceWrite = 0;

  function stateNow(): SessionLoopState {
    return { session, closed, carried, optionId };
  }

  function persistNow(): void {
    if (config.persist === undefined) return;
    carriesSinceWrite = 0;
    config.persist.save(stateNow());
  }

  function poolFor(index: number, previous: string | null): SessionOfferOption<T>[] {
    const eligible = table.filter((option) => (option.after ?? 0) <= index - 1);
    const fresh = eligible.filter((option) => option.id !== previous);
    // A one-entry table still offers its option rather than nothing.
    return fresh.length > 0 ? fresh : eligible;
  }

  function drawFor(index: number, previous: string | null): SessionOffer<T> {
    const rng = seededRng(`${seed}:offer:${index}`);
    const drawn = pickWeighted(rng, poolFor(index, previous), (option) => option.weight ?? 1) ?? null;
    return { session: index, optionId: drawn?.id ?? null, option: drawn?.value ?? null };
  }

  function offer(): SessionOffer<T> {
    // An open session's option was adopted at `start` or `choose`, so the offer repeats it instead of redrawing.
    if (isOpen()) {
      const adopted = table.find((option) => option.id === optionId);
      return { session, optionId, option: adopted?.value ?? null };
    }
    return drawFor(closed + 1, optionId);
  }

  const loop: SessionLoop<T, I, R> = {
    kind: () => config.kind ?? null,
    start() {
      if (isOpen()) return offer();
      const next = offer();
      session = next.session;
      carried = 0;
      optionId = next.optionId;
      persistNow();
      return next;
    },
    carry(amount) {
      if (carries) carried += positive(amount);
      if (every > 0) {
        carriesSinceWrite += 1;
        if (carriesSinceWrite >= every) persistNow();
      }
      return carried;
    },
    carried: () => carried,
    phase: () => (session === 0 && closed === 0 ? "idle" : isOpen() ? "open" : "closed"),
    offer,
    present(wanted) {
      const index = isOpen() ? session : closed + 1;
      const remaining = poolFor(index, optionId);
      const drawn: SessionChoice<T>[] = [];
      const take = Number.isFinite(wanted) ? Math.max(0, Math.floor(wanted)) : 0;
      const rng = seededRng(`${seed}:present:${index}`);
      while (drawn.length < take && remaining.length > 0) {
        const picked = pickWeighted(rng, remaining, (option) => option.weight ?? 1);
        if (picked === undefined) break;
        drawn.push({ id: picked.id, value: picked.value });
        remaining.splice(remaining.indexOf(picked), 1);
      }
      return drawn;
    },
    choose(nextOptionId) {
      if (nextOptionId !== null && !known.has(nextOptionId)) return false;
      // A closed loop has no session to adopt the pick, so the pick opens the next one.
      if (!isOpen()) {
        session = closed + 1;
        carried = 0;
      }
      optionId = nextOptionId;
      persistNow();
      return true;
    },
    settle(input) {
      if (!isOpen()) throw new Error("session loop: no session is open to settle");
      const settling: SettlingSession<I> = { session, carried, input: input as I };
      const result = config.settle === undefined ? (undefined as R) : config.settle(settling);
      closed = session;
      carried = 0;
      persistNow();
      return { session: settling.session, carried: settling.carried, closed, result, next: drawFor(closed + 1, optionId) };
    },
    snapshot: () => ({ session, closed, carried, optionId }),
    restore(next) {
      session = count(next.session);
      closed = count(next.closed);
      if (session < closed) session = closed;
      carried = carries ? positive(next.carried) : 0;
      optionId = next.optionId !== null && known.has(next.optionId) ? next.optionId : null;
    },
  };

  const saved = config.persist?.load?.();
  if (saved !== null && saved !== undefined) loop.restore(saved);
  return loop;
}

declare module "../runtime/pageHandle" {
  interface JgPage {
    run?: SessionProbe;
  }
}

/**
 * Publish the loop's own readout on `window.__jg.run`, so a capture or devtools probe can state
 * which session is live, its phase, what it carries and the option it offers. Reads only; it never
 * starts, closes or changes a session. Returns the uninstaller.
 *
 * @capability session-loop open and close a game session, settle the quantity it carried and optionally draw the next session's authored option
 */
export function installSessionProbe<T, I, R>(loop: SessionLoop<T, I, R>): () => void {
  const probe: SessionProbe = {
    read() {
      const state = loop.snapshot();
      return {
        session: state.session,
        phase: loop.phase(),
        kind: loop.kind(),
        carried: state.carried,
        closed: state.closed,
        offered: loop.offer().optionId,
      };
    },
  };
  return publishReadout("run", probe);
}
