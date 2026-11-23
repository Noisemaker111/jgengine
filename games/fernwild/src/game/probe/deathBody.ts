import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { bodyPrompts, bodyView } from "../deathBody";

/** What proofs and flows read about deathBody: its part of the capture probe. */
export function deathBodyProbe(ctx: GameContext) {
  const body = bodyView(ctx);
  return {
    // Whatever the survivor drives (them, or the mount under them): metres above the ground under it, and that ground's height.
    alt: ((body) => (body === null ? 0 : Math.round((body.position[1] - ctx.world.groundHeightAt(body.position[0], body.position[2])) * 10) / 10))(ctx.scene.entity.get(ctx.player.possession.active(ctx.player.userId))),
    groundY: ((body) => (body === null ? 0 : Math.round(ctx.world.groundHeightAt(body.position[0], body.position[2]) * 10) / 10))(ctx.scene.entity.get(ctx.player.possession.active(ctx.player.userId))),
    // Metres to the survivor's own body, to a decimetre, and the stacks it holds; -1 and 0 with no body lying.
    bodyDistance: body === null ? -1 : Math.round(body.distance * 10) / 10,
    bodyStacks: body?.stacks ?? 0,
    // 1 while your body is in reach, so E would take your things back.
    atBody: bodyPrompts(ctx).length > 0 ? 1 : 0,
  };
}
