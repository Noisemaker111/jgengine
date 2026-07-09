import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { ItemUseHandler, ItemUseInput } from "@jgengine/core/item/use";
import { scatterOffset } from "@jgengine/core/game/worldItem";
import { seededRng } from "@jgengine/core/item/affix";
import { BEDROCK_BLOCK, oreForBlock } from "./blocks";
import type { Vec3, VoxelGrid, VoxelHit } from "./voxelGrid";

/** Radius of the break-drop scatter, kept under half a cell so a drop lands in the column it was mined from. */
const DROP_SCATTER: { radius: number; minRadius: number } = { radius: 0.28, minRadius: 0.08 };

export const REACH = 6;
/** How far a drop is allowed to fall looking for footing before it just rests where the block was. */
const MAX_DROP_FALL = 48;

/**
 * The cell the drop comes to rest *on top of*: scans straight down from the
 * vacated cell for the first solid block and returns its top face. Breaking a
 * block with a solid stack beneath it drops in place; breaking a floating block
 * (tree leaves, an overhang) lets the drop fall to the surface below it.
 */
function settleTop(grid: VoxelGrid, x: number, y: number, z: number): number {
  for (let cy = y - 1; cy >= y - MAX_DROP_FALL; cy -= 1) {
    if (grid.has(x, cy, z)) return cy + 1;
  }
  return y;
}

function aimedHit(
  ctx: GameContext,
  input: ItemUseInput,
  grid: VoxelGrid,
  eyeHeight: number,
): VoxelHit | null {
  const player = ctx.scene.entity.get(input.from);
  if (player === null || input.aim === undefined || !("yaw" in input.aim)) return null;
  const { yaw, pitch } = input.aim;
  const cosPitch = Math.cos(pitch);
  const direction: Vec3 = [Math.sin(yaw) * cosPitch, Math.sin(pitch), Math.cos(yaw) * cosPitch];
  const origin: Vec3 = [player.position[0], player.position[1] + eyeHeight, player.position[2]];
  return grid.raycast(origin, direction, REACH);
}

function occupiesCell(position: readonly [number, number, number], x: number, y: number, z: number): boolean {
  const footY = Math.floor(position[1]);
  return Math.floor(position[0]) === x && Math.floor(position[2]) === z && (y === footY || y === footY + 1);
}

export function createEditorHandlers(
  grid: VoxelGrid,
  eyeHeight: number,
): Record<string, ItemUseHandler<GameContext>> {
  return {
    mine: {
      apply(ctx, input) {
        const hit = aimedHit(ctx, input, grid, eyeHeight);
        if (hit === null) return { state: ctx };
        const [x, y, z] = hit.cell;
        const catalogId = grid.catalogAt(x, y, z);
        if (catalogId === BEDROCK_BLOCK) return { state: ctx };
        if (!grid.remove(x, y, z)) return { state: ctx };
        // The broken block drops a physical item the shell's walk-over pickup
        // collects. Ores drop their refined resource; everything else drops
        // itself so the pack accepts whatever you break. The drop scatters a
        // little off the cell centre and settles onto the surface beneath it
        // instead of hanging in the air where the block used to be.
        const dropId = catalogId === null ? null : oreForBlock(catalogId)?.resourceId ?? catalogId;
        if (dropId !== null) {
          const [ox, , oz] = scatterOffset(seededRng(`${x},${y},${z}`), DROP_SCATTER);
          ctx.scene.worldItem.spawn({
            itemId: dropId,
            count: 1,
            position: [x + ox, settleTop(grid, x, y, z), z + oz],
          });
        }
        return { state: ctx };
      },
    },
    placeBlock: {
      apply(ctx, input) {
        const hit = aimedHit(ctx, input, grid, eyeHeight);
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
