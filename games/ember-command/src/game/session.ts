import { createResourceNodeField, type ResourceNodeField } from "@jgengine/core/world/resourceNode";
import { activeJobs, queuedJobs, createWorkQueue, type WorkQueueState } from "@jgengine/core/gameplay";
import type { UnitReservation, UnitTrainingSpec } from "@jgengine/core/work/unitTraining";
import { createEncounter, type Encounter } from "@jgengine/core/waves/encounter";
import type { SoundHunt } from "@jgengine/core/ai/director/sound";
import type { PerceptionService } from "@jgengine/core/sensor/perception";
import { createEncounterState } from "@jgengine/core/waves/encounterSequence";
import { evaluatePressure } from "@jgengine/core/waves/pressure";

import type { EnemyWaveState } from "./ai/director";
import { MARAUDER_WAVES, MARCH_PLAN } from "./ai/waveManifest";

import type { BuildSpec } from "./building";
import { combatantDef, type CombatantKind } from "./catalog";
import { createFogState, type FogState } from "./fog";
import type { FormationState } from "./formations";
import { ENEMY_WAVE_FIRST_DELAY, FOG_CELL, TOWN_HALL_FOOD, type Faction } from "./tuning";
import type { ResearchSpec } from "./upgrades";
import type { HeroActsRuntime } from "./heroActs";

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
  nodes: Map<string, NodeInfo>;
  resourceField: ResourceNodeField | null;
  production: WorkQueueState<UnitTrainingSpec, UnitReservation>;
  buildQueue: WorkQueueState<BuildSpec, undefined>;
  research: { ranks: Record<string, number>; queue: WorkQueueState<ResearchSpec, undefined> };
  buildArmed: string | null;
  supplyCap: number;
  attackMoveArmed: boolean;
  formation: FormationState;
  fog: FogState;
  enemyWave: EnemyWaveState;
  senses: PerceptionService | null;
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

export function initResourceField(rng?: () => number): void {
  session.resourceField = createResourceNodeField({
    ...(rng === undefined ? {} : { rng }),
    nodes: Array.from(session.nodes.values()).map((n) => ({
      id: n.id,
      budget: n.resource === "gold" ? 600 : 500,
      resources: [{ kind: n.resource, amount: n.resource === "gold" ? 12 : 8 }],
    })),
  });
}

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

export function usedSupply(): number {
  let used = 0;
  for (const unit of session.units.values()) {
    if (unit.faction !== "player") continue;
    used += combatantDef(unit.catalogId)?.food ?? 0;
  }
  return used;
}

export function playerDepot(from: { x: number; z: number }): { id: string; x: number; z: number } | null {
  let best: { id: string; x: number; z: number } | null = null;
  let bestDist = Infinity;
  for (const u of session.units.values()) {
    if (u.faction !== "player" || combatantDef(u.catalogId)?.depot !== true) continue;
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
