import type { GameContextContent } from "@jgengine/core/runtime/gameContext";
import { BLOCKS, PICKAXE } from "./blocks";

const itemUse: Record<string, string> = { [PICKAXE.id]: "mine" };
for (const block of BLOCKS) itemUse[block.id] = "placeBlock";

export const content: GameContextContent = {
  itemById: (id) => (itemUse[id] === undefined ? null : { use: itemUse[id] }),
  entityById: (id) => (id === "player" ? { movement: { walkSpeed: 5 }, role: "player" } : null),
};
