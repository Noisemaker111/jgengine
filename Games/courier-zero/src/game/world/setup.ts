import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { PROP_PLACEMENTS } from "./props";

export function placeProps(ctx: GameContext): void {
  for (const prop of PROP_PLACEMENTS) {
    ctx.scene.object.place(prop.catalogId, prop.x, prop.y, prop.z, {
      instanceId: prop.instanceId,
      rotation: prop.rotationY,
      visual: { scale: prop.scale },
    });
  }
}
