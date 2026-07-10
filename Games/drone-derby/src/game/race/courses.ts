import { raceTrack, type RaceTrack } from "@jgengine/core/game/race";

import { RING_POOL, SPAWN_XZ, type RingDef } from "./ringPool";

export type CourseId = "short" | "technical" | "endurance";

export interface CourseDef {
  id: CourseId;
  name: string;
  ringIds: readonly string[];
  clockCapSec: number;
  parGold: number;
  parSilver: number;
  parBronze: number;
}

const ALL_IDS = RING_POOL.map((ring) => ring.id);

function everyOther(ids: readonly string[]): readonly string[] {
  return ids.filter((_, index) => index % 2 === 0);
}

export const COURSES: Record<CourseId, CourseDef> = {
  short: {
    id: "short",
    name: "Harbor Sprint",
    ringIds: everyOther(ALL_IDS),
    clockCapSec: 150,
    parGold: 62,
    parSilver: 82,
    parBronze: 105,
  },
  technical: {
    id: "technical",
    name: "Container Maze",
    ringIds: ALL_IDS.slice(0, 12),
    clockCapSec: 220,
    parGold: 95,
    parSilver: 128,
    parBronze: 165,
  },
  endurance: {
    id: "endurance",
    name: "Full Circuit",
    ringIds: ALL_IDS.slice(0, 16),
    clockCapSec: 300,
    parGold: 132,
    parSilver: 178,
    parBronze: 228,
  },
};

export const COURSE_ORDER: readonly CourseId[] = ["short", "technical", "endurance"];

function ringById(id: string): RingDef {
  const ring = RING_POOL.find((entry) => entry.id === id);
  if (ring === undefined) throw new Error(`drone-derby: unknown ring id "${id}"`);
  return ring;
}

export function ringsForCourse(courseId: CourseId): readonly RingDef[] {
  return COURSES[courseId].ringIds.map(ringById);
}

export interface ResolvedCheckpoint {
  id: string;
  position: readonly [number, number, number];
  radius: number;
}

export function resolveCheckpoints(
  courseId: CourseId,
  groundHeightAt: (x: number, z: number) => number,
): readonly ResolvedCheckpoint[] {
  return ringsForCourse(courseId).map((ring) => ({
    id: ring.id,
    position: [ring.x, groundHeightAt(ring.x, ring.z) + ring.altitude, ring.z] as const,
    radius: ring.radius,
  }));
}

export function buildTrack(courseId: CourseId, groundHeightAt: (x: number, z: number) => number): RaceTrack {
  const checkpoints = resolveCheckpoints(courseId, groundHeightAt).map((checkpoint) => ({
    id: checkpoint.id,
    center: checkpoint.position,
    half: [checkpoint.radius, checkpoint.radius, checkpoint.radius] as const,
  }));
  return raceTrack({ checkpoints, laps: 1 });
}

export interface SpawnPose {
  position: readonly [number, number, number];
  heading: number;
}

export function spawnPoseFor(courseId: CourseId, groundHeightAt: (x: number, z: number) => number): SpawnPose {
  const first = ringsForCourse(courseId)[0]!;
  const [sx, sz] = SPAWN_XZ;
  const heading = Math.atan2(first.x - sx, first.z - sz);
  return { position: [sx, groundHeightAt(sx, sz) + 2, sz], heading };
}
