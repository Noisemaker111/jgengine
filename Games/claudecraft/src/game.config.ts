import { ws } from "@jgengine/core/runtime/adapter";
import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineGame } from "@jgengine/shell/defineGame";

import { assets, entitySprites } from "./game/assets";
import { audio } from "./game/audio/catalog";
import { entityModels } from "./game/models";
import { content } from "./game/content";
import { inventories } from "./game/inventories";
import { keybinds } from "./game/keybinds";
import { craftingPrompts, FISHING_SPOT, FORGE } from "./game/crafting/systems";
import { LOCKBOX_CATALOG, lockboxPrompts } from "./game/minigames/lockpick";
import { GATHER_NODES } from "./game/professions/catalog";
import { gatherPrompts } from "./game/professions/gathering";
import {
  AUCTION_BOARD,
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
import { systems } from "./game/systems";
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
    ...lockboxPrompts(ctx),
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
  [AUCTION_BOARD]: { color: "#b5651d" },
  [DELVE_PORTAL]: { color: "#8b5cf6" },
  [VALE_CUP_STADIUM]: { color: "#c4a35a" },
  [YUMI_SHRINE]: { color: "#e8a0bf" },
  [LOCKBOX_CATALOG]: { color: "#8a6d2f" },
  ...Object.fromEntries(
    GATHER_NODES.map((node) => [node.id, { color: NODE_COLORS[node.profession] ?? "#888888" }]),
  ),
};

export const game = defineGame({
  capture: { play: [{ name: "class.select", input: { classId: "warrior" } }] },
  name: "World of ClaudeCraft",
  features: { quest: true, trade: true, chat: true },
  multiplayer: ws({ authority: "server" }),
  assets,
  world,
  physics,
  inventories,
  input: keybinds,
  content,
  systems,
  loop,
  GameUI,
  entitySprites,
  entityModels,
  audio,
  prompts,
  objectStyles,
  settings: { variant: "sidebar" },
  worldHealthBars: { roles: ["enemy", "hostile"], maxDistance: 60 },
  nameplates: { maxDistance: 40 },
  postProcessing: {
    toneMapping: "aces",
    ao: { radius: 2, intensity: 1.2, distanceFalloff: 3.6, blend: 0.85 },
    bloom: { strength: 0.32, radius: 0.55, threshold: 0.85 },
    grade: {},
  },
  camera: {
    perspective: "third",
    minDistance: 3,
    maxDistance: 22,
    initialDistance: 12,
    initialYaw: Math.PI,
    initialPitch: 0.32,
    pitchClamp: [-0.4, 1.35],
    targetHeight: 1.8,
    rotateSpeed: 0.3,
    collision: { enabled: true, padding: 0.4, minTargetDistance: 1 },
    frustum: { far: 720 },
  },
});

// Attribution for the required-credit MIT port. Parsed by the desktop project
// surface (apps/desktop/src/project/gameMeta.ts) and surfaced on the game's
// jgengine.com page; the in-game HUD renders its own CreditLine.
export const credit = { text: "Port of World of ClaudeCraft · Levy Street (MIT)", url: "https://github.com/levy-street/world-of-claudecraft", handle: "levy-street" };
