import { describe, expect, test } from "bun:test";

import { createSimClock, type SimClock } from "./simClock";
import { createEntityStore } from "../scene/entityStore";
import { createSimContext } from "../runtime/simContext";

describe("createSimClock — scaling", () => {
  test("advance returns real dt × scale × speed and accumulates game time", () => {
    const clock = createSimClock({ config: { scale: 3 } });
    expect(clock.advance(1)).toBe(3);
    expect(clock.now()).toBe(3);
    expect(clock.advance(2)).toBe(6);
    expect(clock.now()).toBe(9);
  });

  test("speed multiplies on top of scale", () => {
    const clock = createSimClock({ config: { scale: 2, speeds: [1, 4] } });
    clock.setSpeed(4);
    expect(clock.advance(1)).toBe(8);
  });

  test("default scale is real time (1:1)", () => {
    const clock = createSimClock();
    expect(clock.advance(0.5)).toBe(0.5);
  });
});

describe("createSimClock — local accepted progress", () => {
  test("counts accepted speed and timescale without boot or calendar offsets", () => {
    const clock = createSimClock({ config: { scale: 75, start: 28800, speeds: [1, 4] } });
    expect(clock.advancedSeconds()).toBe(0);
    expect(clock.advance(0.05)).toBe(3.75);
    expect(clock.advancedSeconds()).toBe(0.05);
    clock.setSpeed(4);
    clock.setTimescale(0.5);
    expect(clock.advancedSeconds()).toBe(0.05);
    expect(clock.advance(0.05)).toBe(7.5);
    expect(clock.advancedSeconds()).toBeCloseTo(0.15, 12);
    expect(clock.now()).toBe(28811.25);
  });

  test("clock save and hydrate preserve their schema without altering local progress", () => {
    const clock = createSimClock({ config: { scale: 2 } });
    clock.advance(0.5);
    const saved = clock.snapshot();
    expect(Object.keys(saved).sort()).toEqual(["calendar", "now", "paused", "playSpeed", "scale", "speed", "speeds", "timescale"]);
    clock.hydrate({ ...saved, now: 10000, playSpeed: 4 });
    expect(clock.advancedSeconds()).toBe(0.5);
    expect(clock.now()).toBe(10000);
    clock.advance(0.25);
    expect(clock.advancedSeconds()).toBe(1.5);
    clock.hydrate(saved);
    expect(clock.now()).toBe(1);
    expect(clock.advancedSeconds()).toBe(1.5);
    const restored = createSimClock();
    restored.hydrate(saved);
    expect(restored.now()).toBe(1);
    expect(restored.advancedSeconds()).toBe(0);
  });

  test("a fixed simulation counts actual steps without counting accumulated or dropped time", () => {
    const time = createSimClock({ config: { scale: 75 } });
    const sim = createSimContext({ config: { hz: 10, maxCatchUpSteps: 2 }, entities: createEntityStore(), time });
    const accepted: number[] = [];
    const result = sim.advance(1.05, (dt) => accepted.push(dt));
    expect(result.steps).toBe(2);
    expect(result.dropped).toBe(8);
    expect(accepted).toEqual([0.1, 0.1]);
    expect(time.advancedSeconds()).toBeCloseTo(0.2, 12);
    expect(time.now()).toBe(15);
    expect(sim.advance(0.01, () => accepted.push(99)).steps).toBe(0);
    expect(time.advancedSeconds()).toBeCloseTo(0.2, 12);
    expect(sim.advance(0.05, (dt) => accepted.push(dt)).steps).toBe(1);
    expect(time.advancedSeconds()).toBeCloseTo(0.3, 12);
    expect(accepted).toEqual([0.1, 0.1, 0.1]);
  });

  test("a variable simulation records its supplied accepted step and skips prediction-only advances", () => {
    const time = createSimClock({ config: { scale: 2 } });
    const sim = createSimContext({ entities: createEntityStore(), time });
    const calendarSteps: number[] = [];
    sim.advance(0.05, (_dt, _tick, gameDt) => calendarSteps.push(gameDt));
    time.setSpeed(4);
    sim.advance(0.05, (_dt, _tick, gameDt) => calendarSteps.push(gameDt));
    expect(time.advancedSeconds()).toBe(0.25);
    expect(calendarSteps).toEqual([0.1, 0.4]);
    sim.advance(0.2, (_dt, _tick, gameDt) => expect(gameDt).toBe(0), { advanceTime: false });
    expect(time.advancedSeconds()).toBe(0.25);
    expect(time.now()).toBe(0.5);
    const local = createSimClock();
    const prediction = createSimContext({ entities: createEntityStore(), time: local });
    prediction.advance(0.2, () => {}, { advanceTime: false });
    local.hydrate({ ...time.snapshot(), now: 12000 });
    prediction.advance(0.2, () => {}, { advanceTime: false });
    expect(local.advancedSeconds()).toBe(0);
    expect(local.now()).toBe(12000);
  });

  test("paused, zero-timescale and nonpositive advances do not add progress", () => {
    const clock = createSimClock({ config: { startPaused: true } });
    clock.advance(2);
    expect(clock.advancedSeconds()).toBe(0);
    clock.play();
    clock.advance(0.2);
    clock.setTimescale(0);
    clock.advance(2);
    clock.setTimescale(1);
    clock.advance(0);
    clock.advance(-2);
    expect(clock.advancedSeconds()).toBe(0.2);
    expect(clock.now()).toBe(0.2);
  });

  test("nonfinite local deltas cannot poison accepted progress", () => {
    for (const dt of [NaN, Infinity]) {
      const clock = createSimClock();
      clock.advance(dt);
      expect(clock.advancedSeconds()).toBe(0);
    }
    const clock = createSimClock();
    clock.setSpeed(Infinity);
    clock.advance(0.1);
    expect(clock.advancedSeconds()).toBe(0);
  });

  test("timer callbacks see accepted progress before changing controls or throwing", () => {
    const clock = createSimClock();
    const seen: number[] = [];
    clock.after(0.5, () => { seen.push(clock.advancedSeconds()); clock.setSpeed(4); });
    expect(clock.advance(1)).toBe(1);
    expect(seen).toEqual([1]);
    expect(clock.advancedSeconds()).toBe(1);
    expect(clock.advance(0.25)).toBe(1);
    expect(clock.advancedSeconds()).toBe(2);
    clock.after(0.5, () => { throw new Error("existing timer callback failure"); });
    expect(() => clock.advance(0.25)).toThrow("existing timer callback failure");
    expect(clock.now()).toBe(3);
    expect(clock.advancedSeconds()).toBe(3);
  });

  test("external structural clocks can continue omitting the optional progress getter", () => {
    const clock = createSimClock();
    const { advancedSeconds: _progress, ...legacy } = clock;
    const compatible: SimClock = legacy;
    expect(compatible.advancedSeconds).toBeUndefined();
    expect(compatible.advance(0.25)).toBe(0.25);
    expect(clock.advancedSeconds()).toBe(0.25);
  });
});

describe("createSimClock — pause / play / speed", () => {
  test("pause freezes time and play resumes", () => {
    const clock = createSimClock();
    clock.advance(1);
    clock.pause();
    expect(clock.isPaused()).toBe(true);
    expect(clock.speed()).toBe(0);
    expect(clock.advance(5)).toBe(0);
    expect(clock.now()).toBe(1);
    clock.play();
    expect(clock.advance(2)).toBe(2);
    expect(clock.now()).toBe(3);
  });

  test("setSpeed(0) pauses; positive speed unpauses and is remembered", () => {
    const clock = createSimClock({ config: { speeds: [1, 2, 3] } });
    clock.setSpeed(3);
    clock.setSpeed(0);
    expect(clock.isPaused()).toBe(true);
    clock.play();
    expect(clock.advance(1)).toBe(3);
  });

  test("cycleSpeed steps through configured speeds and wraps", () => {
    const clock = createSimClock({ config: { speeds: [1, 2, 4] } });
    expect(clock.speed()).toBe(1);
    clock.cycleSpeed();
    expect(clock.speed()).toBe(2);
    clock.cycleSpeed();
    expect(clock.speed()).toBe(4);
    clock.cycleSpeed();
    expect(clock.speed()).toBe(1);
  });

  test("startPaused boots paused", () => {
    const clock = createSimClock({ config: { startPaused: true } });
    expect(clock.isPaused()).toBe(true);
    expect(clock.advance(1)).toBe(0);
  });
});

describe("createSimClock — timers on game time", () => {
  test("after fires once when game time crosses the delay", () => {
    const clock = createSimClock({ config: { scale: 1 } });
    let fired = 0;
    clock.after(10, () => (fired += 1));
    clock.advance(9);
    expect(fired).toBe(0);
    clock.advance(2);
    expect(fired).toBe(1);
    clock.advance(100);
    expect(fired).toBe(1);
  });

  test("timers fire sooner under fast-forward because game time advances faster", () => {
    const clock = createSimClock({ config: { scale: 1, speeds: [1, 4] } });
    let fired = 0;
    clock.after(4, () => (fired += 1));
    clock.setSpeed(4);
    clock.advance(1);
    expect(fired).toBe(1);
  });

  test("every repeats, and a large step fires it multiple times", () => {
    const clock = createSimClock();
    let fired = 0;
    clock.every(1, () => (fired += 1));
    clock.advance(3.5);
    expect(fired).toBe(3);
    clock.advance(1);
    expect(fired).toBe(4);
  });

  test("at fires at an absolute game time", () => {
    const clock = createSimClock();
    let fired = 0;
    clock.at(5, () => (fired += 1));
    clock.advance(4);
    expect(fired).toBe(0);
    clock.advance(2);
    expect(fired).toBe(1);
  });

  test("cancel handle stops a timer from firing", () => {
    const clock = createSimClock();
    let fired = 0;
    const cancel = clock.after(2, () => (fired += 1));
    cancel();
    clock.advance(5);
    expect(fired).toBe(0);
  });

  test("paused clock does not fire timers", () => {
    const clock = createSimClock({ config: { startPaused: true } });
    let fired = 0;
    clock.after(1, () => (fired += 1));
    clock.advance(10);
    expect(fired).toBe(0);
  });
});

describe("createSimClock — calendar", () => {
  test("start offset and day rollover", () => {
    const clock = createSimClock({ config: { dayLength: 86400, start: 8 * 3600 } });
    const morning = clock.calendar();
    expect(morning.day).toBe(0);
    expect(morning.hour).toBe(8);
    expect(morning.minute).toBe(0);
    clock.advance(16 * 3600 + 1);
    const nextDay = clock.calendar();
    expect(nextDay.day).toBe(1);
    expect(nextDay.hour).toBe(0);
  });

  test("compressed dayLength still maps to a 24-hour face", () => {
    const clock = createSimClock({ config: { dayLength: 240 } });
    clock.advance(120);
    expect(clock.calendar().hour).toBe(12);
    expect(clock.calendar().dayFraction).toBeCloseTo(0.5, 5);
  });

  test("year and dayOfYear default to a 365-day year without config", () => {
    const clock = createSimClock({ config: { dayLength: 86400 } });
    expect(clock.calendar().year).toBe(0);
    expect(clock.calendar().dayOfYear).toBe(0);
    clock.advance(365 * 86400 + 1);
    const rolled = clock.calendar();
    expect(rolled.year).toBe(1);
    expect(rolled.dayOfYear).toBe(0);
  });

  test("daysPerYear configures a custom year length", () => {
    const clock = createSimClock({ config: { dayLength: 86400, daysPerYear: 10 } });
    clock.advance(9 * 86400);
    expect(clock.calendar().year).toBe(0);
    expect(clock.calendar().dayOfYear).toBe(9);
    clock.advance(86400 + 1);
    const rolled = clock.calendar();
    expect(rolled.year).toBe(1);
    expect(rolled.dayOfYear).toBe(0);
  });

  test("yearFraction tracks progress through the configured year", () => {
    const clock = createSimClock({ config: { dayLength: 86400, daysPerYear: 4 } });
    clock.advance(2 * 86400);
    expect(clock.calendar().yearFraction).toBeCloseTo(0.5, 5);
  });

  test("season is derived from dayOfYear across equal segments when configured", () => {
    const clock = createSimClock({
      config: { dayLength: 86400, daysPerYear: 8, seasons: ["spring", "summer", "fall", "winter"] },
    });
    expect(clock.calendar().season).toBe("spring");
    clock.advance(2 * 86400);
    expect(clock.calendar().season).toBe("summer");
    clock.advance(2 * 86400);
    expect(clock.calendar().season).toBe("fall");
    clock.advance(2 * 86400);
    expect(clock.calendar().season).toBe("winter");
  });

  test("season is undefined unless seasons are configured", () => {
    const clock = createSimClock({ config: { dayLength: 86400 } });
    expect(clock.calendar().season).toBeUndefined();
  });
});

describe("createSimClock — onChange", () => {
  test("fires on control changes but not on every advance frame", () => {
    let changes = 0;
    const clock = createSimClock({ config: { scale: 1 }, onChange: () => (changes += 1) });
    clock.advance(0.5);
    expect(changes).toBe(0);
    clock.pause();
    expect(changes).toBe(1);
    clock.play();
    expect(changes).toBe(2);
    clock.setSpeed(2);
    expect(changes).toBe(3);
  });

  test("fires once per displayed in-game minute as time advances", () => {
    let changes = 0;
    const clock = createSimClock({
      config: { dayLength: 86400 },
      onChange: () => (changes += 1),
    });
    clock.advance(59);
    expect(changes).toBe(0);
    clock.advance(2);
    expect(changes).toBe(1);
  });
});

describe("createSimClock — timescale", () => {
  test("defaults to 1 and scales the advanced game delta", () => {
    const clock = createSimClock({ config: { scale: 1 } });
    expect(clock.timescale()).toBe(1);
    expect(clock.advance(1)).toBe(1);
    clock.setTimescale(2);
    expect(clock.advance(1)).toBe(2);
    clock.setTimescale(0.5);
    expect(clock.advance(1)).toBe(0.5);
  });

  test("composes with the speed control and the configured scale", () => {
    const clock = createSimClock({ config: { scale: 10, speeds: [1, 4] } });
    clock.setSpeed(4);
    clock.setTimescale(0.5);
    expect(clock.advance(1)).toBe(20);
  });

  test("timescale 0 freezes game time and timers without flipping pause state", () => {
    const clock = createSimClock({ config: { scale: 1 } });
    let fired = 0;
    clock.after(1, () => (fired += 1));
    clock.setTimescale(0);
    expect(clock.advance(5)).toBe(0);
    expect(clock.now()).toBe(0);
    expect(fired).toBe(0);
    expect(clock.isPaused()).toBe(false);
    clock.setTimescale(1);
    clock.advance(1.5);
    expect(fired).toBe(1);
  });

  test("negative and non-finite values clamp to 0", () => {
    const clock = createSimClock({ config: { scale: 1 } });
    clock.setTimescale(-3);
    expect(clock.timescale()).toBe(0);
    clock.setTimescale(Number.NaN);
    expect(clock.timescale()).toBe(0);
    clock.setTimescale(2);
    expect(clock.timescale()).toBe(2);
  });

  test("appears in the snapshot and notifies onChange only on real changes", () => {
    let changes = 0;
    const clock = createSimClock({ config: { scale: 1 }, onChange: () => (changes += 1) });
    expect(clock.snapshot().timescale).toBe(1);
    clock.setTimescale(0.25);
    expect(clock.snapshot().timescale).toBe(0.25);
    expect(changes).toBe(1);
    clock.setTimescale(0.25);
    expect(changes).toBe(1);
  });
});
