import { defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { content } from "./game/content";
import { flowSystem } from "./game/flow";
import { idea } from "./game/idea";
import { entityModels, objectModels, scatterModels } from "./game/models";
import { fieldCentre } from "./game/places";
import { GameUI } from "./game/ui/GameUI";
import { holdView } from "./game/view";
import { systems } from "./loop";
import { time, world } from "./world";

const centre = fieldCentre(editorLayers);
const reach = 110;

export const game = defineGame({
  name: idea.name,
  world,
  // The sun runs through the day while the waves come.
  time,
  // WASD, the arrows, Q/E and the wheel belong to the RTS camera; towers sit on the number keys.
  input: {
    pause: ["Escape", "KeyP"],
    upgrade: ["KeyU"],
    sell: ["Delete", "KeyX"],
    callWave: ["KeyN", "Space"],
    ...Object.fromEntries(idea.towers.slice(0, 9).map((_, index) => [`build${index + 1}`, [`Digit${index + 1}`]])),
  },
  systems: [flowSystem, ...systems],
  content,
  GameUI,
  editorLayers,
  entityModels,
  objectModels,
  sceneScatterModels: scatterModels,
  worldHealthBars: true,
  look: idea.look,
  mood: idea.mood,
  uiKit: idea.kit,
  persist: { mode: "manual" },
  // Left click builds what you hold on the nearest pad or looks at a tower; right click puts it down.
  pointer: { moveCommand: "hold.click", secondaryCommand: "hold.cancel" },
  camera: {
    rig: "rts",
    followEntityId: null,
    frustum: { far: 1400 },
    rts: {
      start: { x: centre.x, z: centre.z },
      height: 62,
      pitch: 0.92,
      yaw: Math.PI / 2,
      panSpeed: 45,
      edgeScroll: false,
      rotateSpeed: 1.2,
      bounds: { minX: centre.x - reach, maxX: centre.x + reach, minZ: centre.z - reach, maxZ: centre.z + reach },
      zoom: { min: 0.4, max: 1.8, speed: 1 },
    },
  },
  capture: {
    play: [{ name: "start", input: {} }],
    // `siege`: a few waves in - towers on the pads near the core and the next wave marching.
    states: { siege: [{ name: "start", input: {} }, { name: "stage", input: {} }] },
    probe: (ctx) => {
      const view = holdView(ctx);
      return {
        coin: view.coin,
        lives: view.lives,
        wave: view.wave,
        cleared: view.cleared,
        kills: view.kills,
        raiding: view.raiding ? 1 : 0,
        calm: view.calm,
        marching: view.marching,
        towers: view.towers,
        building: view.building,
        // The tower in hand, as its number key (0: nothing in hand).
        armed: idea.towers.findIndex((tower) => tower.id === view.armed) + 1,
        selected: view.selected === null ? 0 : 1,
        level: view.selected?.level ?? 0,
        won: view.won ? 1 : 0,
        lost: view.lost ? 1 : 0,
      };
    },
  },
});
