/**
 * A long build split into slices, so the thread that runs it can answer input between them. The
 * job is a generator that `yield`s wherever it is safe to pause; the runner keeps calling it until
 * a slice has used its budget, then hands the thread back before the next slice.
 */
export type SlicedJob<T> = Generator<void, T, void>;

/** Options for {@link runSliced}; the clock and the yield are injectable for tests. */
export interface SlicedWorkOptions {
  /** Work per slice before the thread is handed back. Default 8 ms, half a 60 Hz frame. */
  budgetMs?: number;
  now?: () => number;
  /** Hands the thread back; resolves when the next slice may run. Default: a zero-delay timer. */
  yieldThread?: () => Promise<void>;
}

/** A sliced job in flight. */
export interface SlicedRun<T> {
  /** Resolves with the job's result; rejects with what the job threw, or when cancelled. */
  done: Promise<T>;
  /** Stop before the next slice; `done` rejects with a {@link SlicedWorkCancelled}. */
  cancel(): void;
}

/** What a cancelled run rejects with, so a caller can tell it from a failure. */
export class SlicedWorkCancelled extends Error {
  constructor() {
    super("sliced work cancelled");
    this.name = "SlicedWorkCancelled";
  }
}

const DEFAULT_BUDGET_MS = 8;

const defaultNow = (): number => (typeof performance === "undefined" ? Date.now() : performance.now());
const defaultYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Run a job in slices of at most `budgetMs`, yielding the thread between slices.
 *
 * @internal
 */
export function runSliced<T>(job: SlicedJob<T>, options: SlicedWorkOptions = {}): SlicedRun<T> {
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const now = options.now ?? defaultNow;
  const yieldThread = options.yieldThread ?? defaultYield;
  let cancelled = false;
  const done = (async (): Promise<T> => {
    for (;;) {
      if (cancelled) throw new SlicedWorkCancelled();
      const sliceEnds = now() + budgetMs;
      for (;;) {
        const step = job.next();
        if (step.done === true) return step.value;
        if (now() >= sliceEnds) break;
      }
      await yieldThread();
    }
  })();
  return {
    done,
    cancel: () => {
      cancelled = true;
    },
  };
}

/** Run a job to the end on the spot, for callers that need the value now (tests, tools, SSR). */
export function runToEnd<T>(job: SlicedJob<T>): T {
  for (;;) {
    const step = job.next();
    if (step.done === true) return step.value;
  }
}
