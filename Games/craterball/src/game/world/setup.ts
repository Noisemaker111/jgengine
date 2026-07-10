import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { BALL, BOMBER_MAGENTA } from "../entities/catalog";
import { generateArenaDressing } from "./dressing";

export const AI_ENTITY_ID = "ai_bomber";
export const BALL_ENTITY_ID = "match_ball";
export const BALL_Y = 0.42;

export function placeArenaDressing(ctx: GameContext): void {
  for (const item of generateArenaDressing()) {
    ctx.scene.object.place(item.catalogId, item.x, 0, item.z, {
      rotation: item.rotationY,
      visual: { scale: item.scale, color: item.color },
    });
  }
}

export function spawnMatchEntities(ctx: GameContext, ballX: number, ballZ: number, aiX: number, aiZ: number): void {
  ctx.scene.entity.spawn(BALL, { id: BALL_ENTITY_ID, position: [ballX, BALL_Y, ballZ], role: "prop" });
  ctx.scene.entity.spawn(BOMBER_MAGENTA, { id: AI_ENTITY_ID, position: [aiX, 0, aiZ], role: "npc" });
}
