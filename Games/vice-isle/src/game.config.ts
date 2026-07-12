import { defineGame } from "@jgengine/shell/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";
import { assets } from "./game/assets";
import { content } from "./game/content";
import { inventories } from "./game/inventories";
import { keybinds } from "./game/keybinds";
import { OBJECTS } from "./game/objects/catalog";
import { prompts } from "./game/prompts";
import { renderEntity } from "./game/world/renderEntity";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Vice Isle",
  assets,
  world,
  physics,
  inventories,
  input: keybinds,
  server: { mode: "openworld" },
  save: "none",
  multiplayer: offline(),
  content,
  loop,
  GameUI,
  prompts,
  renderEntity,
  objectStyles: Object.fromEntries(OBJECTS.map((o) => [o.id, { color: o.color }])),
  worldHealthBars: { roles: ["enemy", "hostile"] },
  worldItem: {
    pickupRadius: 2.4,
    rarityStyle: {
      common: { color: "#cfd6de" },
      rare: { color: "#4fa5e8", beam: true },
      legendary: { color: "#ffb020", beam: true, label: "LEDGER" },
    },
  },
  pointer: { grabWorldItems: true },
  movement: { collideObjects: true },
  camera: {
    perspective: "third",
    minDistance: 4,
    maxDistance: 18,
    targetHeight: 1.7,
    frustum: { far: 900 },
  },
  backdrop: { background: "#ffe3b3" },
  orientation: "landscape",
});
