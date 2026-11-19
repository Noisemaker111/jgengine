import type { GameContext } from "../runtime/gameContext";

/** @capability grounded ground an XZ point onto the world surface as a pose triple */
export function grounded(
  ctx: Pick<GameContext, "world">,
  x: number,
  z: number,
): readonly [number, number, number] {
  return [x, ctx.world.groundHeightAt(x, z), z];
}
