import { defineGame } from "@jgengine/shell/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";
import { assets } from "./game/assets";
import { content } from "./game/content";
import { inventories } from "./game/inventories";
import { keybinds } from "./game/keybinds";
import { OBJECTS } from "./game/objects/catalog";
import { prompts } from "./game/prompts";
import { renderEntity } from "./game/world/renderEntity";
import { renderObject } from "./game/world/renderObject";
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
  renderObject,
  objectStyles: Object.fromEntries(OBJECTS.map((o) => [o.id, { color: o.color }])),
  lighting: {
    ambient: { color: "#ffe6c4", intensity: 0.85 },
    hemisphere: { skyColor: "#ffe9c0", groundColor: "#7a8560", intensity: 0.75 },
    directional: [{ color: "#fff2d8", intensity: 1.1, position: [120, 220, 40], castShadow: false }],
  },
  shadows: false,
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
  time: { dayLength: 720, start: 320 },
  orientation: "landscape",
});
