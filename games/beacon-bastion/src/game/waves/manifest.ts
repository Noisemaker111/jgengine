import type { PhaseLike } from "@jgengine/core/ai/phaseLadder";
import type { EncounterDefinition, EncounterWave } from "@jgengine/core/waves/encounter";
import type { PressureRule } from "@jgengine/core/waves/pressure";

import { FLANK_POINT_KEY, SPAWN_POINT_KEY } from "../world/path";
import { COMPOSE_FROM_WAVE, COMPOSE_TO_WAVE, composeWaves } from "./composer";

export { COMPOSE_FROM_WAVE, COMPOSE_TO_WAVE } from "./composer";

/**
 * The march of technology, authored as data. Each wave names its composition, the road it takes,
 * and the second each group rolls on; `escalates` marks the groups the director may thicken when
 * the town is losing focus. The ramp: gadgets, then the smart home, then surveillance and delivery,
 * then the server room. Nothing here spawns anything — `waves/director.ts` turns orders into tech.
 */
export const AUTHORED_WAVES: readonly EncounterWave[] = [
  {
    id: "push-notifications",
    label: "Push Notifications",
    durationSeconds: 20,
    groups: [
      { unit: "tech_earbuds", entry: SPAWN_POINT_KEY, count: 6 },
      { unit: "tech_phone", entry: SPAWN_POINT_KEY, count: 3, at: 6 },
    ],
  },
  {
    id: "wearables",
    label: "Wearables",
    durationSeconds: 20,
    groups: [
      { unit: "tech_earbuds", entry: SPAWN_POINT_KEY, count: 6 },
      { unit: "tech_watch", entry: SPAWN_POINT_KEY, count: 4, at: 4 },
      { unit: "tech_phone", entry: SPAWN_POINT_KEY, count: 4, at: 8, escalates: true },
      // The first flyers: a barista can't reach them, so a coffee-only street learns it here.
      { unit: "tech_drone", entry: SPAWN_POINT_KEY, count: 2, at: 12 },
    ],
  },
  {
    id: "smart-home",
    label: "Smart Home",
    durationSeconds: 22,
    groups: [
      { unit: "tech_phone", entry: SPAWN_POINT_KEY, count: 5, escalates: true },
      { unit: "tech_speaker", entry: SPAWN_POINT_KEY, count: 2, at: 4 },
      // The side street opens: a squad that skips most of Main Street.
      { unit: "tech_earbuds", entry: FLANK_POINT_KEY, count: 4, at: 7 },
      { unit: "tech_vacuum", entry: SPAWN_POINT_KEY, count: 2, at: 10, escalates: true },
      { unit: "tech_watch", entry: SPAWN_POINT_KEY, count: 4, at: 14 },
    ],
  },
  {
    id: "surveillance",
    label: "Surveillance",
    durationSeconds: 22,
    groups: [
      { unit: "tech_flock", entry: SPAWN_POINT_KEY, count: 1 },
      { unit: "tech_phone", entry: SPAWN_POINT_KEY, count: 6, at: 2, escalates: true },
      { unit: "tech_drone", entry: FLANK_POINT_KEY, count: 3, at: 7 },
      { unit: "tech_fridge", entry: SPAWN_POINT_KEY, count: 1, at: 10 },
      { unit: "tech_scooter", entry: SPAWN_POINT_KEY, count: 3, at: 13 },
    ],
  },
  {
    id: "same-day-delivery",
    label: "Same-Day Delivery",
    durationSeconds: 24,
    groups: [
      { unit: "tech_phone", entry: SPAWN_POINT_KEY, count: 6, escalates: true },
      { unit: "tech_router", entry: SPAWN_POINT_KEY, count: 1, at: 4 },
      { unit: "tech_fridge", entry: SPAWN_POINT_KEY, count: 2, at: 6 },
      { unit: "tech_drone", entry: FLANK_POINT_KEY, count: 3, at: 8 },
      { unit: "tech_drone", entry: SPAWN_POINT_KEY, count: 2, at: 10 },
      { unit: "tech_speaker", entry: SPAWN_POINT_KEY, count: 2, at: 12 },
      { unit: "tech_vacuum", entry: SPAWN_POINT_KEY, count: 3, at: 15 },
    ],
  },
  {
    id: "server-room",
    label: "The Server Room",
    durationSeconds: 26,
    groups: [
      { unit: "tech_phone", entry: SPAWN_POINT_KEY, count: 5, escalates: true },
      { unit: "tech_vacuum", entry: SPAWN_POINT_KEY, count: 2, at: 4 },
      { unit: "tech_drone", entry: FLANK_POINT_KEY, count: 4, at: 6 },
      { unit: "tech_server", entry: SPAWN_POINT_KEY, count: 1, at: 10 },
    ],
  },
];

/** The last wave: the Data Center itself, with an escort, then whatever it migrates into. */
export const FINALE: EncounterWave = {
  id: "the-data-center",
  label: "THE DATA CENTER",
  durationSeconds: 30,
  groups: [
    { unit: "tech_phone", entry: SPAWN_POINT_KEY, count: 8, escalates: true },
    { unit: "tech_router", entry: SPAWN_POINT_KEY, count: 2, at: 3 },
    { unit: "tech_gpu", entry: SPAWN_POINT_KEY, count: 2, at: 5 },
    { unit: "tech_drone", entry: FLANK_POINT_KEY, count: 6, at: 7 },
    { unit: "tech_chatbot", entry: SPAWN_POINT_KEY, count: 2, at: 9 },
    { unit: "boss_datacenter", entry: SPAWN_POINT_KEY, count: 1, at: 12 },
  ],
};

export const DIRECTOR_SEED = 1337;

/** One day runs this many waves: six authored, five composed from the seed, and the finale. */
export const TOTAL_WAVES = 12;

/** The authored act, the composed one and the finale, as one definition the director already knows how to run. */
export const ENCOUNTER: EncounterDefinition = {
  id: "beacon-bastion",
  waves: [...AUTHORED_WAVES, ...composeWaves(DIRECTOR_SEED, COMPOSE_TO_WAVE), FINALE],
};

/** The server rack's id in the tech catalog: the authored act's miniboss. */
export const MINIBOSS_ID = "tech_server";
/** The final boss and the form it migrates into. */
export const FINAL_BOSS_ID = "boss_datacenter";
export const CLOUD_ID = "boss_cloud";

/**
 * How hard the director leans on a town losing focus. Attention, wave progress and time each weigh
 * in; `maxTier` 2 caps the whole plan.
 */
export const PRESSURE_RULE: PressureRule = {
  healthWeight: 1,
  progressWeight: 1,
  timeWeight: 0.4,
  timeFloorSeconds: 120,
  timeWindowSeconds: 480,
  maxTier: 2,
};

/** One phase's stance: its pace and name, a shield it raises and an escort it calls when the phase opens. */
export interface BossStance {
  speedScale: number;
  label: string;
  ward?: number;
  summon?: readonly { unit: string; count: number }[];
}

export interface BossProfile {
  /** Cut points and tells, high to low. */
  phases: readonly PhaseLike[];
  /** What each phase looks like on the street: how fast it rolls, what the HUD calls it, and what it calls up. */
  stance: Record<string, BossStance>;
  /** The banner text for a tell. */
  tells: Record<string, string>;
}

const SERVER_PHASES: readonly PhaseLike[] = [
  { id: "opening", at: 1, tell: { id: "arrival", seconds: 3 } },
  { id: "enraged", at: 0.5, tell: { id: "overclock", seconds: 2.5 } },
];

const SERVER_STANCE: Record<string, BossStance> = {
  opening: { speedScale: 1, label: "Online" },
  enraged: { speedScale: 1.3, label: "Overclocked", ward: 150, summon: [{ unit: "tech_backup", count: 3 }] },
};

const SERVER_TELL_TEXT: Record<string, string> = {
  arrival: "A SERVER RACK rolls in — park an Electrician near it to stop its backups",
  overclock: "The server rack overclocks and raises a firewall — break it",
};

const DATACENTER_PHASES: readonly PhaseLike[] = [
  { id: "opening", at: 1, tell: { id: "arrival", seconds: 4 } },
  { id: "overload", at: 0.55, tell: { id: "overload", seconds: 3 } },
  { id: "last-stand", at: 0.2, tell: { id: "brownout", seconds: 2.5 } },
];

const DATACENTER_STANCE: Record<string, BossStance> = {
  opening: { speedScale: 1, label: "On mains power" },
  overload: { speedScale: 1.15, label: "Overloaded", summon: [{ unit: "tech_drone", count: 3 }, { unit: "tech_gpu", count: 1 }] },
  "last-stand": { speedScale: 1.4, label: "Brownout", summon: [{ unit: "tech_phone", count: 4 }] },
};

const DATACENTER_TELL_TEXT: Record<string, string> = {
  arrival: "THE DATA CENTER is coming — Electricians must cut its power",
  overload: "The Data Center overloads and launches its delivery fleet",
  brownout: "The Data Center browns out — it's trying to escape to the cloud!",
};

const CLOUD_PHASES: readonly PhaseLike[] = [
  { id: "opening", at: 1, tell: { id: "arrival", seconds: 3.5 } },
  { id: "storm", at: 0.5, tell: { id: "storm", seconds: 2.5 } },
];

const CLOUD_STANCE: Record<string, BossStance> = {
  opening: { speedScale: 1, label: "Migrating" },
  storm: { speedScale: 1.25, label: "Data Storm", summon: [{ unit: "tech_drone", count: 4 }] },
};

const CLOUD_TELL_TEXT: Record<string, string> = {
  arrival: "It migrated to THE CLOUD! It flies — only workers who reach the air can touch it",
  storm: "The Cloud whips up a data storm of drones",
};

/** Every piece of tech that rolls with a phase table. A boss is a catalog entry plus one of these. */
export const BOSS_PROFILES: Record<string, BossProfile> = {
  tech_server: { phases: SERVER_PHASES, stance: SERVER_STANCE, tells: SERVER_TELL_TEXT },
  boss_datacenter: { phases: DATACENTER_PHASES, stance: DATACENTER_STANCE, tells: DATACENTER_TELL_TEXT },
  boss_cloud: { phases: CLOUD_PHASES, stance: CLOUD_STANCE, tells: CLOUD_TELL_TEXT },
};

export function bossProfile(unit: string): BossProfile | null {
  return BOSS_PROFILES[unit] ?? null;
}
