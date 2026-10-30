import { describe, expect, test } from "bun:test";

import { advancePhase, createPhaseClock, type PhaseLike } from "./phaseLadder";

interface TrialPhase extends PhaseLike {
  speed: number;
  cover: boolean;
  reach?: number;
}

const trials: readonly TrialPhase[] = [
  { id: "start", at: 1, speed: 4, cover: false },
  {
    id: "middle",
    at: 0.6,
    speed: 2,
    cover: true,
    tell: { id: "warn", seconds: 2 },
  },
  {
    id: "end",
    at: 0.2,
    speed: 1,
    cover: false,
    reach: 0,
    tell: { id: "alarm", seconds: 1.5 },
  },
];

describe("phase ladder", () => {
  test("a ladder opens in its first phase with its authored data", () => {
    const clock = createPhaseClock(trials);
    const step = advancePhase(trials, clock, 1, 0.1);
    expect(step.changed).toBe(false);
    expect(step.phase.id).toBe("start");
    expect(step.phase.speed).toBe(4);
    expect(step.tell).toBeNull();
  });

  test("crossing a cut point changes phase, data and tell", () => {
    let clock = createPhaseClock(trials);
    const before = advancePhase(trials, clock, 1, 0);
    clock = before.state;
    const step = advancePhase(trials, clock, 0.59, 0.016);
    expect(step.changed).toBe(true);
    expect(step.phase.id).toBe("middle");
    expect(step.phase.speed).not.toBe(before.phase.speed);
    expect(step.phase.cover).toBe(true);
    expect(step.tell?.id).toBe("warn");
    expect(step.state.tellId).toBe("warn");
    expect(step.state.tellRemaining).toBe(2);
  });

  test("the tell expires instead of replaying, and the phase does not re-announce", () => {
    let clock = advancePhase(trials, createPhaseClock(trials), 0.5, 0).state;
    const expired = advancePhase(trials, clock, 0.5, 2.5);
    expect(expired.changed).toBe(false);
    expect(expired.tell).toBeNull();
    expect(expired.state.tellId).toBeNull();
    expect(expired.state.phaseId).toBe("middle");
    clock = expired.state;
    const later = advancePhase(trials, clock, 0.5, 30);
    expect(later.changed).toBe(false);
    expect(later.state.phaseId).toBe("middle");
    expect(later.state.ageSeconds).toBeGreaterThan(30);
  });

  test("a rise does not rewind the ladder into an earlier phase", () => {
    const low = advancePhase(trials, createPhaseClock(trials), 0.1, 0);
    expect(low.phase.id).toBe("end");
    const healed = advancePhase(trials, low.state, 1, 0.5);
    expect(healed.phase.id).toBe("end");
    expect(healed.changed).toBe(false);
  });

  test("a fraction at a cut point counts as that phase", () => {
    const phaseAt = (fraction: number) => advancePhase(trials, createPhaseClock(trials), fraction, 0).phase.id;
    expect(phaseAt(0.6)).toBe("middle");
    expect(phaseAt(0.6001)).toBe("start");
    expect(phaseAt(0.2)).toBe("end");
    expect(phaseAt(0)).toBe("end");
  });

  test("purple fractions and long frames stay inside the phase list", () => {
    let clock = createPhaseClock(trials);
    clock = advancePhase(trials, clock, Number.NaN, 0.1).state;
    expect(clock.phaseId).toBe("start");
    const huge = advancePhase(trials, clock, 0.01, 1e9);
    expect(huge.phase.id).toBe("end");
    expect(huge.state.tellId).toBe("alarm");
    expect(advancePhase(trials, huge.state, 0.01, 3).state.tellId).toBeNull();
  });

  test("phases must open at full value and never step back up", () => {
    expect(() => createPhaseClock([])).toThrow();
    expect(() => createPhaseClock([{ id: "late", at: 0.5 }])).toThrow();
    expect(() =>
      createPhaseClock([
        { id: "a", at: 1 },
        { id: "b", at: 0.4 },
        { id: "c", at: 0.7 },
      ]),
    ).toThrow();
  });
});
