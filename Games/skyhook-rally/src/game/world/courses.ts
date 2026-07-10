import type { Checkpoint } from "@jgengine/core/game/race";

import { RING_HALF_EXTENT, STREAK_BONUS_CAP_SECONDS, STREAK_BONUS_PER_TRUE_SWING } from "../physics/constants";
import type { Archipelago, Islet, Pylon } from "./archipelago";

export type CourseKind = "loop" | "climb" | "descent";
export type Medal = "gold" | "silver" | "bronze" | "none";

export interface MedalThresholds {
  gold: number;
  silver: number;
  bronze: number;
}

export interface CourseDef {
  id: string;
  name: string;
  kind: CourseKind;
  tagline: string;
  checkpoints: readonly Checkpoint[];
  pylonIds: readonly string[];
  parSeconds: number;
  totalTimeCapSeconds: number;
  medals: MedalThresholds;
}

const AVG_SPEED = 15;
const SWING_OVERHEAD_SECONDS = 2.4;
const RING_HALF: readonly [number, number, number] = [RING_HALF_EXTENT, RING_HALF_EXTENT, RING_HALF_EXTENT];

function pylonForIslet(pylons: readonly Pylon[], isletId: string): Pylon {
  const pylon = pylons.find((p) => p.isletId === isletId);
  if (pylon === undefined) throw new Error(`courses: no pylon for islet ${isletId}`);
  return pylon;
}

function toCheckpoint(pylon: Pylon, index: number): Checkpoint {
  return { id: `${pylon.id}#${index}`, center: [pylon.base.x, pylon.ringY, pylon.base.z], half: RING_HALF };
}

function evenSample<T>(items: readonly T[], count: number): T[] {
  if (items.length === 0 || count <= 0) return [];
  const out: T[] = [];
  for (let i = 0; i < count; i += 1) {
    const idx = count === 1 ? 0 : Math.round((i / (count - 1)) * (items.length - 1));
    out.push(items[idx]!);
  }
  return out;
}

function courseDistance(pylons: readonly Pylon[]): number {
  let total = 0;
  for (let i = 1; i < pylons.length; i += 1) {
    const a = pylons[i - 1]!;
    const b = pylons[i]!;
    total += Math.hypot(b.base.x - a.base.x, b.ringY - a.ringY, b.base.z - a.base.z);
  }
  return total;
}

function buildCourse(
  id: string,
  name: string,
  tagline: string,
  kind: CourseKind,
  islets: readonly Islet[],
  pylons: readonly Pylon[],
): CourseDef {
  const pylonSeq = islets.map((islet) => pylonForIslet(pylons, islet.id));
  const checkpoints = pylonSeq.map((pylon, index) => toCheckpoint(pylon, index));
  const distance = courseDistance(pylonSeq);
  const parSeconds = Math.max(20, Math.round(distance / AVG_SPEED + pylonSeq.length * SWING_OVERHEAD_SECONDS));
  return {
    id,
    name,
    kind,
    tagline,
    checkpoints,
    pylonIds: pylonSeq.map((p) => p.id),
    parSeconds,
    totalTimeCapSeconds: Math.round(parSeconds * 2.4),
    medals: { gold: parSeconds, silver: Math.round(parSeconds * 1.15), bronze: Math.round(parSeconds * 1.35) },
  };
}

/** Three authored routes over one seeded archipelago: a loop back near the start, a strictly-ascending climb, and a strictly-descending run. */
export function buildCourses(archipelago: Archipelago): CourseDef[] {
  const { islets, pylons } = archipelago;
  const byHeightAsc = [...islets].sort((a, b) => a.position.y - b.position.y);
  const loopBase = evenSample(islets.slice(0, islets.length - 1), 7);
  const loopIslets = [...loopBase, islets[0]!];
  const climbIslets = evenSample(byHeightAsc, 12);
  const descentIslets = evenSample([...byHeightAsc].reverse(), 10);
  return [
    buildCourse("sunrise-loop", "Sunrise Loop", "Out along the low islets and back to the mail-hut you started at.", "loop", loopIslets, pylons),
    buildCourse("high-climb", "High Climb", "Straight up the chain, checkpoint by checkpoint, into thin brass air.", "climb", climbIslets, pylons),
    buildCourse("long-descent", "Long Descent", "From the highest mast down to the dawn-lit water line.", "descent", descentIslets, pylons),
  ];
}

export function medalFor(course: CourseDef, effectiveSeconds: number): Medal {
  if (effectiveSeconds <= course.medals.gold) return "gold";
  if (effectiveSeconds <= course.medals.silver) return "silver";
  if (effectiveSeconds <= course.medals.bronze) return "bronze";
  return "none";
}

export function streakBonusSeconds(streak: number): number {
  return Math.min(streak * STREAK_BONUS_PER_TRUE_SWING, STREAK_BONUS_CAP_SECONDS);
}
