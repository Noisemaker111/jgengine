import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { session } from "./game/session";
import { setupSkirmish } from "./game/world/scene";

/** @internal Spawn the roster and wire the skirmish once, at world boot. */
export function onInit(ctx: GameContext): void {
  setupSkirmish(ctx);
}

/** @internal No avatar — Ironhold is a commander-view RTS, so a joining player controls the army. */
export function onNewPlayer(_ctx: GameContext): void {}

/** @internal Keyboard verbs the pointer can't carry: arm attack-move, quick-train from the keep. */
export function onTick(ctx: GameContext, _dt: number): void {
  if (session.over) return;
  if (ctx.input.justPressed("attackMove")) session.attackMoveArmed = true;
  if (ctx.input.justPressed("trainPeasant")) ctx.game.commands.run("train.peasant", {});
  if (ctx.input.justPressed("trainFootman")) ctx.game.commands.run("train.footman", {});
  if (ctx.input.justPressed("heroAbility")) ctx.game.commands.run("hero.ability", {});
}
