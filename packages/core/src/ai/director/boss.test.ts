import { describe, expect, test } from "bun:test";

import {
  advanceBoss,
  bossPhase,
  createBossState,
  type BossPhase,
} from "@jgengine/core/ai/director/boss";

const wardens: readonly BossPhase[] = [
  {
    id: "opening",
    atHealth: 1,
    behaviour: { preferredRange: 9, holdCover: false, flankAngle: 0, discipline: { fireInterval: 1.4 } },
  },
  {
    id: "enraged",
    atHealth: 0.6,
    behaviour: { preferredRange: 3, holdCover: true, flankAngle: 0.4, discipline: { fireInterval: 0.5 } },
    tell: { id: "roar", telegraphSeconds: 2 },
  },
  {
    id: "last-stand",
    atHealth: 0.2,
    behaviour: { preferredRange: 2, holdCover: false, retreatBelow: 0, discipline: { peekSeconds: 2 } },
    tell: { id: "shields-down" },
  },
];

describe("boss phases", () => {
  test("a boss opens in its first phase with its authored behaviour", () => {
    const state = createBossState(wardens);
    const step = advanceBoss(wardens, state, 1, 0.1);
    expect(step.changed).toBe(false);
    expect(step.phase.id).toBe("opening");
    expect(step.phase.behaviour.preferredRange).toBe(9);
    expect(step.tell).toBeNull();
  });

  test("crossing a threshold changes phase, behaviour and tell", () => {
    let state = createBossState(wardens);
    const before = advanceBoss(wardens, state, 1, 0);
    state = before.state;
    const step = advanceBoss(wardens, state, 0.59, 0.016);
    expect(step.changed).toBe(true);
    expect(step.phase.id).toBe("enraged");
    expect(step.phase.behaviour.preferredRange).not.toBe(before.phase.behaviour.preferredRange);
    expect(step.phase.behaviour.holdCover).toBe(true);
    expect(step.tell?.id).toBe("roar");
    expect(step.state.tellId).toBe("roar");
    expect(step.state.tellRemaining).toBe(2);
  });

  test("the tell expires instead of replaying, and the phase does not re-announce", () => {
    let state = advanceBoss(wardens, createBossState(wardens), 0.5, 0).state;
    const expired = advanceBoss(wardens, state, 0.5, 2.5);
    expect(expired.changed).toBe(false);
    expect(expired.tell).toBeNull();
    expect(expired.state.tellId).toBeNull();
    expect(expired.state.phaseId).toBe("enraged");
    state = expired.state;
    const later = advanceBoss(wardens, state, 0.5, 30);
    expect(later.changed).toBe(false);
    expect(later.state.phaseId).toBe("enraged");
    expect(later.state.ageSeconds).toBeGreaterThan(30);
  });

  test("a heal does not rewind the boss into an earlier phase", () => {
    const enraged = advanceBoss(wardens, createBossState(wardens), 0.1, 0);
    expect(enraged.phase.id).toBe("last-stand");
    const healed = advanceBoss(wardens, enraged.state, 1, 0.5);
    expect(healed.phase.id).toBe("last-stand");
    expect(healed.changed).toBe(false);
  });

  test("health at a threshold counts as that phase", () => {
    expect(bossPhase(wardens, 0.6).id).toBe("enraged");
    expect(bossPhase(wardens, 0.6001).id).toBe("opening");
    expect(bossPhase(wardens, 0.2).id).toBe("last-stand");
    expect(bossPhase(wardens, 0).id).toBe("last-stand");
  });

  test("purple health and long frames stay inside the phase list", () => {
    let state = createBossState(wardens);
    state = advanceBoss(wardens, state, Number.NaN, 0.1).state;
    expect(state.phaseId).toBe("opening");
    const huge = advanceBoss(wardens, state, 0.01, 1e9);
    expect(huge.phase.id).toBe("last-stand");
    expect(huge.state.tellId).toBe("shields-down");
    expect(advanceBoss(wardens, huge.state, 0.01, 3).state.tellId).toBeNull();
  });

  test("phases must open at full health and never step back up", () => {
    expect(() => createBossState([])).toThrow();
    expect(() => createBossState([{ id: "late", atHealth: 0.5, behaviour: {} }])).toThrow();
    expect(() =>
      createBossState([
        { id: "a", atHealth: 1, behaviour: {} },
        { id: "b", atHealth: 0.4, behaviour: {} },
        { id: "c", atHealth: 0.7, behaviour: {} },
      ]),
    ).toThrow();
  });
});
