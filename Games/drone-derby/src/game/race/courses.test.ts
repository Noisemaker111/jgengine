import { describe, expect, test } from "bun:test";

import { buildTrack, COURSES, COURSE_ORDER, ringsForCourse, spawnPoseFor } from "./courses";
import { RING_POOL } from "./ringPool";

const flatGround = () => 0;

describe("course ring counts", () => {
  test("short/technical/endurance hit the brief's 8/12/16 budget", () => {
    expect(COURSES.short.ringIds.length).toBe(8);
    expect(COURSES.technical.ringIds.length).toBe(12);
    expect(COURSES.endurance.ringIds.length).toBe(16);
  });

  test("every course's ring ids are unique and resolve in the pool", () => {
    const poolIds = new Set(RING_POOL.map((ring) => ring.id));
    for (const courseId of COURSE_ORDER) {
      const ids = COURSES[courseId].ringIds;
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(poolIds.has(id)).toBe(true);
    }
  });
});

describe("medal par ordering", () => {
  test("gold is strictly faster than silver, silver than bronze, bronze than the clock cap", () => {
    for (const courseId of COURSE_ORDER) {
      const course = COURSES[courseId];
      expect(course.parGold).toBeLessThan(course.parSilver);
      expect(course.parSilver).toBeLessThan(course.parBronze);
      expect(course.parBronze).toBeLessThan(course.clockCapSec);
    }
  });
});

describe("buildTrack", () => {
  test("produces one checkpoint per ring, in course order, with real altitude", () => {
    const track = buildTrack("technical", flatGround);
    expect(track.checkpoints.length).toBe(COURSES.technical.ringIds.length);
    expect(track.checkpoints.map((cp) => cp.id)).toEqual(COURSES.technical.ringIds);
    for (const checkpoint of track.checkpoints) expect(checkpoint.center[1]).toBeGreaterThan(0);
  });

  test("ring altitude offsets by the resolved ground height", () => {
    const groundAt10 = (x: number, z: number) => (x === 0 && z === 45 ? 10 : 0);
    const track = buildTrack("short", groundAt10);
    const first = track.checkpoints[0]!;
    const ring = ringsForCourse("short")[0]!;
    expect(first.center[1]).toBe(10 + ring.altitude);
  });
});

describe("spawnPoseFor", () => {
  test("spawns near the origin, facing toward the course's first ring", () => {
    for (const courseId of COURSE_ORDER) {
      const spawn = spawnPoseFor(courseId, flatGround);
      const first = ringsForCourse(courseId)[0]!;
      const expectedHeading = Math.atan2(first.x - spawn.position[0], first.z - spawn.position[2]);
      expect(spawn.heading).toBeCloseTo(expectedHeading, 5);
    }
  });
});
