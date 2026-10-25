import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { TOWER_IDS } from "../entities/towers/catalog";
import { nextAutoTargetPolicy } from "@jgengine/core/scene/autoTarget";

import { castAt } from "../combat/cast";
import { AIM_POLICIES, aimAction, keep, runEnded, sellAction, towerOptions, towerStats } from "../keep";
import { nearestPlot } from "../world/path";
import { session } from "../session";

const PLOT_CLICK_RADIUS = 4.5;

export interface BuildPlaceInput {
  point: EntityPosition;
}

/** Sell/upgrade act on `instanceId` when given, else on the inspected tower (the keybind path passes no id). */
export interface TowerTargetInput {
  instanceId?: string;
}

type Refusal = { reason: string; message?: string };
const refusal = (result: { reason: string; message: string } | null): Refusal | null =>
  result === null ? null : { reason: result.reason, message: result.message };

/**
 * A click on the field: an occupied plot opens its tower, open ground closes the panel, and an empty
 * plot builds the picked tower through `beacon.place`, which pays, reserves the plot and starts the build.
 */
function rejectBuild(ctx: GameContext, input: BuildPlaceInput): Refusal | null {
  if (session.armedAbility !== null) return null;
  const plot = nearestPlot(input.point, PLOT_CLICK_RADIUS);
  if (plot === null) return session.inspectedTowerId === null ? { reason: "no-plot" } : null;
  const world = keep.of(ctx);
  if (world.occupant(plot.id) !== null) return null;
  if (runEnded(world)) return { reason: "run-ended" };
  const kind = session.selectedTowerId;
  if (kind === null) return { reason: "no-tower-selected", message: "Pick a tower first" };
  return refusal(world.canPlace(kind, { slot: plot.id }));
}

function clickPlot(ctx: GameContext, input: BuildPlaceInput): GameContext {
  // An armed ability takes the click: the fire falls where the player pointed.
  if (castAt(ctx, input.point)) return ctx;
  const plot = nearestPlot(input.point, PLOT_CLICK_RADIUS);
  if (plot === null) {
    session.inspectedTowerId = null;
    return ctx;
  }
  const occupant = keep.of(ctx).occupant(plot.id);
  session.inspectedTowerId = occupant;
  if (occupant !== null) return ctx;
  ctx.game.commands.run("beacon.place", { kind: session.selectedTowerId!, slot: plot.id });
  ctx.game.audio.play("build", plot.position);
  return ctx;
}

function targetOf(ctx: GameContext, input: TowerTargetInput | undefined): { id: string; kind: string } | null {
  const id = typeof input?.instanceId === "string" ? input.instanceId : session.inspectedTowerId;
  if (id === null) return null;
  const tower = keep.of(ctx).instance(id);
  return tower === null ? null : { id, kind: tower.kind };
}

/**
 * The upgrade the U key takes: the only step open next. At a fork (two branches offered) the key
 * refuses, so the player picks a branch on the tower's card instead of the key choosing for them.
 */
function upgradeActionFor(ctx: GameContext, id: string, kind: string): string | Refusal {
  const options = towerOptions(keep.of(ctx), id, kind);
  if (options.length === 0) return { reason: "max-level", message: "Fully upgraded" };
  if (options.length > 1) return { reason: "choose-branch", message: "Choose a branch on the tower card" };
  return options[0]!.action;
}

/** The aim the tower would switch to next: first, last, strongest, nearest, then round again. */
function nextAimFor(ctx: GameContext, id: string): string {
  return aimAction(nextAutoTargetPolicy(towerStats(keep.of(ctx), id).aim, AIM_POLICIES));
}

/** The keybind path (U / X / T): the declared upgrade, sale or aim change of the inspected tower. */
function towerAction(actionOf: (ctx: GameContext, id: string, kind: string) => string | Refusal) {
  return {
    validate(ctx: GameContext, input: TowerTargetInput | undefined): Refusal | null {
      const tower = targetOf(ctx, input);
      if (tower === null) return { reason: "no-tower" };
      const action = actionOf(ctx, tower.id, tower.kind);
      if (typeof action !== "string") return action;
      return refusal(keep.of(ctx).canAct(action, tower.id));
    },
    apply(ctx: GameContext, input: TowerTargetInput | undefined): GameContext {
      const tower = targetOf(ctx, input)!;
      const action = actionOf(ctx, tower.id, tower.kind);
      if (typeof action === "string") ctx.game.commands.run("beacon.act", { action, target: tower.id });
      return ctx;
    },
  };
}

function selectTowerCommand(id: string) {
  return {
    apply(state: GameContext): GameContext {
      session.selectedTowerId = session.selectedTowerId === id ? null : id;
      if (session.selectedTowerId !== null) state.game.audio.play("select");
      return state;
    },
  };
}

export function registerBuildCommands(ctx: GameContext): void {
  ctx.game.commands.define<BuildPlaceInput>("tower.build", {
    validate: rejectBuild,
    apply: clickPlot,
  });
  ctx.game.commands.define<TowerTargetInput | undefined>("sellTower", towerAction(() => sellAction()));
  ctx.game.commands.define<TowerTargetInput | undefined>("upgradeTower", towerAction(upgradeActionFor));
  ctx.game.commands.define<TowerTargetInput | undefined>("cycleAim", towerAction((state, id) => nextAimFor(state, id)));
  TOWER_IDS.forEach((id, index) => {
    ctx.game.commands.define(`buildTower${index + 1}`, selectTowerCommand(id));
  });
}
