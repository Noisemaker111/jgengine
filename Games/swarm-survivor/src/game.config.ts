import { defineGame } from "@jgengine/shell/defineGame";

import { assets, entitySprites } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { CombatOverlay } from "./game/ui/combat/CombatOverlay";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Swarm Survivor",
  assets,
  world,
  physics,
  input: keybinds,
  save: "none",
  content,
  loop,
  GameUI,
  entitySprites,
  WorldOverlay: CombatOverlay,
  camera: {
    rig: "topDown",
    topDown: { height: 24, pitch: 1.08, yaw: 0.78, followSmoothing: 9 },
  },
  worldItem: {
    rarityStyle: {
      common: { color: "#a566d9" },
      uncommon: { color: "#7fb84a", beam: true },
      rare: { color: "#4a86d8", beam: true },
      epic: { color: "#e0862e", beam: true, label: "Warden Essence" },
    },
    pickupRadius: 0.7,
  },
});
