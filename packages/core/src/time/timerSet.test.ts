import { describe, expect, test } from "bun:test";

import { createTimerSet } from "@jgengine/core/time/timerSet";

/** A controllable fake clock so tests are deterministic. */
function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void; set: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
    set: (ms) => {
      t = ms;
    },
  };
}

describe("createTimerSet", () => {
  test("reads a fresh countdown timer", () => {
    const clock = fakeClock();
    const timers = createTimerSet({ now: clock.now });
    timers.start("round", { durationMs: 10_000 });
    const read = timers.read("round")!;
    expect(read.remainingMs).toBe(10_000);
    expect(read.elapsedMs).toBe(0);
    expect(read.durationMs).toBe(10_000);
    expect(read.progress01).toBe(0);
    expect(read.running).toBe(true);
    expect(read.expired).toBe(false);
  });

  test("advances remaining/elapsed/progress against the clock", () => {
    const clock = fakeClock();
    const timers = createTimerSet({ now: clock.now });
    timers.start("round", { durationMs: 10_000 });
    clock.advance(4_000);
    const read = timers.read("round")!;
    expect(read.remainingMs).toBe(6_000);
    expect(read.elapsedMs).toBe(4_000);
    expect(read.progress01).toBeCloseTo(0.4, 5);
  });

  test("clamps and flags a finished non-looping timer", () => {
    const clock = fakeClock();
    const timers = createTimerSet({ now: clock.now });
    timers.start("respawn", { durationMs: 5_000 });
    clock.advance(9_000);
    const read = timers.read("respawn")!;
    expect(read.remainingMs).toBe(0);
    expect(read.elapsedMs).toBe(5_000);
    expect(read.progress01).toBe(1);
    expect(read.expired).toBe(true);
  });

  test("pause freezes elapsed and resume continues", () => {
    const clock = fakeClock();
    const timers = createTimerSet({ now: clock.now });
    timers.start("charge", { durationMs: 8_000, direction: "up" });
    clock.advance(3_000);
    timers.pause("charge");
    clock.advance(10_000); // time passes while paused
    expect(timers.read("charge")!.elapsedMs).toBe(3_000);
    expect(timers.read("charge")!.running).toBe(false);
    timers.resume("charge");
    clock.advance(2_000);
    expect(timers.read("charge")!.elapsedMs).toBe(5_000);
    expect(timers.read("charge")!.running).toBe(true);
  });

  test("stop resets to zero and halts; reset restarts preserving running", () => {
    const clock = fakeClock();
    const timers = createTimerSet({ now: clock.now });
    timers.start("round", { durationMs: 10_000 });
    clock.advance(6_000);
    timers.stop("round");
    expect(timers.read("round")!.elapsedMs).toBe(0);
    expect(timers.read("round")!.running).toBe(false);

    timers.start("round", { durationMs: 10_000 });
    clock.advance(6_000);
    timers.reset("round");
    expect(timers.read("round")!.elapsedMs).toBe(0);
    expect(timers.read("round")!.running).toBe(true);
    clock.advance(1_000);
    expect(timers.read("round")!.elapsedMs).toBe(1_000);
  });

  test("remove deletes the timer", () => {
    const timers = createTimerSet();
    timers.start("x", { durationMs: 1_000 });
    expect(timers.has("x")).toBe(true);
    timers.remove("x");
    expect(timers.has("x")).toBe(false);
    expect(timers.read("x")).toBeNull();
  });

  test("poll reports an expiry edge once for a non-looping timer", () => {
    const clock = fakeClock();
    const timers = createTimerSet({ now: clock.now });
    const fired: string[] = [];
    timers.onExpire((id) => fired.push(id));
    timers.start("round", { durationMs: 5_000 });
    clock.advance(2_000);
    expect(timers.poll()).toEqual([]);
    clock.advance(4_000); // now past 5s
    expect(timers.poll()).toEqual(["round"]);
    clock.advance(4_000);
    expect(timers.poll()).toEqual([]); // no repeat
    expect(fired).toEqual(["round"]);
  });

  test("looping timer wraps and fires an edge each cycle", () => {
    const clock = fakeClock();
    const timers = createTimerSet({ now: clock.now });
    timers.start("tick", { durationMs: 1_000, loop: true });
    clock.advance(2_500);
    const read = timers.read("tick")!;
    expect(read.expired).toBe(false);
    expect(read.elapsedMs).toBe(500);
    expect(read.progress01).toBeCloseTo(0.5, 5);
    expect(timers.poll()).toEqual(["tick", "tick"]); // two completed cycles
    clock.advance(1_000);
    expect(timers.poll()).toEqual(["tick"]);
  });

  test("pauseAll / resumeAll freeze and continue every timer", () => {
    const clock = fakeClock();
    const timers = createTimerSet({ now: clock.now });
    timers.start("a", { durationMs: 10_000 });
    timers.start("b", { durationMs: 20_000 });
    clock.advance(3_000);
    timers.pauseAll();
    clock.advance(5_000);
    expect(timers.read("a")!.elapsedMs).toBe(3_000);
    expect(timers.read("b")!.elapsedMs).toBe(3_000);
    timers.resumeAll();
    clock.advance(1_000);
    expect(timers.read("a")!.elapsedMs).toBe(4_000);
    expect(timers.read("b")!.elapsedMs).toBe(4_000);
  });

  test("read(out) reuses the passed object without allocating", () => {
    const clock = fakeClock();
    const timers = createTimerSet({ now: clock.now });
    timers.start("round", { durationMs: 10_000 });
    const out = timers.read("round")!;
    clock.advance(2_000);
    const again = timers.read("round", out);
    expect(again).toBe(out);
    expect(out.elapsedMs).toBe(2_000);
  });

  test("subscribe fires on structural changes and unsubscribes", () => {
    const timers = createTimerSet();
    let count = 0;
    const unsub = timers.subscribe(() => {
      count += 1;
    });
    timers.start("x", { durationMs: 1_000 });
    timers.pause("x");
    expect(count).toBe(2);
    unsub();
    timers.resume("x");
    expect(count).toBe(2);
  });

  test("snapshot/restore round-trips a running timer and re-anchors", () => {
    const clock = fakeClock(1_000);
    const timers = createTimerSet({ now: clock.now });
    timers.start("round", { durationMs: 10_000 });
    clock.advance(4_000);
    const snap = timers.snapshot();
    expect(snap.timers[0]!.elapsedMs).toBe(4_000);

    // Restore into a set on a different clock epoch.
    const clock2 = fakeClock(500_000);
    const restored = createTimerSet({ now: clock2.now });
    restored.restore(snap);
    expect(restored.read("round")!.elapsedMs).toBe(4_000);
    clock2.advance(1_000);
    expect(restored.read("round")!.elapsedMs).toBe(5_000);
  });

  test("restore preserves paused state", () => {
    const clock = fakeClock();
    const timers = createTimerSet({ now: clock.now });
    timers.start("round", { durationMs: 10_000 });
    clock.advance(3_000);
    timers.pause("round");
    const snap = timers.snapshot();

    const clock2 = fakeClock(9_000);
    const restored = createTimerSet({ now: clock2.now });
    restored.restore(snap);
    clock2.advance(5_000);
    expect(restored.read("round")!.elapsedMs).toBe(3_000);
    expect(restored.read("round")!.running).toBe(false);
  });

  test("non-positive duration reads as instantly expired", () => {
    const timers = createTimerSet();
    timers.start("instant", { durationMs: 0 });
    const read = timers.read("instant")!;
    expect(read.expired).toBe(true);
    expect(read.progress01).toBe(1);
    expect(read.remainingMs).toBe(0);
  });
});
