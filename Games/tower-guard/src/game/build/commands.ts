import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { GOLD_CURRENCY } from "../entities/base/catalog";
import { TOWER_IDS, towerDef } from "../entities/towers/catalog";
import { nearestPlot } from "../world/path";
import { session, nextTowerInstanceId } from "../session";

const PLOT_CLICK_RADIUS = 4.5;

export interface BuildPlaceInput {
  point: EntityPosition;
}

function rejectBuild(ctx: GameContext, input: BuildPlaceInput): { reason: string } | null {
  const towerId = session.selectedTowerId;
  if (towerId === null) return { reason: "no-tower-selected" };
  const plot = nearestPlot(input.point, PLOT_CLICK_RADIUS);
  if (plot === null) return { reason: "no-plot" };
  if (session.plotOccupant.get(plot.id) !== null) return { reason: "plot-occupied" };
  const def = towerDef(towerId);
  if (ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY) < def.cost) {
    return { reason: "insufficient-gold" };
  }
  return null;
}

function placeTower(ctx: GameContext, input: BuildPlaceInput): GameContext {
  const towerId = session.selectedTowerId!;
  const plot = nearestPlot(input.point, PLOT_CLICK_RADIUS)!;
  const def = towerDef(towerId);
  ctx.game.economy.charge(ctx.player.userId, GOLD_CURRENCY, def.cost);
  const instanceId = nextTowerInstanceId();
  ctx.scene.entity.spawn(towerId, {
    id: instanceId,
    position: plot.position,
    role: "prop",
  });
  session.towers.set(instanceId, { instanceId, catalogId: towerId, plotId: plot.id, cooldownSeconds: 0 });
  session.plotOccupant.set(plot.id, instanceId);
  return ctx;
}

function selectTowerCommand(id: string) {
  return {
    apply(state: GameContext): GameContext {
      session.selectedTowerId = session.selectedTowerId === id ? null : id;
      return state;
    },
  };
}

export function registerBuildCommands(ctx: GameContext): void {
  ctx.game.commands.define<BuildPlaceInput>("tower.build", {
    validate: rejectBuild,
    apply: placeTower,
  });
  TOWER_IDS.forEach((id, index) => {
    ctx.game.commands.define(`buildTower${index + 1}`, selectTowerCommand(id));
  });
}
