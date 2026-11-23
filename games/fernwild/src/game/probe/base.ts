import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  baseGhost,
  baseView,
  fuelNear,
  lastPiece,
  piecesBuilt,
  stations,
  storeView,
} from "../base";
import type { ProbeFrame } from "./frame";
import { SPAWN_YAW, acrossSpawn } from "../spawn";

/** Metres `at` lies past `mark` along the spawn facing, to a decimetre; 0 when either is missing. */
function pastAlongSpawn(at: readonly number[] | undefined, mark: readonly number[] | null): number {
  if (at === undefined || mark === null) return 0;
  return Math.round(((at[0]! - mark[0]!) * Math.sin(SPAWN_YAW) + (at[2]! - mark[2]!) * Math.cos(SPAWN_YAW)) * 10) / 10;
}

/** What proofs and flows read about base: its part of the capture probe. */
export function baseProbe(ctx: GameContext, { me, here, sight }: ProbeFrame) {
  const base = baseView(ctx);
  const ghostPlan = baseGhost(ctx);
  const stationNear =(id: string): [number, number, number] | null => {
    const at = stations(ctx)
      .filter((station) => station.catalogId === id)
      .sort((a, b) => Math.hypot(a.position[0] - here[0], a.position[1] - here[2]) - Math.hypot(b.position[0] - here[0], b.position[1] - here[2]))[0]?.position;
    return at === undefined ? null : [at[0], 0, at[1]];
  };
  return {
    campfires: piecesBuilt(ctx, "campfire"),
    boxes: piecesBuilt(ctx, "storage_box"),
    bins: piecesBuilt(ctx, "preserving_bin"),
    plots: piecesBuilt(ctx, "crop_plot"),
    // The faced crop plot: 1 with a seed in it, its growth in percent, and its water and fertilizer; -1 with no plot faced.
    plotSeeded: base.plot === null ? -1 : base.plot.seed === null ? 0 : 1,
    plotGrowth: base.plot === null ? -1 : Math.floor(base.plot.growth * 100),
    plotWater: base.plot === null ? -1 : Math.ceil(base.plot.water),
    plotFertilizer: base.plot === null ? -1 : Math.ceil(base.plot.fertilizer),
    // Sleeping bags placed, and where the last one lies (0, 0 with none).
    bags: piecesBuilt(ctx, "hide_sleeping_bag"),
    ...((at) => ({ bagX: at === undefined ? 0 : Math.round(at[0] * 10) / 10, bagZ: at === undefined ? 0 : Math.round(at[2] * 10) / 10 }))(lastPiece(ctx, "hide_sleeping_bag")),
    // The nearest campfire and mortar the survivor placed, to walk back to and work at.
    ...sight("campfire", stationNear("campfire")),
    ...sight("mortar", stationNear("mortar_and_pestle")),
    // The first foundation's and doorframe's centres, to build the hut around.
    ...sight("floor", base.floor),
    ...sight("doorway", base.doorway),
    fuel: Math.round(fuelNear(ctx, here, 6) * 10) / 10,
    // Items in the open storage box (-1 with none open).
    stored: ((store) => (store === null ? -1 : store.slots.reduce((sum, slot) => sum + (slot?.count ?? 0), 0)))(storeView(ctx)),
    storedMeat: ((store) => (store === null ? -1 : store.slots.reduce((sum, slot) => sum + (slot?.itemId === "raw_meat" ? slot.count : 0), 0)))(storeView(ctx)),
    ...sight("pot", stationNear("cooking_pot")),
    structures: base.count,
    // 1 a valid ghost, 0 a blocked one, -1 nothing in hand to build.
    ghost: base.ghost === null ? -1 : base.ghost.valid ? 1 : 0,
    ghostSnapped: base.ghost?.mode === "snap" ? 1 : 0,
    // Whole metres the ghost stands above the ground under it: a wall stacked on a wall shows 3.
    ghostLift: ghostPlan === null ? 0 : Math.round(ghostPlan.position[1] - ctx.world.groundHeightAt(ghostPlan.position[0], ghostPlan.position[2])),
    aimedStructureHealth: base.aimed?.health ?? 0,
    doorsOpen: base.open,
    // Metres the survivor stands past the first foundation's centre and past the first doorframe, along the
    // spawn facing: negative is short of it.
    pastFloor: pastAlongSpawn(me?.position, base.floor),
    pastDoor: pastAlongSpawn(me?.position, base.doorway),
    // Metres the survivor stands right of the first doorframe's centre, across the spawn facing.
    acrossDoor: acrossSpawn(me?.position, base.doorway),
  };
}
