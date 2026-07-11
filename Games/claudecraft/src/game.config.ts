import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineGame } from "@jgengine/shell/defineGame";

import { assets, entitySprites } from "./game/assets";
import { content } from "./game/content";
import { inventories } from "./game/inventories";
import { keybinds } from "./game/keybinds";
import { craftingPrompts, FISHING_SPOT, FORGE } from "./game/crafting/systems";
import { GATHER_NODES } from "./game/professions/catalog";
import { gatherPrompts } from "./game/professions/gathering";
import {
  contentPrompts,
  DELVE_PORTAL,
  dungeonPrompts,
  MAILBOX,
  npcPrompts,
  strongboxPrompts,
  STRONGBOX,
  VALE_CUP_STADIUM,
  YUMI_SHRINE,
} from "./game/world/setup";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";

function prompts(ctx: GameContext): readonly PositionedPrompt[] {
  return [
    ...npcPrompts(ctx),
    ...gatherPrompts(ctx),
    ...strongboxPrompts(ctx),
    ...dungeonPrompts(ctx),
    ...craftingPrompts(ctx),
    ...contentPrompts(ctx),
  ];
}

const NODE_COLORS: Record<string, string> = {
  mining: "#9aa0ad",
  logging: "#8a5a34",
  herbalism: "#5d9c4f",
};

const objectStyles = {
  [STRONGBOX]: { color: "#c9a227" },
  [FORGE]: { color: "#5a4a3a" },
  [FISHING_SPOT]: { color: "#3a6a8a" },
  [MAILBOX]: { color: "#6b8cae" },
  [DELVE_PORTAL]: { color: "#8b5cf6" },
  [VALE_CUP_STADIUM]: { color: "#c4a35a" },
  [YUMI_SHRINE]: { color: "#e8a0bf" },
  ...Object.fromEntries(
    GATHER_NODES.map((node) => [node.id, { color: NODE_COLORS[node.profession] ?? "#888888" }]),
  ),
};

export const game = defineGame({
  name: "World of ClaudeCraft",
  assets,
  world,
  physics,
  inventories,
  input: keybinds,
  content,
  loop,
  GameUI,
  entitySprites,
  prompts,
  objectStyles,
  worldHealthBars: true,
  camera: {
    perspective: "third",
    minDistance: 3.5,
    maxDistance: 16,
    targetHeight: 1.8,
    frustum: { far: 720 },
  },
});
