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
import { stations } from "./game/objects/stations";
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

const stationPrompts: readonly PositionedPrompt[] = stations.map((station) => ({
  id: `shop:${station.id}`,
  position: { x: station.position[0], z: station.position[1] },
  prompt: {
    radius: 3,
    display: { kind: "keybind", actionId: "interact" },
    invoke: { name: "shop.open", input: { station: station.id } },
  },
}));

function prompts(ctx: GameContext): readonly PositionedPrompt[] {
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  if (playerEntity === null) return [];
  const nearestId = ctx.scene.worldItem.nearestInRadius(playerEntity.position, 2.6);
  if (nearestId === null) return stationPrompts;
  const itemEntity = ctx.scene.entity.get(nearestId);
  if (itemEntity === null) return stationPrompts;
  return [
    ...stationPrompts,
    {
      id: `pickup:${nearestId}`,
      position: { x: itemEntity.position[0], z: itemEntity.position[2] },
      priority: 1,
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
  features: { quest: true, trade: true },
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
  capture: { play: ["run.start"] },
  entitySprites,
  audio: gameAudio,
  objectSounds,
  renderObject: renderCoverObject,
  environment: Arena,
  worldHealthBars: { roles: ["enemy"] },
  worldItem: { rarityStyle, pickupRadius: 2.6 },
  prompts,
  hotbarSelection: () => session.selectedSlot(),
  settings: {
    variant: "fullscreen",
    actions: [
      {
        id: "run.start",
        label: "Redeploy",
        kind: "danger",
        description: "Abandon this run and restart from wave one.",
        run: (ctx) => ctx.game.commands.run("run.start", {}),
      },
      {
        id: "run.endless",
        label: "Enter endless mode",
        description: "Push past the final wave into endless waves.",
        run: (ctx) => ctx.game.commands.run("run.endless", {}),
      },
    ],
  },
  backdrop: {
    background: ARENA_COLORS.sky,
    fog: { color: ARENA_COLORS.fog, near: 55, far: 140 },
  },
  lighting: {
    ambient: { color: "#6d7f94", intensity: 1.8 },
    hemisphere: { skyColor: "#5a7396", groundColor: "#2c3542", intensity: 1.5 },
    directional: [
      { color: "#e4f0ff", intensity: 2.4, position: [22, 34, 12], castShadow: true },
      { color: "#8fb3d9", intensity: 0.9, position: [-26, 28, -18] },
    ],
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
