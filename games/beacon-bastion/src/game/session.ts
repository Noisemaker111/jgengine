import type { PathFollowState } from "@jgengine/core/nav/pathFollow";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { BossState } from "@jgengine/core/ai/director/boss";
import type { Encounter } from "@jgengine/core/ai/director/encounter";
import type { PressurePlan } from "@jgengine/core/ai/director/pressure";
import { createAbilityKit, type AbilityKit } from "@jgengine/core/combat/abilityKit";
import { createRegenShield, type RegenShield } from "@jgengine/core/combat/regenShield";
import { createStatusRuntime, type StatusDef, type StatusRuntime } from "@jgengine/core/combat/statusRuntime";
import { createStats, type Stats } from "@jgengine/core/stats/statModifiers";
import { createEncounter } from "@jgengine/core/ai/director/encounter";
import { evaluatePressure } from "@jgengine/core/ai/director/pressure";
import { createWaveCountdown, type WaveCountdown } from "@jgengine/core/ai/director/waveCountdown";
import { seededRng } from "@jgengine/shell/gameKit";

import { ABILITIES } from "./combat/abilities";
import { DIRECTOR_SEED, ENCOUNTER } from "./waves/manifest";

export interface CreepRuntime {
  instanceId: string;
  catalogId: string;
  /** The approach this raider walks (`approach` or `flank`). */
  route: string;
  path: PathFollowState;
  speedStats: Stats<"speed">;
  /** A Bulwark's ward, backed by the entity's `shield` stat. */
  shield: RegenShield | null;
  /** Seconds until a Shaman's next mending. */
  healIn: number;
}

/** The boss on the field, if it is out: its instance, what it is, phase state, and the stance that phase sets. */
export interface BossRuntime {
  instanceId: string;
  unitId: string;
  state: BossState;
  stance: string;
}

/**
 * Raider conditions, run by the engine's status runtime: a burn that stacks, armor cracked by
 * ironshot, a freeze, and the brittleness a deep chill leaves behind.
 */
export const RAIDER_STATUSES: readonly StatusDef[] = [
  { id: "burn", stack: { kind: "stack", max: 3 }, durationMs: 3000, intervalMs: 500, magnitude: 0.5, effect: { kind: "damage", channel: "fire" } },
  { id: "sunder", stack: { kind: "stack", max: 3 }, durationMs: 5000, magnitude: 10, effect: { kind: "stat", stat: "armor_loss" } },
  { id: "freeze", stack: { kind: "refresh" }, durationMs: 1000 },
  { id: "brittle", stack: { kind: "refresh" }, durationMs: 1600, magnitude: 1, effect: { kind: "stat", stat: "brittle" } },
];

/**
 * The real-time half of a defense: the wave director, raiders mid-route and tower aim. Gold, lives,
 * plots, towers, builds and the run's flags live in the keep's world (`keep.ts`).
 */
export interface SessionState {
  /** The authored raider host and how far through it the run is. */
  encounter: Encounter;
  /** What the director read when the current wave opened, so the HUD can say how hard it is leaning. */
  pressure: PressurePlan;
  /** The clock to the next wave once one has arrived in full; calling early pays for what it skips. */
  countdown: WaveCountdown;
  /** The boss, once it walks. */
  boss: BossRuntime | null;
  /** Unit ids the open wave sent, pressure additions included, in entry order. */
  openingComposition: string[];
  creeps: Map<string, CreepRuntime>;
  /** Burns, cracked armor, freezes and brittleness on the raiders. */
  statuses: StatusRuntime;
  /** Beacon Fire and the Frost Bell. */
  abilities: AbilityKit;
  /** The ability waiting for a click on the field, if one is armed. */
  armedAbility: string | null;
  /** Beacon fires on their way down: they land after the telegraph, not when the click lands. */
  falling: { at: [number, number, number]; landsInMs: number }[];
  /** Seconds until each standing tower may fire again: aim state, not keep state. */
  towerCooldowns: Map<string, number>;
  /** Shots each tower has landed, for "every Nth shot" effects. */
  towerShots: Map<string, number>;
  /** The tower card picked in the build bar; local to this player's screen. */
  selectedTowerId: string | null;
  /** The placed tower whose sell/upgrade panel is open; set by clicking its plot. */
  inspectedTowerId: string | null;
  creepSeq: number;
}

function freshState(): SessionState {
  return {
    encounter: createEncounter({ definition: ENCOUNTER, seed: DIRECTOR_SEED }),
    pressure: evaluatePressure({ health: 1, progress: 0, elapsed: 0 }),
    countdown: createWaveCountdown({ intermission: 25, earlyBonus: { perSecond: 1.2, max: 40 } }),
    boss: null,
    openingComposition: [],
    creeps: new Map(),
    statuses: createStatusRuntime({ statuses: RAIDER_STATUSES, rng: seededRng(`beacon-bastion:status:${DIRECTOR_SEED}`) }),
    abilities: createAbilityKit(ABILITIES.map((ability) => ({ id: ability.id, cooldownMs: ability.cooldownMs, castType: ability.castType }))),
    armedAbility: null,
    falling: [],
    towerCooldowns: new Map(),
    towerShots: new Map(),
    selectedTowerId: null,
    inspectedTowerId: null,
    creepSeq: 0,
  };
}

export let session: SessionState = freshState();

export function resetSession(): void {
  session.statuses.dispose();
  session = freshState();
}

export function nextCreepInstanceId(): string {
  session.creepSeq += 1;
  return `creep-${session.creepSeq}`;
}

export function newSpeedStats(baseSpeed: number): Stats<"speed"> {
  return createStats<"speed">({ speed: baseSpeed });
}

/** A ward kept in the raider's own `shield` stat, so damage through the effect pipeline hits it first. */
export function newShield(ctx: GameContext, instanceId: string, spec: { max: number; regenPerSecond: number; regenDelayMs: number }): RegenShield {
  return createRegenShield({
    max: spec.max,
    regenPerSecond: spec.regenPerSecond,
    regenDelayMs: spec.regenDelayMs,
    pool: {
      current: () => ctx.scene.entity.stats.get(instanceId, "shield")?.current ?? 0,
      max: () => ctx.scene.entity.stats.get(instanceId, "shield")?.max ?? 0,
      set: (value) => {
        ctx.scene.entity.stats.set(instanceId, "shield", { current: value });
      },
    },
  });
}

/** Game clock in milliseconds — the unit `Stats` expiry (`expiresAtMs`) is written and read in. */
export function gameClockMs(ctx: GameContext): number {
  return ctx.time.now() * 1000;
}

export function currentWaveNumber(): number {
  return session.encounter.view().wave;
}

export function wavesComplete(): boolean {
  return session.encounter.view().done;
}

export function activeCreepCount(): number {
  return session.creeps.size;
}
