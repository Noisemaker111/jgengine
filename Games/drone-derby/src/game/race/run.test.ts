import { describe, expect, test } from "bun:test";

import { COURSES } from "./courses";
import {
  applyRingEvents,
  assignMedal,
  beginCountdownForCourse,
  crashDnf,
  finishRun,
  initialRunState,
  selectCourse,
  tickCountdown,
  tickFlying,
} from "./run";

describe("assignMedal", () => {
  const course = COURSES.short;
  test("at or under par-gold is gold", () => {
    expect(assignMedal(course.parGold, course)).toBe("gold");
    expect(assignMedal(course.parGold - 5, course)).toBe("gold");
  });
  test("between gold and silver par is silver", () => {
    expect(assignMedal(course.parGold + 1, course)).toBe("silver");
  });
  test("between silver and bronze par is bronze", () => {
    expect(assignMedal(course.parSilver + 1, course)).toBe("bronze");
  });
  test("slower than bronze par earns no medal", () => {
    expect(assignMedal(course.parBronze + 1, course)).toBe("none");
  });
});

describe("phase transitions", () => {
  test("countdown flips to flying at zero and clamps negative overshoot", () => {
    let state = beginCountdownForCourse(initialRunState("short"), "short");
    state = tickCountdown(state, 1);
    expect(state.phase).toBe("countdown");
    state = tickCountdown(state, 10);
    expect(state.phase).toBe("flying");
    expect(state.countdown).toBe(0);
  });

  test("tickFlying only accumulates elapsed time while flying", () => {
    const flying = { ...initialRunState("short"), phase: "flying" as const };
    const advanced = tickFlying(flying, 0.5);
    expect(advanced.elapsed).toBeCloseTo(0.5, 5);
    const menu = initialRunState("short");
    expect(tickFlying(menu, 0.5).elapsed).toBe(0);
  });

  test("applyRingEvents advances ringIndex on checkpoint.hit and ignores other events", () => {
    const flying = { ...initialRunState("technical"), phase: "flying" as const };
    const next = applyRingEvents(flying, [{ type: "checkpoint.hit", racerId: "p", checkpoint: 0, lap: 1, time: 1 }]);
    expect(next.ringIndex).toBe(1);
    const unaffected = applyRingEvents(next, [{ type: "position.changed", racerId: "p", position: 1, previous: 2 }]);
    expect(unaffected.ringIndex).toBe(1);
  });
});

describe("finishRun / crashDnf guards", () => {
  test("finishRun only applies while flying and assigns a medal", () => {
    const notFlying = initialRunState("short");
    expect(finishRun(notFlying, 40).phase).toBe("menu");

    const flying = { ...notFlying, phase: "flying" as const, elapsed: COURSES.short.parGold - 1 };
    const finished = finishRun(flying, 30);
    expect(finished.phase).toBe("finished");
    expect(finished.medal).toBe("gold");
    expect(finished.cellsUsed).toBe(30);
  });

  test("crashDnf only applies while flying and records the reason/position", () => {
    const flying = { ...initialRunState("technical"), phase: "flying" as const };
    const dnf = crashDnf(flying, "battery", [10, 5, 2], 100);
    expect(dnf.phase).toBe("dnf");
    expect(dnf.dnfReason).toBe("battery");
    expect(dnf.dnfPosition).toEqual([10, 5, 2]);
    expect(crashDnf(initialRunState("short"), "time", [0, 0, 0], 50).phase).toBe("menu");
  });
});

describe("restart purity", () => {
  test("beginCountdownForCourse fully resets ring/elapsed/medal state and increments attempts for the same course", () => {
    let state = beginCountdownForCourse(initialRunState("short"), "short");
    state = tickCountdown(state, 10);
    state = { ...state, ringIndex: 4, elapsed: 55, medal: "silver" as const };

    const restarted = beginCountdownForCourse(state, "short");
    expect(restarted.attempts).toBe(2);
    expect(restarted.ringIndex).toBe(0);
    expect(restarted.elapsed).toBe(0);
    expect(restarted.medal).toBe("none");
    expect(restarted.phase).toBe("countdown");
    expect(restarted.courseId).toBe("short");
  });

  test("selecting a different course resets attempts to zero", () => {
    let state = beginCountdownForCourse(initialRunState("short"), "short");
    state = beginCountdownForCourse(state, "short");
    expect(state.attempts).toBe(2);

    const switched = selectCourse("endurance");
    expect(switched.attempts).toBe(0);
    expect(switched.courseId).toBe("endurance");
    expect(switched.ringTotal).toBe(COURSES.endurance.ringIds.length);
  });

  test("beginCountdownForCourse on a fresh course starts attempts at 1", () => {
    const state = beginCountdownForCourse(initialRunState("short"), "technical");
    expect(state.attempts).toBe(1);
    expect(state.courseId).toBe("technical");
  });
});
