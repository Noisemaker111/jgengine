/**
 * Timers a test fires by hand, for `createHostRouter` and `createWsBackend`. A test that waits out a
 * real grace window races the machine: under load the window closes before the reconnect lands.
 * @internal
 */
export function manualTimers(): {
  setTimeoutFn: typeof setTimeout;
  clearTimeoutFn: typeof clearTimeout;
  /** The delay of every timer still waiting, in the order they were set. */
  pending(): number[];
  /** Run every timer still waiting. */
  fire(): void;
} {
  const waiting = new Map<number, { run: () => void; ms: number }>();
  let next = 1;
  const setTimeoutFn = ((run: () => void, ms = 0) => {
    const id = next++;
    waiting.set(id, { run, ms });
    return id;
  }) as unknown as typeof setTimeout;
  const clearTimeoutFn = ((id: number | undefined) => {
    if (id !== undefined) waiting.delete(id);
  }) as unknown as typeof clearTimeout;
  return {
    setTimeoutFn,
    clearTimeoutFn,
    pending: () => [...waiting.values()].map((timer) => timer.ms),
    fire() {
      const due = [...waiting.values()];
      waiting.clear();
      for (const timer of due) timer.run();
    },
  };
}
