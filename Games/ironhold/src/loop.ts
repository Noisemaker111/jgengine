import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { session } from "./game/session";
import { setupSkirmish } from "./game/world/scene";

/** @internal Spawn the roster and wire the skirmish once, at world boot. */
export function onInit(ctx: GameContext): void {
  setupSkirmish(ctx);
}

/** @internal No avatar — Ironhold is a commander-view RTS, so a joining player controls the army. */
export function onNewPlayer(_ctx: GameContext): void {}

/** @internal Keyboard verbs the pointer can't carry: the command-card grid hotkeys (Q W E R · A S
 * D · Z X C) map straight onto the console buttons. */
export function onTick(ctx: GameContext, _dt: number): void {
  if (session.over) return;
  if (ctx.input.justPressed("attackMove")) session.attackMoveArmed = true;
  if (ctx.input.justPressed("trainPeasant")) ctx.game.commands.run("train.peasant", {});
  if (ctx.input.justPressed("trainFootman")) ctx.game.commands.run("train.footman", {});
  if (ctx.input.justPressed("trainRifleman")) ctx.game.commands.run("train.rifleman", {});
  if (ctx.input.justPressed("buildBarracks")) ctx.game.commands.run("build.arm", { type: "barracks" });
  if (ctx.input.justPressed("buildFarm")) ctx.game.commands.run("build.arm", { type: "farm" });
  if (ctx.input.justPressed("buildTower")) ctx.game.commands.run("build.arm", { type: "guard_tower" });
  if (ctx.input.justPressed("researchWeapons")) ctx.game.commands.run("research.weapons", {});
  if (ctx.input.justPressed("researchArmor")) ctx.game.commands.run("research.armor", {});
  if (ctx.input.justPressed("heroAbility")) ctx.game.commands.run("hero.ability", {});
}
