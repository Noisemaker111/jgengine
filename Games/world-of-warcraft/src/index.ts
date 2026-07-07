import type { ComponentType } from "react";
import type { PlayableGame } from "@jgengine/core/game/playableGame";
import { game } from "./game.config";
import { content } from "./content";
import { loop } from "./loop";
import { GameUI } from "./ui/GameUI";
import { getSelectedHotbarSlot } from "./ui/uiController";
import { WowProjectileOverlay } from "./combat/WowProjectileOverlay";

export const wowGame: PlayableGame<ComponentType, ComponentType> = {
  game,
  content,
  loop,
  GameUI,
  WorldOverlay: WowProjectileOverlay,
  entitySprites: {
    player_default: { url: "/game-assets/wow/characters/player-armored-adventurer.png", width: 1.7, height: 2.35, y: 1.2 },
    kobold_grunt: { url: "/game-assets/wow/characters/small-raider-enemy.png", width: 1.35, height: 1.8, y: 0.9 },
    forest_wolf: { url: "/game-assets/wow/characters/shadow-hound-enemy.png", width: 2.25, height: 1.45, y: 0.75 },
    kobold_elite: { url: "/game-assets/wow/characters/stone-guardian-enemy.png", width: 2.25, height: 2.45, y: 1.25 },
    npc_marshal: { url: "/game-assets/wow/characters/elder-quest-giver.png", width: 1.45, height: 2.25, y: 1.15 },
  },
  hotbarSelection: getSelectedHotbarSlot,
  camera: {
    minDistance: 5,
    maxDistance: 32,
    initialDistance: 11,
    targetHeight: 1.2,
    followLock: true,
    targetSmoothing: 9,
    dragTargetSmoothing: 12,
  },
};

export default wowGame;
