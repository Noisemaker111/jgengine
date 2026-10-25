import { createResourceNodeField, type ResourceNodeField } from "@jgengine/core/world/resourceNode";
import { activeJobs, queuedJobs, createWorkQueue, type WorkQueueState } from "@jgengine/core/gameplay";
import type { UnitReservation, UnitTrainingSpec } from "@jgengine/core/work/unitTraining";
import { createEncounter, type Encounter } from "@jgengine/core/ai/director/encounter";
import type { SoundHunt } from "@jgengine/core/ai/director/sound";
import type { PerceptionService } from "@jgengine/core/sensor/perception";
import { createEncounterState } from "@jgengine/core/combat/encounterSequence";
import { evaluatePressure } from "@jgengine/core/ai/director/pressure";

import type { EnemyWaveState } from "./ai/director";
import { MARAUDER_WAVES, MARCH_PLAN } from "./ai/waveManifest";

import type { BuildSpec } from "./building";
import { combatantDef, type CombatantKind } from "./catalog";
import { createFogState, type FogState } from "./fog";
import type { FormationState } from "./formations";
import { ENEMY_WAVE_FIRST_DELAY, FOG_CELL, TOWN_HALL_FOOD, type Faction } from "./tuning";
import type { ResearchSpec } from "./upgrades";
import type { HeroActsRuntime } from "./heroActs";

/** A commanded intent for one unit. Serializable plain data — no closures, no entity refs. */
export type UnitCommand =
  | { kind: "idle" }
  | { kind: "hold" }
  | { kind: "move"; x: number; z: number }
  | { kind: "attackMove"; x: number; z: number }
  | { kind: "attack"; targetId: string }
  | { kind: "gather"; nodeId: string; resource: string; phase: "toNode" | "harvest" | "toDepot"; carried: number; timer: number };

export interface UnitRuntime {
  id: string;
  catalogId: string;
  faction: Faction;
  kind: CombatantKind;
  command: UnitCommand;
  /** Guards return here and drop chase when a target leads them past `leash` from it. */
  guardPoint?: { x: number; z: number };
  leash: number;
  /** Seconds remaining before the next swing lands. */
  attackCooldown: number;
}

export interface NodeInfo {
  id: string;
  resource: string;
  x: number;
  z: number;
}

export interface SessionState {
  started: boolean;
  paused: boolean;
  elapsed: number;
  rallyArmed: boolean;
  rallyPoint: { x: number; z: number } | null;
  units: Map<string, UnitRuntime>;
  /** World positions of the harvestable resource nodes, keyed by instance id. */
  nodes: Map<string, NodeInfo>;
  /** Depletion/respawn bookkeeping for those nodes; built once the scene is read. */
  resourceField: ResourceNodeField | null;
  /** The Town Hall's timed unit-training queue. */
  production: WorkQueueState<UnitTrainingSpec, UnitReservation>;
  /** Buildings under construction. */
  buildQueue: WorkQueueState<BuildSpec, undefined>;
  /** Player research: achieved upgrade ranks + the in-progress research queue. */
  research: { ranks: Record<string, number>; queue: WorkQueueState<ResearchSpec, undefined> };
  /** A building catalog id armed for placement; the next right-click drops it. */
  buildArmed: string | null;
  /** Supply cap the player's buildings provide (Town Hall + farms). */
  supplyCap: number;
  /** Set by the Attack-Move verb; consumed by the next right-click order. */
  attackMoveArmed: boolean;
  /** The marching shape and the anchor the army holds around it (see `formations.ts`). */
  formation: FormationState;
  /** What the Vanguard has explored and what it can see right now (see `fog.ts`). */
  fog: FogState;
  /** The Marauder plan, its attack waves and the scouting/role bookkeeping. */
  enemyWave: EnemyWaveState;
  /** The Marauders' eyes and ears, shared by every enemy unit. Built on the first plan tick. */
  senses: PerceptionService | null;
  /** Noise investigations: a fight pulls nearby Marauders to it. */
  hunt: SoundHunt | null;
  /** Where every living enemy unit stood on the last director tick, so a noise can find its neighbours. */
  enemyPositions: Record<string, { x: number; z: number }>;
  /** Bram's battle runtime — act cooldowns, timed line buffs and the live pick tree. Built on first
   * use and dropped with the session, so a restaged battle starts with fresh cooldowns. */
  heroActs: HeroActsRuntime | null;
  over: boolean;
  victory: boolean;
  trainSeq: number;
}

function fresh(): SessionState {
  return {
    started: true,
    paused: false,
    elapsed: 0,
    rallyArmed: false,
    rallyPoint: null,
    units: new Map(),
    nodes: new Map(),
    resourceField: null,
    production: createWorkQueue<UnitTrainingSpec, UnitReservation>(),
    buildQueue: createWorkQueue<BuildSpec, undefined>(),
    research: { ranks: {}, queue: createWorkQueue<ResearchSpec, undefined>() },
    buildArmed: null,
    supplyCap: TOWN_HALL_FOOD,
    attackMoveArmed: false,
    formation: { kind: "line", anchor: { x: 0, z: 0 }, facing: 0, members: [], offsets: {} },
    fog: createFogState(FOG_CELL),
    enemyWave: {
      // Started on the first plan tick, after the opening grace, so the scout phase's enter event
      // reaches the director instead of being spent while no world exists yet.
      plan: createEncounterState(MARCH_PLAN),
      encounter: createEncounter({ definition: MARAUDER_WAVES, seed: 7 }),
      sent: 0,
      grace: ENEMY_WAVE_FIRST_DELAY,
      campId: null,
      waveUnits: [],
      roleTimer: 0,
      tier: 0,
      lastPressure: evaluatePressure({ health: 1, progress: 0, elapsed: 0 }),
      hunting: {},
      scouts: [],
      contactAt: 0,
      contacted: false,
    },
    senses: null,
    hunt: null,
    enemyPositions: {},
    heroActs: null,
    over: false,
    victory: false,
    trainSeq: 0,
  };
}

/** Module-level singleton (single-player skirmish). `selectFilter` and the AI both read it, so it
 * cannot live behind `perContext(ctx)` — the shell's pointer filter has no context handle. */
export let session: SessionState = fresh();

export function resetSession(): void {
  session = fresh();
}

export function matchRunning(): boolean {
  return session.started && !session.paused && !session.over;
}

/** Supply is reserved when training is queued, not only when a recruit spawns. */
export function reservedSupply(): number {
  return [...activeJobs(session.production), ...queuedJobs(session.production)]
    .reduce((sum, job) => sum + (combatantDef(job.spec.unitId)?.food ?? 0), 0);
}

/** Build the depletion field from the resource nodes discovered in the scene. */
export function initResourceField(rng?: () => number): void {
  session.resourceField = createResourceNodeField({
    rng,
    nodes: Array.from(session.nodes.values()).map((n) => ({
      id: n.id,
      budget: n.resource === "gold" ? 600 : 500,
      resources: [{ kind: n.resource, amount: n.resource === "gold" ? 12 : 8 }],
    })),
  });
}

/** True when the shell should let the pointer select this entity (own living units + keep). */
export function isPlayerSelectable(id: string): boolean {
  const unit = session.units.get(id);
  return unit !== undefined && unit.faction === "player";
}

export function livingUnits(faction: Faction, kind?: CombatantKind): UnitRuntime[] {
  const out: UnitRuntime[] = [];
  for (const unit of session.units.values()) {
    if (unit.faction !== faction) continue;
    if (kind !== undefined && unit.kind !== kind) continue;
    out.push(unit);
  }
  return out;
}

/** Supply currently consumed by the player's living units. */
export function usedSupply(): number {
  let used = 0;
  for (const unit of session.units.values()) {
    if (unit.faction !== "player") continue;
    used += combatantDef(unit.catalogId)?.food ?? 0;
  }
  return used;
}

/** The nearest living player Town Hall an entity should haul resources to. */
export function playerDepot(from: { x: number; z: number }): { id: string; x: number; z: number } | null {
  // Only one keep in this build, but written for the general case.
  let best: { id: string; x: number; z: number } | null = null;
  let bestDist = Infinity;
  for (const u of session.units.values()) {
    if (u.faction !== "player" || u.catalogId !== "keep_player") continue;
    const point = u.guardPoint;
    if (point === undefined) continue;
    const d = Math.hypot(point.x - from.x, point.z - from.z);
    if (d < bestDist) {
      bestDist = d;
      best = { id: u.id, x: point.x, z: point.z };
    }
  }
  return best;
}
