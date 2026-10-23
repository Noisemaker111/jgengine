import { pickWeighted } from "../random/pick";
import { seededRng } from "../random/rng";

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
   * Close the run in progress: bank the haul scaled by `multiplier`, or lose it. Throws when no run
   * is open, so a double settle cannot bank the same haul twice.
   */
  settle(outcome: RunOutcome, multiplier?: number): RunSettlement<T>;
  snapshot(): RunLoopState;
  restore(next: RunLoopState): void;
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
 * it is the only one eligible, weighted by `weight`. The draw is `seededRng(seed:run:N)`, so the same
 * seed and the same run history give the same sequence, before or after a save/load.
 *
 * @capability run-loop bank or lose what a run carries, with one deterministic change per run
 */
export function createRunLoop<T>(config: RunLoopConfig<T>): RunLoop<T> {
  const table = config.changes ?? [];
  const known = new Set<string>();
  for (const change of table) {
    if (known.has(change.id)) throw new Error(`run change "${change.id}" is declared twice`);
    known.add(change.id);
  }

  let run = 0;
  let completed = 0;
  let haul = 0;
  let changeId: string | null = null;
  let bankedTotal = 0;
  let lostTotal = 0;
  let bestHaul = 0;

  function drawFor(index: number, previous: string | null): RunOffer<T> {
    const eligible = table.filter((change) => (change.after ?? 0) <= index - 1);
    const fresh = eligible.filter((change) => change.id !== previous);
    // A one-entry table still offers its change rather than nothing.
    const pool = fresh.length > 0 ? fresh : eligible;
    const rng = seededRng(`${config.seed}:run:${index}`);
    const drawn = pickWeighted(rng, pool, (change) => change.weight ?? 1) ?? null;
    return { run: index, changeId: drawn?.id ?? null, change: drawn?.value ?? null };
  }

  function offer(): RunOffer<T> {
    // An open run's change was adopted at `start`, so the offer repeats it instead of redrawing.
    if (run > completed) {
      const adopted = table.find((change) => change.id === changeId);
      return { run, changeId, change: adopted?.value ?? null };
    }
    return drawFor(completed + 1, changeId);
  }

  return {
    start() {
      if (run > completed) return offer();
      const next = offer();
      run = next.run;
      haul = 0;
      changeId = next.changeId;
      return next;
    },
    carry(amount) {
      haul += positive(amount);
      return haul;
    },
    haul: () => haul,
    offer,
    settle(outcome, multiplier) {
      if (run <= completed) throw new Error("run loop: no run is open to settle");
      const settledHaul = haul;
      const scale = Number.isFinite(multiplier) ? Math.max(0, multiplier ?? 1) : 1;
      const banked = outcome === "banked" ? Math.round(settledHaul * scale) : 0;
      const lost = outcome === "lost" ? settledHaul : 0;
      bankedTotal += banked;
      lostTotal += lost;
      bestHaul = Math.max(bestHaul, banked);
      completed = run;
      haul = 0;
      return { outcome, haul: settledHaul, banked, lost, completed, bestHaul, next: drawFor(completed + 1, changeId) };
    },
    snapshot: () => ({ run, completed, haul, changeId, bankedTotal, lostTotal, bestHaul }),
    restore(next) {
      run = Math.max(0, Math.floor(next.run));
      completed = Math.max(0, Math.floor(next.completed));
      if (run < completed) run = completed;
      haul = positive(next.haul);
      changeId = next.changeId !== null && known.has(next.changeId) ? next.changeId : null;
      bankedTotal = positive(next.bankedTotal);
      lostTotal = positive(next.lostTotal);
      bestHaul = positive(next.bestHaul);
    },
  };
}
