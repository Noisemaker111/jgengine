import { crossThresholds } from "@jgengine/core/threshold/thresholds";
import type { EncounterDefinition, EncounterWave } from "@jgengine/core/waves/encounter";
import type { PressureRule } from "@jgengine/core/waves/pressure";

import { FLANK_POINT_KEY, SPAWN_POINT_KEY } from "../world/path";
import { COMPOSE_FROM_WAVE, composeWaves } from "./composer";

export { COMPOSE_FROM_WAVE } from "./composer";

/**
 * The raider host, authored as data. Each wave names its composition, the approach it uses, and the
 * second each group walks on; `escalates` marks the groups the director may thicken when the keep is
 * hurting. Nothing here spawns anything — `waves/director.ts` turns orders into creeps.
 */
export const AUTHORED_WAVES: readonly EncounterWave[] = [
  {
    id: "probe",
    label: "Probe",
    durationSeconds: 20,
    groups: [
      { unit: "raider_scout", entry: SPAWN_POINT_KEY, count: 5 },
      { unit: "raider_grunt", entry: SPAWN_POINT_KEY, count: 2, at: 6 },
    ],
  },
  {
    id: "press",
    label: "Press",
    durationSeconds: 20,
    groups: [
      { unit: "raider_scout", entry: SPAWN_POINT_KEY, count: 5 },
      { unit: "raider_grunt", entry: SPAWN_POINT_KEY, count: 4, at: 4, escalates: true },
      // The first wraiths: a shell can't reach them, so a cannon-only road learns it here.
      { unit: "raider_wraith", entry: SPAWN_POINT_KEY, count: 3, at: 11 },
    ],
  },
  {
    id: "breakers",
    label: "Breakers",
    durationSeconds: 22,
    groups: [
      { unit: "raider_scout", entry: SPAWN_POINT_KEY, count: 3 },
      { unit: "raider_grunt", entry: SPAWN_POINT_KEY, count: 4, at: 3, escalates: true },
      // The flank track opens: a squad that skips most of the main road.
      { unit: "raider_scout", entry: FLANK_POINT_KEY, count: 3, at: 7 },
      { unit: "raider_elite", entry: SPAWN_POINT_KEY, count: 1, at: 9, escalates: true },
      { unit: "raider_hulk", entry: SPAWN_POINT_KEY, count: 1, at: 14 },
    ],
  },
  {
    id: "wardens-shield",
    label: "Shield Wall",
    durationSeconds: 22,
    groups: [
      { unit: "raider_grunt", entry: SPAWN_POINT_KEY, count: 6, escalates: true },
      { unit: "raider_bulwark", entry: SPAWN_POINT_KEY, count: 2, at: 5 },
      { unit: "raider_shaman", entry: SPAWN_POINT_KEY, count: 1, at: 7 },
      { unit: "raider_wraith", entry: FLANK_POINT_KEY, count: 3, at: 10 },
      { unit: "raider_brute", entry: SPAWN_POINT_KEY, count: 2, at: 12 },
    ],
  },
  {
    id: "tide",
    label: "Barrow Tide",
    durationSeconds: 24,
    groups: [
      { unit: "raider_grunt", entry: SPAWN_POINT_KEY, count: 6, escalates: true },
      { unit: "raider_elite", entry: SPAWN_POINT_KEY, count: 3, at: 4, escalates: true },
      { unit: "raider_shaman", entry: SPAWN_POINT_KEY, count: 2, at: 6 },
      { unit: "raider_wraith", entry: FLANK_POINT_KEY, count: 5, at: 8 },
      { unit: "raider_hulk", entry: SPAWN_POINT_KEY, count: 2, at: 12 },
      { unit: "raider_elite", entry: SPAWN_POINT_KEY, count: 2, at: 15, elite: true },
    ],
  },
  {
    id: "warden",
    label: "The Warden",
    durationSeconds: 26,
    groups: [
      { unit: "raider_grunt", entry: SPAWN_POINT_KEY, count: 4, escalates: true },
      { unit: "raider_bulwark", entry: SPAWN_POINT_KEY, count: 2, at: 4 },
      { unit: "raider_wraith", entry: FLANK_POINT_KEY, count: 4, at: 6 },
      { unit: "raider_warden", entry: SPAWN_POINT_KEY, count: 1, at: 10 },
    ],
  },
];

export const DIRECTOR_SEED = 1337;

/** One defense runs this many waves: six authored, the rest composed from the seed. */
export const TOTAL_WAVES = 12;

/** The authored act plus the composed one, as one definition the director already knows how to run. */
export const ENCOUNTER: EncounterDefinition = {
  id: "beacon-bastion",
  waves: [...AUTHORED_WAVES, ...composeWaves(DIRECTOR_SEED, TOTAL_WAVES)],
};

/** The Warden's id in the creep catalog, and the entity it becomes. */
export const WARDEN_ID = "raider_warden";

/**
 * How hard the director leans on a hurting keep. Player health, wave progress and time each weigh
 * in; `maxTier` 2 caps the whole plan, so a nearly-dead keep on a long match still sends tier 2.
 */
export const PRESSURE_RULE: PressureRule = {
  healthWeight: 1,
  progressWeight: 1,
  timeWeight: 0.4,
  timeFloorSeconds: 120,
  timeWindowSeconds: 480,
  maxTier: 2,
};

/** One phase's stance: its pace and name, a ward it raises and an escort it calls when the phase opens. */
export interface BossStance {
  speedScale: number;
  label: string;
  ward?: number;
  summon?: readonly { unit: string; count: number }[];
}

/** The warning a boss gives as a phase opens, and how long the player has to read it. */
export interface BossTell {
  /** The key into the profile's `tells` table. */
  id: string;
  /** Seconds the tell stays up. */
  telegraphSeconds: number;
}

/** One authored phase: the health it starts at and the tell that announces it. */
export interface BossPhase {
  id: string;
  /** Health fraction at or below which this phase is in effect, `0..1`. The opening phase is `1`. */
  atHealth: number;
  tell: BossTell;
}

/** Which phase a boss holds, the tell still showing and how long it has left. */
export interface BossPhaseState {
  /** Id of the phase in effect. */
  phaseId: string;
  /** Tell still showing, or null. */
  tellId: string | null;
  /** Seconds left on the showing tell. */
  tellRemaining: number;
}

/** One step of a boss's clock. */
export interface BossPhaseStep {
  state: BossPhaseState;
  /** The phase in effect after the step. */
  phase: BossPhase;
  /** True on the step the phase changed. */
  changed: boolean;
  /** The tell to fire now, or null. Only set on a change, so a caller never replays a tell. */
  tell: BossTell | null;
}

export interface BossProfile {
  /** Thresholds and tells, high to low. */
  phases: readonly BossPhase[];
  /** What each phase looks like on the approach: how fast it walks, what the HUD calls it, and what it calls up. */
  stance: Record<string, BossStance>;
  /** The banner text for a tell. */
  tells: Record<string, string>;
}

/** Fresh phase state for a phase list, opening in the first phase with no tell showing. */
export function createBossPhaseState(phases: readonly BossPhase[]): BossPhaseState {
  const opening = phases[0];
  if (opening === undefined) throw new Error("a boss needs at least one phase");
  return { phaseId: opening.id, tellId: null, tellRemaining: 0 };
}

/** The phase a boss fights in at a health fraction: the health it has lost puts it on a rung, and it never falls back one. */
export function bossPhaseAt(phases: readonly BossPhase[], held: string, health: number): BossPhase {
  const value = Number.isFinite(health) ? Math.max(0, Math.min(1, health)) : 1;
  const steps = phases.map((phase, index) => ({ id: index, at: phase.atHealth }));
  const crossed = crossThresholds(steps, 1, value, { inclusive: false });
  const deepest = crossed[crossed.length - 1];
  const heldIndex = phases.findIndex((phase) => phase.id === held);
  const phase = phases[Math.max(0, heldIndex, deepest === undefined ? 0 : deepest.id)] ?? phases[0];
  if (phase === undefined) throw new Error("a boss needs at least one phase");
  return phase;
}

/**
 * Advance a boss by `dt` at a health fraction. A phase changes when health reaches its threshold and
 * changes *behaviour with it* (the stance and escort the profile gives that phase), announced by a
 * tell the player has time to answer. Phase order is monotone, so a heal does not rewind the boss and
 * a caller cannot stack tells by re-entering the same threshold.
 */
export function advanceBossPhase(phases: readonly BossPhase[], state: BossPhaseState, health: number, dt: number): BossPhaseStep {
  const phase = bossPhaseAt(phases, state.phaseId, health);
  if (phase.id !== state.phaseId) {
    return { state: { phaseId: phase.id, tellId: phase.tell.id, tellRemaining: phase.tell.telegraphSeconds }, phase, changed: true, tell: phase.tell };
  }
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const tellRemaining = Math.max(0, state.tellRemaining - step);
  return { state: { phaseId: phase.id, tellId: tellRemaining <= 0 ? null : state.tellId, tellRemaining }, phase, changed: false, tell: null };
}

/**
 * The Warden's three phases. The health each starts at is what its clock reads; what a phase *does* is
 * this game's stance table below, so the phase change is visible on the field.
 */
const WARDEN_PHASES: readonly BossPhase[] = [
  { id: "opening", atHealth: 1, tell: { id: "arrival", telegraphSeconds: 2.5 } },
  { id: "enraged", atHealth: 0.6, tell: { id: "roar", telegraphSeconds: 2.5 } },
  { id: "last-stand", atHealth: 0.25, tell: { id: "dig-in", telegraphSeconds: 2.5 } },
];

const WARDEN_STANCE: Record<string, BossStance> = {
  opening: { speedScale: 1, label: "Opening" },
  // Enraged, the Warden raises a ward that soaks 200 before the blows reach it again.
  enraged: { speedScale: 1.35, label: "Warded", ward: 200 },
  "last-stand": { speedScale: 1.8, label: "Last Stand", summon: [{ unit: "raider_bulwark", count: 2 }] },
};

const WARDEN_TELL_TEXT: Record<string, string> = {
  arrival: "The Warden takes the field",
  roar: "The Warden raises a ward — break it",
  "dig-in": "The Warden makes its last stand and calls its shield-bearers",
};

/** The composed boss: slower to anger, faster once it does, and it digs in earlier. */
const WARLORD_PHASES: readonly BossPhase[] = [
  { id: "opening", atHealth: 1, tell: { id: "arrival", telegraphSeconds: 3 } },
  { id: "enraged", atHealth: 0.65, tell: { id: "roar", telegraphSeconds: 2.5 } },
  { id: "last-stand", atHealth: 0.3, tell: { id: "dig-in", telegraphSeconds: 2 } },
];

const WARLORD_STANCE: Record<string, BossStance> = {
  opening: { speedScale: 1, label: "Opening" },
  enraged: { speedScale: 1.35, label: "Bloodied", summon: [{ unit: "raider_grunt", count: 4 }] },
  "last-stand": { speedScale: 1.8, label: "Cornered", summon: [{ unit: "raider_boneling", count: 5 }] },
};

const WARLORD_TELL_TEXT: Record<string, string> = {
  arrival: "The Warlord takes the field",
  roar: "The Warlord is bloodied and calls its guard",
  "dig-in": "The Warlord is cornered — nothing left to lose",
};

/** Every raider that walks with a phase table. A boss is a catalog entry plus one of these. */
export const BOSS_PROFILES: Record<string, BossProfile> = {
  raider_warden: { phases: WARDEN_PHASES, stance: WARDEN_STANCE, tells: WARDEN_TELL_TEXT },
  raider_warlord: { phases: WARLORD_PHASES, stance: WARLORD_STANCE, tells: WARLORD_TELL_TEXT },
};

export function bossProfile(unit: string): BossProfile | null {
  return BOSS_PROFILES[unit] ?? null;
}
