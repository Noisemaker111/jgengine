import { defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { content } from "./game/content";
import { flowSystem } from "./game/flow";
import { idea } from "./game/idea";
import { entityModels, objectModels, scatterModels } from "./game/models";
import { seatMarker } from "./game/places";
import { realmView } from "./game/town";
import { GameUI } from "./game/ui/GameUI";
import { systems } from "./loop";
import { time, world } from "./world";

const seat = seatMarker(editorLayers).position;
const reach = (idea.grid.cells * idea.grid.cell) / 2 + 30;

export const game = defineGame({
  name: idea.name,
  world,
  // The sun runs through the day while the realm works.
  time,
  // WASD, the arrows, Q/E and the wheel belong to the RTS camera; builds sit on the number keys.
  input: {
    pause: ["Escape", "KeyP"],
    upgrade: ["KeyU"],
    demolish: ["Delete", "KeyX"],
    ...Object.fromEntries(idea.buildings.slice(0, 9).map((_, index) => [`build${index + 1}`, [`Digit${index + 1}`]])),
  },
  systems: [flowSystem, ...systems],
  content,
  GameUI,
  editorLayers,
  entityModels,
  objectModels,
  sceneScatterModels: scatterModels,
  worldHealthBars: false,
  look: idea.look,
  mood: idea.mood,
  uiKit: idea.kit,
  persist: { mode: "manual" },
  // Left click places what you hold or looks at a building; right click puts it down.
  pointer: { moveCommand: "realm.click", secondaryCommand: "realm.cancel" },
  camera: {
    rig: "rts",
    followEntityId: null,
    frustum: { far: 1400 },
    rts: {
      start: { x: seat.x, z: seat.z + 6 },
      height: 42,
      pitch: 0.78,
      yaw: Math.PI / 4,
      panSpeed: 40,
      edgeScroll: false,
      rotateSpeed: 1.2,
      bounds: { minX: seat.x - reach, maxX: seat.x + reach, minZ: seat.z - reach, maxZ: seat.z + reach },
      zoom: { min: 0.45, max: 2.2, speed: 1 },
    },
  },
  capture: {
    play: [{ name: "start", input: {} }],
    // `town`: a realm a few minutes in - homes, fields and a camp built and running.
    states: { town: [{ name: "start", input: {} }, { name: "stage", input: {} }] },
    probe: (ctx) => {
      const view = realmView(ctx);
      return {
        built: view.built,
        people: view.people,
        idle: view.idle,
        tier: view.tier,
        building: view.building.length,
        // The building in hand, as its number key (0: nothing in hand).
        armed: idea.buildings.findIndex((building) => building.id === view.armed) + 1,
        selected: view.selected === null ? 0 : 1,
        won: view.won ? 1 : 0,
        ...Object.fromEntries(view.resources.map((resource) => [resource.id, resource.amount])),
      };
    },
  },
});
