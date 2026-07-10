import { describe, expect, test } from "bun:test";

import { RESPAWN_PENALTY_SECONDS } from "../physics/constants";
import type { CourseDef } from "../world/courses";
import {
  applyCheckpoint,
  applyFinish,
  applyFlightDistance,
  applyMissedHook,
  applyRelease,
  applyRespawnPenalty,
  applyTimeCap,
  initialSession,
  selectCourse,
  startCourse,
} from "./sessionState";

const COURSE: CourseDef = {
  id: "test-course",
  name: "Test Course",
  kind: "loop",
  tagline: "",
  checkpoints: Array.from({ length: 5 }, (_, i) => ({
    id: `cp-${i}`,
    center: [i * 10, 20, 0] as const,
    half: [3, 3, 3] as const,
  })),
  pylonIds: [],
  parSeconds: 60,
  totalTimeCapSeconds: 144,
  medals: { gold: 60, silver: 69, bronze: 81 },
};

describe("initialSession / startCourse", () => {
  test("initial session parks in the menu phase", () => {
    expect(initialSession("c1").phase).toBe("menu");
  });

  test("starting a course always returns a freshly-zeroed session, even from a dirty prior state", () => {
    let dirty = startCourse(COURSE, 0);
    dirty = applyRespawnPenalty(dirty, 5);
    dirty = applyRelease(dirty, true, 10);
    dirty = applyRelease(dirty, true, 12);
    dirty = applyFlightDistance(dirty, 40);
    dirty = applyCheckpoint(dirty, 0, 13);
    expect(dirty.penaltySeconds).toBeGreaterThan(0);
    expect(dirty.streak).toBeGreaterThan(0);
    expect(dirty.toasts.length).toBeGreaterThan(0);

    const restarted = startCourse(COURSE, 100);
    expect(restarted.phase).toBe("playing");
    expect(restarted.startedAt).toBe(100);
    expect(restarted.penaltySeconds).toBe(0);
    expect(restarted.streak).toBe(0);
    expect(restarted.bestStreak).toBe(0);
    expect(restarted.checkpointsHit).toBe(0);
    expect(restarted.longestFlightDistance).toBe(0);
    expect(restarted.medal).toBeNull();
    expect(restarted.finishSeconds).toBeNull();
  });

  test("selectCourse only applies while parked in the menu", () => {
    const menu = initialSession("a");
    expect(selectCourse(menu, "b").selectedCourseId).toBe("b");
    const playing = startCourse(COURSE, 0);
    expect(selectCourse(playing, "b").selectedCourseId).toBe(playing.selectedCourseId);
  });
});

describe("applyRelease — the apex-bell streak", () => {
  test("a true swing extends the streak and tracks the best streak", () => {
    let session = startCourse(COURSE, 0);
    session = applyRelease(session, true, 1);
    session = applyRelease(session, true, 2);
    expect(session.streak).toBe(2);
    expect(session.bestStreak).toBe(2);
    expect(session.trueSwingReleases).toBe(2);
    expect(session.totalReleases).toBe(2);
  });

  test("a release outside the bell resets the streak but keeps the best streak on record", () => {
    let session = startCourse(COURSE, 0);
    session = applyRelease(session, true, 1);
    session = applyRelease(session, true, 2);
    session = applyRelease(session, false, 3);
    expect(session.streak).toBe(0);
    expect(session.bestStreak).toBe(2);
    expect(session.totalReleases).toBe(3);
  });
});

describe("applyMissedHook", () => {
  test("adds a marshal toast without touching gameplay counters", () => {
    const session = startCourse(COURSE, 0);
    const next = applyMissedHook(session, 1);
    expect(next.toasts.length).toBeGreaterThan(session.toasts.length);
    expect(next.streak).toBe(session.streak);
  });
});

describe("applyRespawnPenalty", () => {
  test("adds the flat penalty and zeroes the in-progress streak", () => {
    let session = startCourse(COURSE, 0);
    session = applyRelease(session, true, 1);
    expect(session.streak).toBe(1);
    const penalized = applyRespawnPenalty(session, 2);
    expect(penalized.penaltySeconds).toBe(RESPAWN_PENALTY_SECONDS);
    expect(penalized.streak).toBe(0);
  });

  test("penalties accumulate across multiple respawns", () => {
    let session = startCourse(COURSE, 0);
    session = applyRespawnPenalty(session, 1);
    session = applyRespawnPenalty(session, 2);
    expect(session.penaltySeconds).toBe(RESPAWN_PENALTY_SECONDS * 2);
  });
});

describe("applyCheckpoint", () => {
  test("advances checkpointsHit and never regresses it", () => {
    let session = startCourse(COURSE, 0);
    session = applyCheckpoint(session, 0, 1);
    session = applyCheckpoint(session, 1, 2);
    expect(session.checkpointsHit).toBe(2);
  });
});

describe("applyFinish — medal assignment", () => {
  test("assigns gold when the effective time (raw + penalty − streak bonus) is under par", () => {
    let session = startCourse(COURSE, 0);
    session = applyRelease(session, true, 1);
    session = applyRelease(session, true, 2);
    session = applyRelease(session, true, 3);
    const finished = applyFinish(COURSE, session, 60.5, 10);
    expect(finished.phase).toBe("finished");
    expect(finished.medal).toBe("gold");
    expect(finished.finishSeconds).toBeCloseTo(59.9, 1);
  });

  test("a respawn penalty can push an otherwise-gold run down to silver or worse", () => {
    let session = startCourse(COURSE, 0);
    session = applyRespawnPenalty(session, 1);
    const finished = applyFinish(COURSE, session, 60, 10);
    expect(finished.finishSeconds).toBeCloseTo(65, 1);
    expect(finished.medal).toBe("silver");
  });

  test("assigns no medal once effective time exceeds the bronze threshold", () => {
    const session = startCourse(COURSE, 0);
    const finished = applyFinish(COURSE, session, 200, 10);
    expect(finished.medal).toBe("none");
  });
});

describe("applyTimeCap", () => {
  test("only ends a run that is actually playing", () => {
    const menu = initialSession("c");
    expect(applyTimeCap(menu, 1).phase).toBe("menu");
    const playing = startCourse(COURSE, 0);
    expect(applyTimeCap(playing, 1).phase).toBe("lost");
  });
});
