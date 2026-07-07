import type { ComponentType } from "react";
import type { PlayableGame } from "@jgengine/core/game/playableGame";
import { buses, entitySounds, sounds } from "./audio";
import { lootFilter } from "@jgengine/core/game/lootFilter";
import { game } from "./game.config";
import { content } from "./content";
import { loop } from "./loop";
import { GameUI } from "./ui/GameUI";

export const lootShooterGame: PlayableGame<ComponentType, ComponentType> = {
  game,
  content,
  loop,
  GameUI,
  worldHealthBars: true,
  camera: {
    perspective: "first",
    firstPerson: { eyeHeight: 1.6, sensitivity: 0.0025, reticle: true, viewmodel: true },
  },
  audio: { sounds, buses },
  entitySounds,
  pointer: { grabWorldItems: true },
  worldItem: {
    pickupRadius: 3,
    rarityStyle: {
      common: { color: "#9ca3af", beam: false },
      rare: { color: "#60a5fa", beam: true, label: "Rare" },
      legendary: { color: "#f59e0b", beam: true, label: "Legendary" },
    },
    filter: lootFilter([
      { id: "hide-common-resource", when: { rarity: "common", baseType: "resource" }, hide: true },
      { id: "legendary-callout", when: { rarity: "legendary" }, beam: true, color: "#f59e0b", label: "LEGENDARY" },
    ]),
  },
};

export default lootShooterGame;
