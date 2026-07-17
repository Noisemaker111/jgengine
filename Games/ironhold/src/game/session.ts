import { createResourceNodeField, type ResourceNodeField } from "@jgengine/core/world/resourceNode";
import { createWorkQueue, type WorkQueueState } from "@jgengine/core/gameplay";
import type { UnitReservation, UnitTrainingSpec } from "@jgengine/core/work/unitTraining";

import type { BuildSpec } from "./building";
import { combatantDef, type CombatantKind } from "./catalog";
import { ENEMY_WAVE_FIRST_DELAY, TOWN_HALL_FOOD, type Faction } from "./tuning";

/** A commanded intent for one unit. Serializable plain data — no closures, no entity refs. */
export type UnitCommand =
  | { kind: "idle" }
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

/** The enemy reinforcement clock. Serializable plain data the director advances each frame. */
export interface EnemyWaveState {
  /** Seconds until the next wave musters. */
  timer: number;
  /** How many waves have been sent so far — drives escalation of size and composition. */
  sent: number;
}

export interface SessionState {
  units: Map<string, UnitRuntime>;
  /** World positions of the harvestable resource nodes, keyed by instance id. */
  nodes: Map<string, NodeInfo>;
  /** Depletion/respawn bookkeeping for those nodes; built once the scene is read. */
  resourceField: ResourceNodeField | null;
  /** The Town Hall's timed unit-training queue. */
  production: WorkQueueState<UnitTrainingSpec, UnitReservation>;
  /** Buildings under construction. */
  buildQueue: WorkQueueState<BuildSpec, undefined>;
  /** A building catalog id armed for placement; the next right-click drops it. */
  buildArmed: string | null;
  /** Supply cap the player's buildings provide (Town Hall + farms). */
  supplyCap: number;
  /** Set by the Attack-Move verb; consumed by the next right-click order. */
  attackMoveArmed: boolean;
  /** Enemy reinforcement clock; the AI director musters escalating waves off it. */
  enemyWave: EnemyWaveState;
  over: boolean;
  victory: boolean;
  trainSeq: number;
}

function fresh(): SessionState {
  return {
    units: new Map(),
    nodes: new Map(),
    resourceField: null,
    production: createWorkQueue<UnitTrainingSpec, UnitReservation>(),
    buildQueue: createWorkQueue<BuildSpec, undefined>(),
    buildArmed: null,
    supplyCap: TOWN_HALL_FOOD,
    attackMoveArmed: false,
    enemyWave: { timer: ENEMY_WAVE_FIRST_DELAY, sent: 0 },
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

/** Build the depletion field from the resource nodes discovered in the scene. */
export function initResourceField(): void {
  session.resourceField = createResourceNodeField({
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
    if (u.faction !== "player" || u.kind !== "building") continue;
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
