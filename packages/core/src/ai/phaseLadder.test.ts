import { describe, expect, test } from "bun:test";

import { advancePhase, createPhaseClock, type PhaseLike } from "./phaseLadder";

interface WardenPhase extends PhaseLike {
  behaviour: {
    preferredRange: number;
    holdCover?: boolean;
    flankAngle?: number;
    retreatBelow?: number;
    discipline?: { fireInterval?: number; peekSeconds?: number };
  };
}

const wardens: readonly WardenPhase[] = [
  {
    id: "opening",
    at: 1,
    behaviour: { preferredRange: 9, holdCover: false, flankAngle: 0, discipline: { fireInterval: 1.4 } },
  },
  {
    id: "enraged",
    at: 0.6,
    behaviour: { preferredRange: 3, holdCover: true, flankAngle: 0.4, discipline: { fireInterval: 0.5 } },
    tell: { id: "roar", seconds: 2 },
  },
  {
    id: "last-stand",
    at: 0.2,
    behaviour: { preferredRange: 2, holdCover: false, retreatBelow: 0, discipline: { peekSeconds: 2 } },
    tell: { id: "shields-down", seconds: 1.5 },
  },
];

describe("phase ladder", () => {
  test("a ladder opens in its first phase with its authored data", () => {
    const clock = createPhaseClock(wardens);
    const step = advancePhase(wardens, clock, 1, 0.1);
    expect(step.changed).toBe(false);
    expect(step.phase.id).toBe("opening");
    expect(step.phase.behaviour.preferredRange).toBe(9);
    expect(step.tell).toBeNull();
  });

  test("crossing a cut point changes phase, data and tell", () => {
    let clock = createPhaseClock(wardens);
    const before = advancePhase(wardens, clock, 1, 0);
    clock = before.state;
    const step = advancePhase(wardens, clock, 0.59, 0.016);
    expect(step.changed).toBe(true);
    expect(step.phase.id).toBe("enraged");
    expect(step.phase.behaviour.preferredRange).not.toBe(before.phase.behaviour.preferredRange);
    expect(step.phase.behaviour.holdCover).toBe(true);
    expect(step.tell?.id).toBe("roar");
    expect(step.state.tellId).toBe("roar");
    expect(step.state.tellRemaining).toBe(2);
  });

  test("the tell expires instead of replaying, and the phase does not re-announce", () => {
    let clock = advancePhase(wardens, createPhaseClock(wardens), 0.5, 0).state;
    const expired = advancePhase(wardens, clock, 0.5, 2.5);
    expect(expired.changed).toBe(false);
    expect(expired.tell).toBeNull();
    expect(expired.state.tellId).toBeNull();
    expect(expired.state.phaseId).toBe("enraged");
    clock = expired.state;
    const later = advancePhase(wardens, clock, 0.5, 30);
    expect(later.changed).toBe(false);
    expect(later.state.phaseId).toBe("enraged");
    expect(later.state.ageSeconds).toBeGreaterThan(30);
  });

  test("a rise does not rewind the ladder into an earlier phase", () => {
    const low = advancePhase(wardens, createPhaseClock(wardens), 0.1, 0);
    expect(low.phase.id).toBe("last-stand");
    const healed = advancePhase(wardens, low.state, 1, 0.5);
    expect(healed.phase.id).toBe("last-stand");
    expect(healed.changed).toBe(false);
  });

  test("a fraction at a cut point counts as that phase", () => {
    const phaseAt = (fraction: number) => advancePhase(wardens, createPhaseClock(wardens), fraction, 0).phase.id;
    expect(phaseAt(0.6)).toBe("enraged");
    expect(phaseAt(0.6001)).toBe("opening");
    expect(phaseAt(0.2)).toBe("last-stand");
    expect(phaseAt(0)).toBe("last-stand");
  });

  test("purple fractions and long frames stay inside the phase list", () => {
    let clock = createPhaseClock(wardens);
    clock = advancePhase(wardens, clock, Number.NaN, 0.1).state;
    expect(clock.phaseId).toBe("opening");
    const huge = advancePhase(wardens, clock, 0.01, 1e9);
    expect(huge.phase.id).toBe("last-stand");
    expect(huge.state.tellId).toBe("shields-down");
    expect(advancePhase(wardens, huge.state, 0.01, 3).state.tellId).toBeNull();
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
