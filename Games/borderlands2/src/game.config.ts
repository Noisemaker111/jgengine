import { offline } from "@jgengine/core/runtime/adapter";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { RarityStyle } from "@jgengine/core/game/worldItem";
import { defineGame } from "@jgengine/shell/defineGame";

import { assets, entitySprites } from "./game/assets";
import { content } from "./game/content";
import { inventories } from "./game/inventories";
import { keybinds } from "./game/keybinds";
import { PANDORA, RARITY_COLORS } from "./game/palette";
import { session } from "./game/session";
import { GameUI } from "./game/ui/GameUI";
import { AMMO_CHESTS, RED_CHESTS } from "./game/world/setup";
import { CLAPTRAP_POS, MARCUS_VENDOR_POS, ZED_VENDOR_POS } from "./game/world/sites";
import { loop } from "./loop";
import { physics, world } from "./world";

const rarityStyle: Record<string, RarityStyle> = {
  common: { color: RARITY_COLORS.common, label: "Common" },
  uncommon: { color: RARITY_COLORS.uncommon, beam: true, label: "Uncommon" },
  rare: { color: RARITY_COLORS.rare, beam: true, label: "Rare" },
  epic: { color: RARITY_COLORS.epic, beam: true, label: "Epic" },
  legendary: { color: RARITY_COLORS.legendary, beam: true, label: "Legendary" },
};

const staticPrompts: readonly PositionedPrompt[] = [
  {
    id: "vendor:marcus",
    position: { x: MARCUS_VENDOR_POS[0], z: MARCUS_VENDOR_POS[2] },
    prompt: {
      radius: 3.2,
      display: { kind: "keybind", actionId: "interact", label: "Marcus Munitions" },
      invoke: { name: "vendor.open", input: { vendor: "marcus" } },
    },
  },
  {
    id: "vendor:zed",
    position: { x: ZED_VENDOR_POS[0], z: ZED_VENDOR_POS[2] },
    prompt: {
      radius: 3.2,
      display: { kind: "keybind", actionId: "interact", label: "Dr. Zed's Meds" },
      invoke: { name: "vendor.open", input: { vendor: "zed" } },
    },
  },
  {
    id: "npc:claptrap",
    position: { x: CLAPTRAP_POS[0], z: CLAPTRAP_POS[2] },
    prompt: {
      radius: 3,
      display: { kind: "keybind", actionId: "interact", label: "CL4P-TP" },
      invoke: { name: "vendor.open", input: { vendor: "claptrap" } },
    },
  },
  ...RED_CHESTS.map((chest, index) => ({
    id: `chest:red:${index}`,
    position: { x: chest.x, z: chest.z },
    prompt: {
      radius: 2.8,
      display: { kind: "keybind", actionId: "interact", label: "Weapon Chest" } as const,
      invoke: { name: "chest.openRed", input: { instanceId: `red_chest_${index}` } },
    },
  })),
  ...AMMO_CHESTS.map((chest, index) => ({
    id: `chest:ammo:${index}`,
    position: { x: chest.x, z: chest.z },
    prompt: {
      radius: 2.8,
      display: { kind: "keybind", actionId: "interact", label: "Ammo Chest" } as const,
      invoke: { name: "chest.openAmmo", input: { instanceId: `ammo_chest_${index}` } },
    },
  })),
];

function prompts(ctx: GameContext): readonly PositionedPrompt[] {
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  if (playerEntity === null) return staticPrompts;
  const nearestId = ctx.scene.worldItem.nearestInRadius(playerEntity.position, 2.8);
  if (nearestId === null) return staticPrompts;
  const itemEntity = ctx.scene.entity.get(nearestId);
  if (itemEntity === null) return staticPrompts;
  return [
    ...staticPrompts,
    {
      id: `pickup:${nearestId}`,
      position: { x: itemEntity.position[0], z: itemEntity.position[2] },
      priority: 1,
      prompt: {
        radius: 2.8,
        display: { kind: "keybind", actionId: "interact" },
        invoke: { name: "pickup", input: undefined },
      },
    },
  ];
}

export const game = defineGame({
  name: "Borderlands 2 Demake",
  assets,
  world,
  physics,
  inventories,
  input: keybinds,
  server: { mode: "campaign" },
  save: "none",
  multiplayer: offline(),
  content,
  loop,
  GameUI,
  entitySprites,
  worldHealthBars: { roles: ["enemy"] },
  worldItem: { rarityStyle, pickupRadius: 2.8 },
  prompts,
  hotbarSelection: () => session.selectedSlot(),
  backdrop: {
    background: PANDORA.sky,
    fog: { color: PANDORA.fog, near: 120, far: 420 },
  },
  lighting: {
    ambient: { color: "#c9b8a0", intensity: 1.4 },
    hemisphere: { skyColor: "#b8d2de", groundColor: "#7a5638", intensity: 1.2 },
    directional: [
      { color: "#fff2d8", intensity: 2.6, position: [40, 60, 20], castShadow: true },
      { color: "#d9915c", intensity: 0.8, position: [-30, 30, -25] },
    ],
  },
  movement: { collideObjects: true },
  camera: {
    perspective: "first",
    firstPerson: { eyeHeight: 1.62, sensitivity: 0.0023, reticle: true, viewmodel: true },
    frustum: { far: 800 },
  },
  orientation: "landscape",
});
