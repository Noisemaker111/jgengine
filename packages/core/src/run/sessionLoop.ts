import { pickWeighted } from "../random/pick";
import { seededRng } from "../random/rng";

/** Where a session stands: not opened yet, in progress, or closed at its boundary. */
export type SessionPhase = "idle" | "open" | "closed";

/**
 * One option the next session may open with. `T` is the game's own payload (a tighter rival line, an
 * unlocked part, a shorter route) - the loop only draws and remembers which id was drawn.
 */
export interface SessionOfferOption<T> {
  id: string;
  value: T;
  /** Relative draw weight (default `1`); a non-positive weight is never drawn. */
  weight?: number;
  /** Sessions that must close before this option can be drawn (default `0`). */
  after?: number;
}

/** The option a session opens with, and which session it is. */
export interface SessionOffer<T> {
  /** 1-based session number: `1` is the first session, before any boundary has closed. */
  session: number;
  optionId: string | null;
  option: T | null;
}

/** One option the next session could open with, in the shape a choice screen shows. */
export interface SessionChoice<T> {
  id: string;
  value: T;
}

/** The session closing, handed to a game's own `settle`. */
export interface SettlingSession<I = void> {
  /** 1-based number of the session closing. */
  session: number;
  /** The quantity the session carried to its boundary; `0` when the game carries nothing. */
  carried: number;
  /** The game's own reason for closing, passed to `settle`. */
  input: I;
}

/** What closing one session did, and what the next session opens with. */
export interface SessionSettlement<R = void, T = never> {
  /** The session that closed. */
  session: number;
  /** The quantity it carried to its boundary. */
  carried: number;
  /** Sessions closed so far. */
  closed: number;
  /** What the game's `settle` returned. */
  result: R;
  /** The option the next session opens with. */
  next: SessionOffer<T>;
}

/** What the loop reports about the session it is playing, for a capture or devtools read. */
export interface SessionReadout {
  /** The session in progress, or the last one started when none is open. */
  session: number;
  phase: SessionPhase;
  /** What a session is in this game, or `null` when the game did not say. */
  kind: string | null;
  /** What the session in progress carries. */
  carried: number;
  closed: number;
  /** The option the session in progress opened with, or the one the next session is offered. */
  offered: string | null;
}

/** Read-only handle a capture or devtools uses to prove a session loop is live, not merely imported. */
export interface SessionProbe {
  read(): SessionReadout;
}

/** Everything a session loop stores as plain JSON. */
export interface SessionLoopState {
  /** The session in progress, or the last one started; `0` before the first `start`. */
  session: number;
  /** Sessions whose boundary has closed; also the number `after` gates are read against. */
  closed: number;
  /** The quantity the session in progress carries. */
  carried: number;
  /** The option the session in progress opened with, or the one the next session opens with. */
  optionId: string | null;
}

/**
 * Where a loop keeps what a live session carries, so a reload mid-session does not silently lose it.
 * `load` runs once when the loop is created; `save` runs on each state change that a player can see -
 * a carried amount (`every` carries between writes, default every one) and every open, adopt or close.
 */
export interface SessionLoopPersistence {
  /** The state a previous boot wrote, or `null` when this is a new career. */
  load?: () => SessionLoopState | null;
  /** Write the loop's own state; a throw is ignored so a full disk cannot stop play. */
  save: (state: SessionLoopState) => void;
  /** Carries between writes (default `1`). Pass a higher number when a session carries every tick. */
  every?: number;
}

/** Configuration for {@link createSessionLoop}. */
export interface SessionLoopConfig<T = never, I = void, R = void> {
  /** What a session is, for the readout: `"day"`, `"shift"`, `"wave"`. */
  kind?: string;
  /** Whether a session carries a quantity (default `true`); `false` makes {@link SessionLoop.carry} inert. */
  carries?: boolean;
  /**
   * What the boundary does with what the session carried: the game's own rule, so bank, lose, keep and
   * nothing are all one callback. Omitted means closing a session only closes it.
   */
  settle?: (session: SettlingSession<I>) => R;
  /** Authored options the next session may open with. Omitted means sessions never open with one. */
  offers?: readonly SessionOfferOption<T>[];
  /** Seed for the option draw (default `"session"`): the same seed and history replay the same sequence. */
  seed?: string | number;
  /**
   * Keep the session's live state durable. Without it the loop only holds state in memory, and a
   * reload loses what the session carried until the game writes a snapshot itself.
   */
  persist?: SessionLoopPersistence;
}

/**
 * One session's lifecycle: open it, carry a quantity, close it at its boundary, and optionally open
 * the next one with an option the game authored.
 */
export interface SessionLoop<T = never, I = void, R = void> {
  /** What a session is in this game, or `null` when the game did not say. */
  kind(): string | null;
  /** Open the next session and hand back its offer. Calling it on an open session returns that session's offer and keeps what it carries. */
  start(): SessionOffer<T>;
  /** Add to what the session in progress carries; negative or non-finite amounts are ignored. Returns what it carries. */
  carry(amount: number): number;
  /** What the session in progress carries. */
  carried(): number;
  /** Whether no session has opened, one is open, or the last one closed. */
  phase(): SessionPhase;
  /** The open session's offer, or the offer the next `start` would open with. */
  offer(): SessionOffer<T>;
  /**
   * Up to `count` distinct options the next session could open with, drawn weighted and in draw order,
   * so a game can offer a choice instead of the single option {@link SessionOffer} names. `choose` takes one.
   */
  present(count: number): SessionChoice<T>[];
  /**
   * Open the next session around `optionId` (or around no option for `null`), which is how a presented
   * choice becomes the option the session carries. Returns false for an id this loop's table does not
   * carry, leaving the offer untouched.
   */
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
    try {
      config.persist.save(stateNow());
    } catch {
      // A save that fails must not end the session; the next carry tries again.
    }
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

const SESSION_PROBE_KEY = "__jgengineRun";

type SessionProbeGlobal = typeof globalThis & { [SESSION_PROBE_KEY]?: SessionProbe };

/**
 * Publish the loop's own readout on `window.__jgengineRun`, so a capture or devtools probe can state
 * which session is live, its phase, what it carries and the option it offers. Reads only; it never
 * starts, closes or changes a session. Returns the uninstaller.
 *
 * @capability session-loop open and close a game session, settle the quantity it carried and optionally draw the next session's authored option
 */
export function installSessionProbe<T, I, R>(loop: SessionLoop<T, I, R>): () => void {
  const scope = globalThis as SessionProbeGlobal;
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
  scope[SESSION_PROBE_KEY] = probe;
  return () => {
    if (scope[SESSION_PROBE_KEY] === probe) delete scope[SESSION_PROBE_KEY];
  };
}
