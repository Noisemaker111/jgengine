import type { GameContext } from "../runtime/gameContext";

/**
 * Ground an XZ point onto the live world surface as `[x, groundY, z]`.
 *
 * The one-line pose pattern every game re-derives as
 * `[x, ctx.world.groundHeightAt(x, z), z]` — use this instead so spawn,
 * placement, and AI pose sites stay consistent.
 *
 * @capability grounded ground an XZ point onto the world surface as a pose triple
 */
export function grounded(
  ctx: Pick<GameContext, "world">,
  x: number,
  z: number,
): readonly [number, number, number] {
  return [x, ctx.world.groundHeightAt(x, z), z];
}
