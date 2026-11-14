import type { PathFollowState } from "@jgengine/core/nav/pathFollow";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PhaseClockState } from "@jgengine/core/ai/phaseLadder";
import type { Encounter } from "@jgengine/core/waves/encounter";
import type { PressurePlan } from "@jgengine/core/waves/pressure";
import { createAbilityKit, type AbilityKit } from "@jgengine/core/combat/abilityKit";
import { createRegenShield, type RegenShield } from "@jgengine/core/combat/regenShield";
import { createStatusRuntime, type StatusDef, type StatusRuntime } from "@jgengine/core/combat/statusRuntime";
import { createStats, type Stats } from "@jgengine/core/stats/statModifiers";
import { createEncounter } from "@jgengine/core/waves/encounter";
import { evaluatePressure } from "@jgengine/core/waves/pressure";
import { createWaveCountdown, type WaveCountdown } from "@jgengine/core/waves/waveCountdown";
import { seededRng } from "@jgengine/shell/gameKit";

import { ABILITIES } from "./combat/abilities";
import { DIRECTOR_SEED, ENCOUNTER } from "./waves/manifest";

export interface CreepRuntime {
  instanceId: string;
  catalogId: string;
  /** The road this tech rolls down (`approach` or `flank`). */
  route: string;
  path: PathFollowState;
  speedStats: Stats<"speed">;
  /** A smart fridge's frost-free shield, backed by the entity's `shield` stat. */
  shield: RegenShield | null;
  /** Seconds until a router's next patch. */
  healIn: number;
  /** Seconds until its next notification, camera spot, backup or spawn. */
  notifyIn: number;
  /** Seconds it has been on the street (a mining rig's bounty grows with it). */
  alive: number;
  /** A drone has already dropped its parcel. */
  dropped: boolean;
  /** "Installing Update...": seconds left while it stands still, then it comes out armored. */
  installing: number;
  /** It finished an update: extra armor until an IT Guy wipes it. */
  updated: boolean;
  /** A data center's mains power left; null for tech that runs on batteries. */
  power: number | null;
}

/** The boss on the field, if it is out: its instance, what it is, phase state, and the stance that phase sets. */
export interface BossRuntime {
  instanceId: string;
  unitId: string;
  state: PhaseClockState;
  stance: string;
}

/**
 * Tech conditions, run by the engine's status runtime: a scald that stacks, armor crushed by a
 * jackhammer, a freeze (a Cease and Desist, a stun), brittleness, and Wet, which a live wire loves.
 */
export const RAIDER_STATUSES: readonly StatusDef[] = [
  { id: "burn", stack: { kind: "stack", max: 3 }, durationMs: 3000, intervalMs: 500, magnitude: 0.5, effect: { kind: "damage", channel: "fire" } },
  { id: "sunder", stack: { kind: "stack", max: 3 }, durationMs: 5000, magnitude: 10, effect: { kind: "stat", stat: "armor_loss" } },
  { id: "freeze", stack: { kind: "refresh" }, durationMs: 1000 },
  { id: "brittle", stack: { kind: "refresh" }, durationMs: 1600, magnitude: 1, effect: { kind: "stat", stat: "brittle" } },
  { id: "wet", stack: { kind: "refresh" }, durationMs: 4000 },
];

/**
 * Worker conditions, on the same engine status runtime the tech's run on: the town's one twist is
 * that technology fights back without shooting. A notification leaves a worker Distracted (looking
 * at their phone, not working); a Flock camera leaves one Spotted (every notification goes for
 * them first); a hot graphics card leaves the workers near it Overheated (working slower).
 * A one-adopter mechanism kept local: the seam is "statuses on placed structures", which the
 * engine status runtime already serves once the caller owns a second runtime.
 */
export const WORKER_STATUSES: readonly StatusDef[] = [
  { id: "distracted", stack: { kind: "refresh" }, durationMs: 1000 },
  { id: "spotted", stack: { kind: "refresh" }, durationMs: 6000 },
  { id: "overheated", stack: { kind: "refresh" }, durationMs: 600 },
];

/** A speech bubble over a worker or a piece of tech: a voice line, or a notification's ping. */
export interface SpeechBubble {
  id: number;
  /** The entity it hangs over. */
  at: string;
  text: string;
  /** A worker speaking, or a gadget pinging. */
  kind: "voice" | "ping";
  /** Game seconds it was said at. */
  born: number;
}

/** How long a bubble stays up, in game seconds, and how many may be up at once. */
export const BUBBLE_RULE = { seconds: 2.8, max: 7 } as const;

/** A worker's own clocks: when each job's ability is next ready, and when they last spoke. */
export interface WorkerClock {
  /** Seconds until a Teacher confiscates, an IT Guy reboots or a Lawyer files again. */
  ability: number;
  /** Seconds until they may say a line on the job again. */
  voice: number;
  /** How hard the hottest tech near them is cooking them (1 = not at all). */
  heat: number;
}

/**
 * The real-time half of a defense: the wave director, tech mid-route, worker aim and worker
 * conditions. Cash, attention span, plots, workers, hires and the run's flags live in the town's
 * world (`keep.ts`).
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
  /** Scalds, crushed armor, freezes, brittleness and Wet on the tech. */
  statuses: StatusRuntime;
  /** Distracted, Spotted and Overheated on the workers. */
  workers: StatusRuntime;
  /** Each standing worker's ability and voice clocks. */
  workerClocks: Map<string, WorkerClock>;
  /** Plots a drone's parcel is blocking, until a player signs for it. */
  parcels: Set<string>;
  /** Seconds into the open wave when its "Installing Update..." lands; null when it has landed or none comes. */
  updateAt: number | null;
  /** Seconds the open wave has been running. */
  waveClock: number;
  /** Counts voice lines spoken, so each pick is deterministic. */
  voiceSeq: number;
  /** Onboarding tips already shown this day. */
  tipsShown: Set<string>;
  /** Speech bubbles up over the street, oldest first. */
  bubbles: SpeechBubble[];
  /** Blackout and Do Not Disturb. */
  abilities: AbilityKit;
  /** The ability waiting for a click on the field, if one is armed. */
  armedAbility: string | null;
  /** Blackouts on their way: they land after the telegraph, not when the click lands. */
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
    workers: createStatusRuntime({ statuses: WORKER_STATUSES, rng: seededRng(`beacon-bastion:workers:${DIRECTOR_SEED}`) }),
    workerClocks: new Map(),
    parcels: new Set(),
    updateAt: null,
    waveClock: 0,
    voiceSeq: 0,
    tipsShown: new Set(),
    bubbles: [],
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
  session.workers.dispose();
  session = freshState();
}

/** Put a bubble over an entity; one per speaker, and the oldest go when the street gets chatty. */
export function say(at: string, text: string, kind: SpeechBubble["kind"], nowSeconds: number): void {
  session.bubbles = session.bubbles.filter((bubble) => bubble.at !== at && nowSeconds - bubble.born < BUBBLE_RULE.seconds);
  session.bubbles.push({ id: session.voiceSeq * 1000 + session.bubbles.length, at, text, kind, born: nowSeconds });
  if (session.bubbles.length > BUBBLE_RULE.max) session.bubbles.splice(0, session.bubbles.length - BUBBLE_RULE.max);
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
