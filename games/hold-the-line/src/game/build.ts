import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineBuildKeys, placePiece } from "@jgengine/core/worldModel/buildTool";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import { campGrid, cellAt } from "./places";
import { camp } from "./spec";

const REACH = 3;

/** The camp cell a few steps in front of the hero: where a build goes. */
export function cellAhead(ctx: GameContext): [number, number] | null {
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return null;
  const yaw = me.rotationY;
  return cellAt(campGrid(editorLayers), me.position[0] + Math.sin(yaw) * REACH, me.position[2] + Math.cos(yaw) * REACH);
}

/** `build1`..`buildN`: one command per structure, bound to its number key in `game.config.ts`. */
export const buildSystem = defineSystem({
  id: "camp.build",
  tick: { type: "frame" },
  create(ctx) {
    // A refusal is said on screen (not cost, too far out, cell taken) rather than failing silently.
    defineBuildKeys(ctx, idea.structures, (state, structure) => {
      const cell = cellAhead(state);
      const at = cell === null ? `Build inside the camp around the ${idea.home.label.toLowerCase()}` : { cell };
      placePiece(state, camp.of(state), structure, at, { announce: false });
    });
  },
});
