import type { BossPhase } from "@jgengine/core/ai/director/boss";
import type { EncounterDefinition, EncounterWave } from "@jgengine/core/ai/director/encounter";
import type { PressureRule } from "@jgengine/core/ai/director/pressure";

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

export interface BossProfile {
  /** Thresholds and tells, high to low. */
  phases: readonly BossPhase[];
  /** What each phase looks like on the approach: how fast it walks, what the HUD calls it, and what it calls up. */
  stance: Record<string, BossStance>;
  /** The banner text for a tell. */
  tells: Record<string, string>;
}

/**
 * The Warden's three phases. Thresholds and tells are engine data; what a phase *does* is this
 * game's stance table below, so the phase change is visible on the field.
 */
const WARDEN_PHASES: readonly BossPhase[] = [
  { id: "opening", atHealth: 1, behaviour: {}, tell: { id: "arrival", telegraphSeconds: 2.5 } },
  { id: "enraged", atHealth: 0.6, behaviour: {}, tell: { id: "roar", telegraphSeconds: 2.5 } },
  { id: "last-stand", atHealth: 0.25, behaviour: {}, tell: { id: "dig-in", telegraphSeconds: 2.5 } },
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
  { id: "opening", atHealth: 1, behaviour: {}, tell: { id: "arrival", telegraphSeconds: 3 } },
  { id: "enraged", atHealth: 0.65, behaviour: {}, tell: { id: "roar", telegraphSeconds: 2.5 } },
  { id: "last-stand", atHealth: 0.3, behaviour: {}, tell: { id: "dig-in", telegraphSeconds: 2 } },
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
