import type { GameContext } from "@jgengine/core/runtime/gameContext";

/** How far out from a chest's centre its drops land: far enough that standing on one keeps the camera clear of the chest. */
export const CHEST_DROP_REACH = 2.2;
const DROP_SPACING = 0.8;

/**
 * Where a chest sets down drop `index` of `count`: on the opener's side, in a row across their view,
 * so what came out is in front of them and E on it never puts the camera inside the chest.
 */
export function chestDropSpot(
  ctx: GameContext,
  at: readonly [number, number, number],
  index: number,
  count: number,
): [number, number, number] {
  const opener = ctx.scene.entity.get(ctx.player.userId)?.position;
  const dx = opener === undefined ? 0 : opener[0] - at[0];
  const dz = opener === undefined ? 1 : opener[2] - at[2];
  const length = Math.hypot(dx, dz);
  const [towardX, towardZ] = length > 0.01 ? [dx / length, dz / length] : [0, 1];
  const across = (index - (count - 1) / 2) * DROP_SPACING;
  return [at[0] + towardX * CHEST_DROP_REACH - towardZ * across, at[1], at[2] + towardZ * CHEST_DROP_REACH + towardX * across];
}
