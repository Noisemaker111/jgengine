import type { PerceptionService } from "../sensor/perception";
import type { CoverThreat, CoverWeights } from "./cover";

export interface FireDiscipline {
  /** Seconds held in cover between peeks. Default `1.6`. */
  holdSeconds?: number;
  /** Seconds exposed while shooting. Default `0.8`. */
  peekSeconds?: number;
  peekDistance?: number;
  /** Seconds between shots while a target is visible. Default `0.7`. */
  fireInterval?: number;
}

export interface SquadRole {
  id: string;
  count?: number;
  preferredRange?: number;
  /** Angle around the threat this role attacks from, radians off the squad's line. Default `0`. */
  flankAngle?: number;
  /** Health fraction at or below which this role falls back. Default `0` (never). */
  retreatBelow?: number;
  /** True when the role holds its point instead of closing to `preferredRange`. Default `false`. */
  holdCover?: boolean;
  discipline?: FireDiscipline;
  cover?: CoverWeights;
}

export interface SquadComposition {
  readonly roles: readonly SquadRole[];
}

/**
 * Deterministic role per member: declared order, `count` copies of each role, and the list repeats
 * when the squad is larger than the composition. Same members and composition give the same answer
 * on every host and after a reload.
 *
 * @capability squad-roles deterministic role assignment over a caller-authored composition
 */
export function assignSquadRoles(members: readonly string[], composition: SquadComposition): Map<string, SquadRole> {
  const slots: SquadRole[] = [];
  for (const role of composition.roles) {
    const count = Math.max(0, Math.floor(role.count ?? 1));
    for (let i = 0; i < count; i += 1) slots.push(role);
  }
  const assigned = new Map<string, SquadRole>();
  if (slots.length === 0) return assigned;
  for (let i = 0; i < members.length; i += 1) assigned.set(members[i]!, slots[i % slots.length]!);
  return assigned;
}

/** One remembered enemy with its age, so a role can treat a stale sighting differently. */
export interface ThreatReading extends CoverThreat {
  readonly ageSeconds: number;
  readonly sourceId: string;
}

export interface ThreatReadOptions {
  max?: number;
  minConfidence?: number;
  hostile?: (targetId: string) => boolean;
}

/**
 * Read one member's threat list out of its perception memory — the only source of threat. Sorted by
 * confidence, then recency, then id, and bounded by `max`, so a crowded memory cannot grow the tick.
 *
 * @capability threats-from-memory turn perception memory into a bounded, ranked threat list
 */
export function threatsFromMemory(
  perception: PerceptionService,
  observerId: string,
  nowMs: number,
  options: ThreatReadOptions = {},
): ThreatReading[] {
  const minConfidence = options.minConfidence ?? 0.05;
  const max = Math.max(0, Math.floor(options.max ?? 6));
  const out: ThreatReading[] = [];
  for (const memory of perception.memory(observerId)) {
    if (memory.confidence < minConfidence) continue;
    if (options.hostile !== undefined && !options.hostile(memory.targetId)) continue;
    out.push({
      id: memory.targetId,
      position: memory.lastKnownPos,
      confidence: memory.confidence,
      ageSeconds: Math.max(0, nowMs - memory.lastSeenAt) / 1000,
      sourceId: memory.sourceId,
    });
  }
  out.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      a.ageSeconds - b.ageSeconds ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return out.slice(0, max);
}
