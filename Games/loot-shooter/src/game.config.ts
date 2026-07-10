import { offline } from "@jgengine/core/runtime/adapter";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { RarityStyle } from "@jgengine/core/game/worldItem";
import { defineGame } from "@jgengine/shell/defineGame";

import { assets, entitySprites } from "./game/assets";
import { gameAudio, objectSounds } from "./game/audio/catalog";
import { content } from "./game/content";
import { inventories } from "./game/inventories";
import { keybinds } from "./game/keybinds";
import { RARITY_COLORS, ARENA_COLORS } from "./game/palette";
import { session } from "./game/run/session";
import { GameUI } from "./game/ui/GameUI";
import { Arena } from "./game/world/Arena";
import { renderCoverObject } from "./game/world/renderObject";
import { clampToArena } from "./game/world/setup";
import { loop } from "./loop";
import { physics, world } from "./world";

const rarityStyle: Record<string, RarityStyle> = {
  common: { color: RARITY_COLORS.common, label: "Common" },
  uncommon: { color: RARITY_COLORS.uncommon, beam: true, label: "Uncommon" },
  rare: { color: RARITY_COLORS.rare, beam: true, label: "Rare" },
  epic: { color: RARITY_COLORS.epic, beam: true, label: "Epic" },
  legendary: { color: RARITY_COLORS.legendary, beam: true, label: "Legendary" },
};

function prompts(ctx: GameContext): readonly PositionedPrompt[] {
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  if (playerEntity === null) return [];
  const nearestId = ctx.scene.worldItem.nearestInRadius(playerEntity.position, 2.6);
  if (nearestId === null) return [];
  const itemEntity = ctx.scene.entity.get(nearestId);
  if (itemEntity === null) return [];
  return [
    {
      id: `pickup:${nearestId}`,
      position: { x: itemEntity.position[0], z: itemEntity.position[2] },
      prompt: {
        radius: 2.6,
        display: { kind: "keybind", actionId: "interact" },
        invoke: { name: "pickup", input: undefined },
      },
    },
  ];
}

export const game = defineGame({
  name: "Loot Shooter",
  assets,
  world,
  physics,
  inventories,
  input: keybinds,
  server: { mode: "ffa" },
  save: "none",
  multiplayer: offline(),
  content,
  loop,
  GameUI,
  entitySprites,
  audio: gameAudio,
  objectSounds,
  renderObject: renderCoverObject,
  environment: Arena,
  worldHealthBars: { roles: ["enemy"] },
  worldItem: { rarityStyle, pickupRadius: 2.6 },
  prompts,
  hotbarSelection: () => session.selectedSlot(),
  backdrop: {
    background: ARENA_COLORS.sky,
    fog: { color: ARENA_COLORS.fog, near: 55, far: 140 },
  },
  lighting: {
    ambient: { color: "#5a6b7e", intensity: 1.35 },
    hemisphere: { skyColor: "#48607e", groundColor: "#232a36", intensity: 1.15 },
    directional: [{ color: "#e4f0ff", intensity: 2.0, position: [22, 34, 12], castShadow: true }],
  },
  movement: {
    collideObjects: true,
    beforeCommit: (frame) => {
      const [x, z] = clampToArena(frame.next[0], frame.next[2]);
      if (x === frame.next[0] && z === frame.next[2]) return undefined;
      return [x, frame.next[1], z];
    },
  },
  camera: {
    perspective: "first",
    firstPerson: { eyeHeight: 1.6, sensitivity: 0.0023, reticle: true, viewmodel: true },
  },
  orientation: "landscape",
});
