import { describe, expect, test } from "bun:test";

import { createDebouncedCommit, type DebounceTimer } from "./useDebouncedCommit";

/** Manual clock: queues debounce callbacks and fires them on demand — no real timers. */
function manualTimer() {
  const pending = new Map<number, { fn: () => void; due: number }>();
  let id = 0;
  let now = 0;
  const timer: DebounceTimer = {
    set: (fn, ms) => {
      const handle = ++id;
      pending.set(handle, { fn, due: now + ms });
      return handle;
    },
    clear: (handle) => {
      pending.delete(handle as number);
    },
  };
  return {
    timer,
    /** Advance the clock by `ms`, firing every callback whose delay has elapsed. */
    advance: (ms: number) => {
      now += ms;
      for (const [handle, entry] of [...pending]) {
        if (entry.due <= now) {
          pending.delete(handle);
          entry.fn();
        }
      }
    },
    pendingCount: () => pending.size,
  };
}

function harness<T>(initial: T, delay = 180) {
  const clock = manualTimer();
  const commits: T[] = [];
  const locals: T[] = [initial];
  const controller = createDebouncedCommit<T>({
    initial,
    commit: (value) => commits.push(value),
    onLocalChange: (value) => locals.push(value),
    delayMs: () => delay,
    timer: clock.timer,
  });
  return { clock, commits, locals, controller, local: () => locals[locals.length - 1]! };
}

describe("createDebouncedCommit", () => {
  test("mirrors every input locally but commits only on the trailing debounce", () => {
    const h = harness(0);
    h.controller.input(1);
    h.controller.input(2);
    h.controller.input(3);
    // Local mirror tracks every step for instant feedback…
    expect(h.local()).toBe(3);
    // …but nothing has committed yet.
    expect(h.commits).toEqual([]);

    h.clock.advance(179);
    expect(h.commits).toEqual([]);
    h.clock.advance(1);
    // Exactly one commit, carrying the last value.
    expect(h.commits).toEqual([3]);
  });

  test("re-scheduling extends the debounce (only the final value lands)", () => {
    const h = harness(0);
    h.controller.input(1);
    h.clock.advance(100);
    h.controller.input(2); // resets the timer
    h.clock.advance(100);
    expect(h.commits).toEqual([]); // 200ms elapsed but timer reset at 100
    h.clock.advance(80);
    expect(h.commits).toEqual([2]);
  });

  test("flush commits the pending value immediately and cancels the timer", () => {
    const h = harness(0);
    h.controller.input(5);
    h.controller.flush();
    expect(h.commits).toEqual([5]);
    expect(h.clock.pendingCount()).toBe(0);
    // A later clock advance must not double-commit.
    h.clock.advance(500);
    expect(h.commits).toEqual([5]);
  });

  test("flush is a no-op when nothing is pending", () => {
    const h = harness(0);
    h.controller.flush();
    expect(h.commits).toEqual([]);
  });

  test("sync adopts an external value when clean (undo / RPC resync)", () => {
    const h = harness(10);
    h.controller.sync(42);
    expect(h.local()).toBe(42);
    expect(h.commits).toEqual([]); // resync must never commit
  });

  test("sync is ignored mid-edit so an in-flight drag is not fought", () => {
    const h = harness(0);
    h.controller.input(7); // now dirty
    h.controller.sync(99); // external echo/undo mid-drag — must be ignored
    expect(h.local()).toBe(7);

    // After the edit commits, a fresh external change resyncs again.
    h.clock.advance(180);
    expect(h.commits).toEqual([7]);
    h.controller.sync(99);
    expect(h.local()).toBe(99);
  });

  test("dispose flushes any pending commit (unmount semantics)", () => {
    const h = harness(0);
    h.controller.input(3);
    h.controller.dispose();
    expect(h.commits).toEqual([3]);
  });
});
