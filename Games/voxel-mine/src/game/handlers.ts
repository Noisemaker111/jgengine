import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { ItemUseHandler, ItemUseInput } from "@jgengine/core/item/use";
import { BEDROCK_BLOCK, oreForBlock } from "./blocks";
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

function occupiesCell(position: readonly [number, number, number], x: number, y: number, z: number): boolean {
  const footY = Math.floor(position[1]);
  return Math.floor(position[0]) === x && Math.floor(position[2]) === z && (y === footY || y === footY + 1);
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
        if (hit === null) return { state: ctx };
        const [x, y, z] = hit.cell;
        const catalogId = grid.catalogAt(x, y, z);
        if (catalogId === BEDROCK_BLOCK) return { state: ctx };
        if (!grid.remove(x, y, z)) return { state: ctx };
        // The broken block drops as a physical item at the cell it vacated; the
        // shell's walk-over pickup collects it. Ores drop their refined resource;
        // everything else drops itself so the pack accepts whatever you break.
        const dropId = catalogId === null ? null : oreForBlock(catalogId)?.resourceId ?? catalogId;
        if (dropId !== null) {
          ctx.scene.worldItem.spawn({ itemId: dropId, count: 1, position: [x, y, z] });
        }
        return { state: ctx };
      },
    },
    placeBlock: {
      apply(ctx, input) {
        const hit = aimedHit(ctx, input, grid, eyeHeight, reach);
        if (hit === null) return { state: ctx };
        const tx = hit.cell[0] + hit.normal[0];
        const ty = hit.cell[1] + hit.normal[1];
        const tz = hit.cell[2] + hit.normal[2];
        if (grid.has(tx, ty, tz)) return { state: ctx };
        const player = ctx.scene.entity.get(input.from);
        if (player !== null && occupiesCell(player.position, tx, ty, tz)) return { state: ctx };
        grid.set(input.itemId, tx, ty, tz);
        return { state: ctx };
      },
    },
  };
}
