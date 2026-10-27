/**
 * Timers a test fires by hand, for `createHostRouter({ scheduleTimer })`. A test that waits out a
 * real grace window races the machine: under load the window closes before the reconnect lands.
 * @internal
 */
export function manualTimers(): {
  scheduleTimer: (run: () => void, ms: number) => () => void;
  /** The delay of every timer still waiting, in the order they were set. */
  pending(): number[];
  /** Run every timer still waiting. */
  fire(): void;
} {
  const waiting = new Set<{ run: () => void; ms: number }>();
  return {
    scheduleTimer(run, ms) {
      const timer = { run, ms };
      waiting.add(timer);
      return () => waiting.delete(timer);
    },
    pending: () => [...waiting].map((timer) => timer.ms),
    fire() {
      const due = [...waiting];
      waiting.clear();
      for (const timer of due) timer.run();
    },
  };
}
