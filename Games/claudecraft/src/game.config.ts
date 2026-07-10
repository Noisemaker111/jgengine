import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineGame } from "@jgengine/shell/defineGame";

import { assets, entitySprites } from "./game/assets";
import { content } from "./game/content";
import { inventories } from "./game/inventories";
import { keybinds } from "./game/keybinds";
import { GATHER_NODES } from "./game/professions/catalog";
import { gatherPrompts } from "./game/professions/gathering";
import { npcPrompts, strongboxPrompts, STRONGBOX } from "./game/world/setup";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";

function prompts(ctx: GameContext): readonly PositionedPrompt[] {
  return [...npcPrompts(ctx), ...gatherPrompts(ctx), ...strongboxPrompts(ctx)];
}

const NODE_COLORS: Record<string, string> = {
  mining: "#9aa0ad",
  logging: "#8a5a34",
  herbalism: "#5d9c4f",
};

const objectStyles = {
  [STRONGBOX]: { color: "#c9a227" },
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
