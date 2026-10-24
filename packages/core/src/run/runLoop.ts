import { createSessionLoop, type SessionOffer } from "./sessionLoop";

/** How a run ended: what it carried reached the bank, or it was lost. */
export type RunOutcome = "banked" | "lost";

/**
 * One change the next run can open with. `T` is the game's own payload (a tighter rival line, an
 * unlocked part, a route modifier) - the loop only draws and remembers which id was drawn.
 */
export interface RunChange<T> {
  id: string;
  value: T;
  /** Relative draw weight (default `1`); a non-positive weight is never drawn. */
  weight?: number;
  /** Completed runs this change needs before it can be drawn (default `0`). */
  after?: number;
}

/** The change a run opens with, and which run it is. */
export interface RunOffer<T> {
  /** 1-based run number: `1` is the first run, before anything has been banked. */
  run: number;
  changeId: string | null;
  change: T | null;
}

/** One change a run could open with, in the shape a choice screen shows: the id and its payload. */
export interface RunChoice<T> {
  id: string;
  change: T;
}

/** What the loop reports about the run it is playing, for a capture or devtools read. */
export interface RunReadout {
  /** The run in progress, or the last settled run when none is open. */
  run: number;
  /** What the run in progress carries and can still lose. */
  carried: number;
  banked: number;
  lost: number;
  /** The best single bank across the career. */
  best: number;
  /** The change the run in progress opened with, or the one the next run is offered. */
  offered: string | null;
}

/** Read-only handle a capture or devtools uses to prove a run loop is live, not merely imported. */
export interface RunProbe {
  read(): RunReadout;
}

/** Everything a run loop stores as plain JSON: the run in progress plus lifetime totals. */
export interface RunLoopState {
  /** The run in progress, or `0` before the first `start`. */
  run: number;
  /** Runs settled so far; also the number `after` gates are read against. */
  completed: number;
  /** What the run in progress carries and can still lose. */
  haul: number;
  /** Change drawn for the run in progress, or `null`. */
  changeId: string | null;
  bankedTotal: number;
  lostTotal: number;
  bestHaul: number;
}

/** What one closed run banked or lost, and what the next run changes. */
export interface RunSettlement<T> {
  outcome: RunOutcome;
  /** What the run carried before the multiplier. */
  haul: number;
  /** What reached the bank: the haul after the line multiplier on a bank, `0` on a loss. */
  banked: number;
  /** What the run lost: the whole haul on a loss, `0` on a bank. */
  lost: number;
  completed: number;
  bestHaul: number;
  /** The next run's change, drawn here so a results screen can name it. */
  next: RunOffer<T>;
}

/** Configuration for {@link createRunLoop}. */
export interface RunLoopConfig<T> {
  /** Seed for the run-to-run draw: the same seed and history replay the same sequence. */
  seed: string | number;
  /** Authored table of next-run changes; omit a table for a loop that never varies. */
  changes?: readonly RunChange<T>[];
  /**
   * Keep the live run durable, so a reload mid-run restores the haul instead of losing it.
   * The hook carries {@link RunLoopState}; it is passed through to the composed session loop.
   */
  persist?: {
    load?: () => RunLoopState | null;
    save: (state: RunLoopState) => void;
    every?: number;
  };
}

/**
 * A run's lifecycle: what it carries and can lose, and the change it hands the next run.
 */
export interface RunLoop<T> {
  /** Open the next run and hand back its offer. Calling it on an open run returns that run's offer and keeps its haul. */
  start(): RunOffer<T>;
  /** Add to what the run in progress carries; negative or non-finite amounts are ignored. Returns the haul. */
  carry(amount: number): number;
  /** What the run in progress carries. */
  haul(): number;
  /** The run in progress's offer, or the offer the next `start` would open. */
  offer(): RunOffer<T>;
  /**
   * Up to `count` distinct changes the next run could open with, drawn weighted and in draw order,
   * so a game can offer a choice instead of the single change {@link RunOffer} names. `choose` takes one.
   */
  present(count: number): RunChoice<T>[];
  /**
   * Open the next run around `changeId` (or around no change for `null`), which is how a presented
   * choice becomes the change the run carries. Returns false for an id this loop's table does not
   * carry, leaving the offer untouched.
   */
  choose(changeId: string | null): boolean;
  /**
   * Close the run in progress: bank the haul scaled by `multiplier`, or lose it. Throws when no run
   * is open, so a double settle cannot bank the same haul twice.
   */
  settle(outcome: RunOutcome, multiplier?: number): RunSettlement<T>;
  snapshot(): RunLoopState;
  restore(next: RunLoopState): void;
}

interface RunBoundary {
  outcome: RunOutcome;
  multiplier?: number;
}

interface RunBank {
  banked: number;
  lost: number;
}

function positive(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Bank-or-lose between runs, with one deterministic change per run drawn from an authored table.
 *
 * A run's haul banks when it ends in a bank and is lost when it ends in a loss; the money itself stays
 * with the game (pair it with `progression/careerBank`). After each settled run the loop draws the next
 * run's change from `changes`: eligible when `after <= completed`, never the change just played unless
 * it is the only one eligible, weighted by `weight`. The draw is seeded, so the same seed and the same
 * run history give the same sequence, before or after a save/load. `present(count)` draws several of
 * those changes for a choice screen and `choose(id)` adopts the pick as the next run's change.
 *
 * This is a composition of `createSessionLoop` (`run/sessionLoop`): the session loop owns opening,
 * carrying, closing and restoring, and this module supplies the two things that make it a roguelike -
 * a `settle` that banks or loses the haul, and a change table the next run can open with.
 *
 * @deprecated Bank-or-lose and a per-run change table are one game type's rules, not the engine's.
 * Compose `createSessionLoop` with your own `settle` and `offers` instead. Kept unchanged for the two
 * adopters (Beacon Bastion, Drift Foundry) that pin 0.37.0. Removal path: delete this module one minor
 * release after both compose `createSessionLoop` directly.
 *
 * @capability run-loop deprecated roguelike composition of session-loop - bank or lose what a run carries, with one deterministic change per run
 */
export function createRunLoop<T>(config: RunLoopConfig<T>): RunLoop<T> {
  let bankedTotal = 0;
  let lostTotal = 0;
  let bestHaul = 0;

  const loop = createSessionLoop<T, RunBoundary, RunBank>({
    kind: "run",
    seed: config.seed,
    offers: config.changes,
    ...(config.persist === undefined
      ? {}
      : {
          persist: {
            every: config.persist.every,
            save: (state) => {
              config.persist!.save({
                run: state.session,
                completed: state.closed,
                haul: state.carried,
                changeId: state.optionId,
                // Lifetime totals live with the run task, not the session loop; carry the ones this
                // closure already knows so a written state is complete for a reader on the next boot.
                bankedTotal,
                lostTotal,
                bestHaul,
              });
            },
          },
        }),
    settle: ({ carried, input }) => {
      const scale = Number.isFinite(input.multiplier) ? Math.max(0, input.multiplier ?? 1) : 1;
      const banked = input.outcome === "banked" ? Math.round(carried * scale) : 0;
      const lost = input.outcome === "lost" ? carried : 0;
      bankedTotal += banked;
      lostTotal += lost;
      bestHaul = Math.max(bestHaul, banked);
      return { banked, lost };
    },
  });

  const offerOf = (offer: SessionOffer<T>): RunOffer<T> => ({
    run: offer.session,
    changeId: offer.optionId,
    change: offer.option,
  });

  const api: RunLoop<T> = {
    start: () => offerOf(loop.start()),
    carry: (amount) => loop.carry(amount),
    haul: () => loop.carried(),
    offer: () => offerOf(loop.offer()),
    present: (count) => loop.present(count).map((choice) => ({ id: choice.id, change: choice.value })),
    choose: (changeId) => loop.choose(changeId),
    settle(outcome, multiplier) {
      if (loop.phase() !== "open") throw new Error("run loop: no run is open to settle");
      const settlement = loop.settle({ outcome, multiplier });
      return {
        outcome,
        haul: settlement.carried,
        banked: settlement.result.banked,
        lost: settlement.result.lost,
        completed: settlement.closed,
        bestHaul,
        next: offerOf(settlement.next),
      };
    },
    snapshot() {
      const state = loop.snapshot();
      return {
        run: state.session,
        completed: state.closed,
        haul: state.carried,
        changeId: state.optionId,
        bankedTotal,
        lostTotal,
        bestHaul,
      };
    },
    restore(next) {
      loop.restore({ session: next.run, closed: next.completed, carried: next.haul, optionId: next.changeId });
      bankedTotal = positive(next.bankedTotal);
      lostTotal = positive(next.lostTotal);
      bestHaul = positive(next.bestHaul);
    },
  };

  const restored = config.persist?.load?.();
  if (restored !== null && restored !== undefined) api.restore(restored);
  return api;
}

const RUN_PROBE_KEY = "__jgengineRun";

type RunProbeGlobal = typeof globalThis & { [RUN_PROBE_KEY]?: RunProbe };

/**
 * Publish the loop's own readout on `window.__jgengineRun`, so a capture or devtools probe can state
 * the live run, what it carries, what it banked or lost and the change it offers. Reads only; it never
 * starts, settles or changes a run. Returns the uninstaller.
 *
 * @deprecated Ships with {@link createRunLoop}; compose `installSessionProbe` from `run/sessionLoop`
 * when you compose the session loop directly.
 *
 * @capability run-loop deprecated roguelike composition of session-loop - bank or lose what a run carries, with one deterministic change per run
 */
export function installRunProbe<T>(loop: RunLoop<T>): () => void {
  const scope = globalThis as RunProbeGlobal;
  const probe: RunProbe = {
    read() {
      const state = loop.snapshot();
      return {
        run: state.run,
        carried: state.haul,
        banked: state.bankedTotal,
        lost: state.lostTotal,
        best: state.bestHaul,
        offered: loop.offer().changeId,
      };
    },
  };
  scope[RUN_PROBE_KEY] = probe;
  return () => {
    if (scope[RUN_PROBE_KEY] === probe) delete scope[RUN_PROBE_KEY];
  };
}
