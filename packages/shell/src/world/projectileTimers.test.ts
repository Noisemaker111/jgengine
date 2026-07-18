import { describe, expect, test } from "bun:test";

interface FakeTimer {
  fireAt: number;
  cb: () => void;
}

/**
 * Deterministic virtual clock. Scheduled callbacks fire only when `advance`
 * moves virtual time past their fire-time, so tests never wait in real time.
 */
function makeFakeClock() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, FakeTimer>();
  return {
    setTimer(cb: () => void, ms: number) {
      const id = nextId++;
      pending.set(id, { fireAt: now + ms, cb });
      return id;
    },
    clearTimer(id: number) {
      pending.delete(id);
    },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...pending]) {
        if (timer.fireAt <= now) {
          pending.delete(id);
          timer.cb();
        }
      }
    },
  };
}

function trackTimeouts(clock: {
  setTimer: (cb: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
}) {
  const timers = new Set<number>();
  return {
    schedule(cb: () => void, ms: number) {
      const handle = clock.setTimer(() => {
        timers.delete(handle);
        cb();
      }, ms);
      timers.add(handle);
      return handle;
    },
    dispose() {
      for (const handle of timers) clock.clearTimer(handle);
      timers.clear();
    },
    size() {
      return timers.size;
    },
  };
}

describe("projectile tracer timer cleanup", () => {
  test("dispose clears pending timeouts before they fire", () => {
    let fired = 0;
    const clock = makeFakeClock();
    const tracker = trackTimeouts(clock);
    tracker.schedule(() => {
      fired += 1;
    }, 50);
    expect(tracker.size()).toBe(1);
    tracker.dispose();
    expect(tracker.size()).toBe(0);
    clock.advance(80);
    expect(fired).toBe(0);
  });
});
