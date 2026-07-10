import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { generateTrackProps } from "../track/props";

export function placeTrackProps(ctx: GameContext): void {
  for (const prop of generateTrackProps()) {
    ctx.scene.object.place(prop.catalogId, prop.x, prop.y, prop.z, {
      rotation: prop.rotationY,
      visual: { color: prop.color, scale: prop.scale },
    });
  }
}
