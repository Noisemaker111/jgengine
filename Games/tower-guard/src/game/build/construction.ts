import { tick, type WorkQueueConfig } from "@jgengine/core/gameplay";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { editorLayers } from "../../editorLayers";
import { towerDef } from "../entities/towers/catalog";
import { session } from "../session";

/** The work a build order does: raise one tower on one plot. */
export interface TowerBuildSpec {
  towerId: string;
  plotId: string;
  instanceId: string;
  position: EntityPosition;
  userId: string;
}

/** Inputs reserved when a build is queued — refunded if it is ever cancelled. */
export interface TowerReservation {
  userId: string;
  cost: number;
}

/** Completion payload routed to the spawn primitive. */
export type TowerBuildOutput = TowerBuildSpec;

/**
 * Construction policy for the tower build queue. Duration comes from the tower's
 * catalog `buildSeconds` (0 = instant); completion output is the placement the
 * construction system routes to `ctx.scene.entity.spawn`.
 */
export const towerBuildConfig: WorkQueueConfig<TowerBuildSpec, TowerReservation, TowerBuildOutput> = {
  duration: (spec) => Math.max(0, towerDef(spec.towerId, editorLayers).buildSeconds ?? 0),
  reserve: (spec) => ({ userId: spec.userId, cost: towerDef(spec.towerId, editorLayers).cost }),
  output: (job) => job.spec,
};

/**
 * Advance the tower build queue and route each completed job through the existing
 * spawn primitive. Instant (buildSeconds 0) towers complete on the first tick after
 * placement, so observable behavior matches direct placement; towers with a build
 * time raise over that many seconds.
 */
export function tickConstruction(ctx: GameContext, dt: number): void {
  const result = tick(session.buildQueue, towerBuildConfig, dt);
  session.buildQueue = result.state;
  for (const event of result.events) {
    if (event.type !== "completed") continue;
    const { towerId, plotId, instanceId, position } = event.output;
    ctx.scene.entity.spawn(towerId, { id: instanceId, position, role: "prop" });
    session.towers.set(instanceId, { instanceId, catalogId: towerId, plotId, cooldownSeconds: 0 });
  }
}
