import { defineGame } from "@jgengine/shell/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";
import { assets } from "./game/assets";
import { content } from "./game/content";
import { inventories } from "./game/inventories";
import { keybinds } from "./game/keybinds";
import { prompts } from "./game/prompts";
import { entityModels, objectModels } from "./game/world/models";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";
import { drivingStore } from "./game/handroll";

export const game = defineGame({
  name: "Vice Isle",
  features: { quest: true, trade: true, dialogue: true },
  assets,
  world,
  physics,
  inventories,
  input: keybinds,
  server: { mode: "openworld" },
  save: "none",
  persist: true,
  multiplayer: offline(),
  content,
  loop,
  GameUI,
  capture: {
    play: ["game.start"],
    probe: (ctx) => {
      const vehicleId = drivingStore.read(ctx);
      const entity = ctx.scene.entity.get(vehicleId ?? ctx.player.userId);
      return { x: entity?.position[0] ?? 0, y: entity?.position[1] ?? 0, z: entity?.position[2] ?? 0 };
    },
  },
  prompts,
  entityModels,
  objectModels,
  lighting: {
    ambient: { color: "#ffe6c4", intensity: 0.72 },
    hemisphere: { skyColor: "#bfe2f2", groundColor: "#7a8560", intensity: 0.7 },
    directional: [{ color: "#fff2d8", intensity: 1.25, position: [120, 220, 40], castShadow: true }],
  },
  shadows: true,
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
    rig: "chase",
    chase: {
      distance: 7.5,
      height: 3,
      lookHeight: 1.15,
      springDamping: 7.5,
      fov: { base: 62, max: 84, speedForMax: 55 },
      shakePerSpeed: 0.0015,
      lead: { time: 0.22, max: 8 },
      bank: { perYawRate: 0.09, max: 0.16, damping: 7 },
    },
    shake: { maxOffset: 0.24, maxRoll: 0.045, decayPerSecond: 2.8, exponent: 2, frequency: 21 },
    frustum: { far: 900 },
  },
  backdrop: {
    background: "#a9dcf0",
    fog: { color: "#cfe9f2", near: 150, far: 640 },
  },
  time: { dayLength: 720, start: 320 },
  orientation: "landscape",
});
