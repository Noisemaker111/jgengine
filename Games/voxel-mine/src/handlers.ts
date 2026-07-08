import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { ItemUseHandler, ItemUseInput } from "@jgengine/core/item/use";
import type { Vec3, VoxelHit } from "./raycast";
import type { VoxelGrid } from "./voxelGrid";

function aimedHit(
  ctx: GameContext,
  input: ItemUseInput,
  grid: VoxelGrid,
  eyeHeight: number,
  reach: number,
): VoxelHit | null {
  const player = ctx.scene.entity.get(input.from);
  if (player === null || input.aim === undefined || !("yaw" in input.aim)) return null;
  const { yaw, pitch } = input.aim;
  const cosPitch = Math.cos(pitch);
  const direction: Vec3 = [Math.sin(yaw) * cosPitch, Math.sin(pitch), Math.cos(yaw) * cosPitch];
  const origin: Vec3 = [player.position[0], player.position[1] + eyeHeight, player.position[2]];
  return grid.raycast(origin, direction, reach);
}

export function createEditorHandlers(
  grid: VoxelGrid,
  eyeHeight: number,
  reach: number,
): Record<string, ItemUseHandler<GameContext>> {
  return {
    mine: {
      apply(ctx, input) {
        const hit = aimedHit(ctx, input, grid, eyeHeight, reach);
        if (hit !== null) grid.remove(hit.cell[0], hit.cell[1], hit.cell[2]);
        return { state: ctx };
      },
    },
    placeBlock: {
      apply(ctx, input) {
        const hit = aimedHit(ctx, input, grid, eyeHeight, reach);
        if (hit !== null) {
          const tx = hit.cell[0] + hit.normal[0];
          const ty = hit.cell[1] + hit.normal[1];
          const tz = hit.cell[2] + hit.normal[2];
          if (!grid.has(tx, ty, tz)) grid.set(input.itemId, tx, ty, tz);
        }
        return { state: ctx };
      },
    },
  };
}
