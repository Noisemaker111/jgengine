import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { startFishingSession } from "../combat/skillCheckSessions";
import { openDialogue } from "./uiController";

const TICK_STEP = 1 / 60;

interface TickablePlayable {
  loop: { onTick(ctx: GameContext, dt: number): void };
}

export function interactionShowcaseScenario(ctx: GameContext, playable: TickablePlayable): void {
  const steps = Math.round(4 / TICK_STEP);
  for (let index = 0; index < steps; index += 1) playable.loop.onTick(ctx, TICK_STEP);

  ctx.scene.entity.cycleTarget(ctx.player.userId, { filter: "hostile" });
  const target = ctx.scene.entity.getTarget(ctx.player.userId);
  if (target !== null) {
    const health = ctx.scene.entity.stats.get(target, "health");
    if (health !== null) ctx.scene.entity.stats.delta(target, "health", -health.max * 0.12);
  }

  startFishingSession(ctx.player.userId, ctx.time.now() - 0.4);
}

export function dialogueShowcaseScenario(ctx: GameContext, playable: TickablePlayable): void {
  const steps = Math.round(4 / TICK_STEP);
  for (let index = 0; index < steps; index += 1) playable.loop.onTick(ctx, TICK_STEP);

  openDialogue("marshal_town");
}
