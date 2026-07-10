import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { generateDressing } from "./dressing";

export function setupWorld(ctx: GameContext): void {
  const placements = generateDressing();
  placements.forEach((placement, index) => {
    ctx.scene.object.place(placement.catalogId, placement.position[0], placement.position[1], placement.position[2], {
      instanceId: `dressing-${index}`,
      visual: { scale: placement.visualScale },
    });
  });
}
