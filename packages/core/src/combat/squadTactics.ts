import type { PerceptionService } from "../sensor/perception";
import type { CoverThreat, CoverWeights } from "./cover";

/**
 * Fire discipline: how long a member stays down between shots, how long it leans out, and how fast
 * it fires while it has a target. A role that peeks for longer holds an angle better and spends more
 * time in the open — the trade is the caller's to tune.
 */
export interface FireDiscipline {
  /** Seconds held in cover between peeks. Default `1.6`. */
  holdSeconds?: number;
  /** Seconds exposed while shooting. Default `0.8`. */
  peekSeconds?: number;
  /** How far toward the threat a peek steps out of cover. Default `0.9`. */
  peekDistance?: number;
  /** Seconds between shots while a target is visible. Default `0.7`. */
  fireInterval?: number;
}

/**
 * One caller-defined squad role. The engine ships the machinery and no role list: a game names its
 * own roles and dials them, so `"assault"`, `"breacher"` and `"sniper"` are content, not engine
 * concepts.
 */
export interface SquadRole {
  /** Id the game names and its HUD, logs and tests read. */
  id: string;
  /** Members this role takes when a squad is assigned. Default `1`. */
  count?: number;
  /** Distance from the threat this role wants to fight at, world units. Default `6`. */
  preferredRange?: number;
  /** Angle around the threat this role attacks from, radians off the squad's line. Default `0`. */
  flankAngle?: number;
  /** Health fraction at or below which this role falls back. Default `0` (never). */
  retreatBelow?: number;
  /** True when the role holds its point instead of closing to `preferredRange`. Default `false`. */
  holdCover?: boolean;
  discipline?: FireDiscipline;
  /** Cover weights this role scores with; omitted fields take the shared defaults. */
  cover?: CoverWeights;
}

/** A squad's roles in assignment order. */
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
  /** Whose senses produced the fact: this member's own id, or the squadmate that shared it. */
  readonly sourceId: string;
}

/** Bounds for {@link threatsFromMemory}. */
export interface ThreatReadOptions {
  /** Most threats to return, strongest first. Default `6`. */
  max?: number;
  /** Memories weaker than this are ignored. Default `0.05`. */
  minConfidence?: number;
  /** Only these ids count as hostile; omit to treat every remembered id as a threat. */
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
