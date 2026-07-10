import { describe, expect, test } from "bun:test";
import {
  applyWreck,
  createWreckState,
  evaluateOutcome,
  expressDeadlineSeconds,
  PARDON_PENALTY_SECONDS,
} from "./raceOutcome";

describe("express deadline", () => {
  test("is a positive, finite number of seconds", () => {
    const deadline = expressDeadlineSeconds();
    expect(deadline).toBeGreaterThan(0);
    expect(Number.isFinite(deadline)).toBe(true);
  });

  test("is deterministic", () => {
    expect(expressDeadlineSeconds()).toBe(expressDeadlineSeconds());
  });
});

describe("pardon logic", () => {
  test("first wreck spends the pardon and adds a time penalty instead of ending the run", () => {
    const fresh = createWreckState();
    const afterFirst = applyWreck(fresh, "collision", "e-j2-j3");
    expect(afterFirst.wrecked).toBe(false);
    expect(afterFirst.pardonUsed).toBe(true);
    expect(afterFirst.penaltySeconds).toBe(PARDON_PENALTY_SECONDS);
  });

  test("second wreck is fatal", () => {
    const fresh = createWreckState();
    const afterFirst = applyWreck(fresh, "collision", "e-j2-j3");
    const afterSecond = applyWreck(afterFirst, "trestle", "e-j3-j4");
    expect(afterSecond.wrecked).toBe(true);
    expect(afterSecond.wreckReason).toBe("trestle");
    expect(afterSecond.wreckEdgeId).toBe("e-j3-j4");
  });

  test("a wreck applied to an already-wrecked state is a no-op", () => {
    const fresh = createWreckState();
    const first = applyWreck(fresh, "a", "e-depot-j1");
    const second = applyWreck(first, "b", "e-j1-gorge");
    const third = applyWreck(second, "c", "e-gorge-j2");
    expect(third).toEqual(second);
  });

  test("never mutates the input", () => {
    const fresh = createWreckState();
    applyWreck(fresh, "collision", "e-j2-j3");
    expect(fresh.pardonUsed).toBe(false);
    expect(fresh.penaltySeconds).toBe(0);
  });
});

describe("arrival comparison win/lose", () => {
  const deadline = 100;

  test("still racing before finishing and before the deadline", () => {
    const outcome = evaluateOutcome({ finished: false, finishTime: null, elapsed: 40, wreck: createWreckState(), deadlineSeconds: deadline });
    expect(outcome.status).toBe("racing");
  });

  test("wins when finishing before the express deadline", () => {
    const outcome = evaluateOutcome({ finished: true, finishTime: 92, elapsed: 92, wreck: createWreckState(), deadlineSeconds: deadline });
    expect(outcome).toEqual({ status: "won", marginSeconds: 8, pardonUsed: false });
  });

  test("a pardon penalty can turn a nominal win into an express loss", () => {
    const wreck = applyWreck(createWreckState(), "collision", "e-j2-j3");
    const outcome = evaluateOutcome({ finished: true, finishTime: 95, elapsed: 95, wreck, deadlineSeconds: deadline });
    expect(outcome.status).toBe("lost-to-express");
  });

  test("loses to the express once elapsed time passes the deadline without finishing", () => {
    const outcome = evaluateOutcome({ finished: false, finishTime: null, elapsed: 101, wreck: createWreckState(), deadlineSeconds: deadline });
    expect(outcome.status).toBe("lost-to-express");
  });

  test("a fatal wreck always wins out over timing, even past the deadline", () => {
    const wreck = applyWreck(applyWreck(createWreckState(), "a", "e-j2-j3"), "b", "e-j3-j4");
    const outcome = evaluateOutcome({ finished: false, finishTime: null, elapsed: 5, wreck, deadlineSeconds: deadline });
    expect(outcome).toEqual({ status: "wrecked", reason: "b", edgeId: "e-j3-j4" });
  });
});
