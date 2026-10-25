import { defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { content } from "./game/content";
import { flowSystem } from "./game/flow";
import { idea } from "./game/idea";
import { entityModels, objectModels, scatterModels } from "./game/models";
import { hqMarker } from "./game/places";
import { GameUI } from "./game/ui/GameUI";
import { colonyView } from "./game/view";
import { systems } from "./loop";
import { time, world } from "./world";

const hq = hqMarker(editorLayers).position;
const reach = 120;

export const game = defineGame({
  name: idea.name,
  world,
  // The sun runs through the day while the colony works.
  time,
  // WASD, the arrows, Q/E and the wheel belong to the RTS camera; structures sit on the number keys.
  input: {
    pause: ["Escape", "KeyP"],
    selectAll: ["KeyF"],
    gather: ["KeyG"],
    ...Object.fromEntries(idea.structures.slice(0, 9).map((_, index) => [`build${index + 1}`, [`Digit${index + 1}`]])),
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
  // Left click (or drag) selects colonists; right click sends them, or places the structure in hand.
  pointer: { select: true, selectFilter: (id: string) => id.startsWith("col-"), orderCommand: "colony.order", secondaryCommand: "colony.order" },
  camera: {
    rig: "rts",
    followEntityId: null,
    frustum: { far: 1400 },
    rts: {
      start: { x: hq.x, z: hq.z },
      height: 62,
      pitch: 0.9,
      yaw: Math.PI / 2,
      panSpeed: 40,
      edgeScroll: false,
      rotateSpeed: 1.2,
      bounds: { minX: hq.x - reach, maxX: hq.x + reach, minZ: hq.z - reach, maxZ: hq.z + reach },
      zoom: { min: 0.4, max: 1.8, speed: 1 },
    },
  },
  capture: {
    play: [{ name: "start", input: {} }],
    // `outpost`: a colony a few minutes in - its plan built, everyone gathering, a raid close.
    states: { outpost: [{ name: "start", input: {} }, { name: "stage", input: {} }] },
    probe: (ctx) => {
      const view = colonyView(ctx);
      return {
        ...Object.fromEntries(view.resources.map((resource) => [resource.id, resource.value])),
        people: view.people,
        beds: view.beds,
        homes: view.homes,
        structures: view.structures,
        crowns: view.crowns,
        raids: view.raids,
        raid_in: view.raidIn,
        raiding: view.raiding ? 1 : 0,
        raiders: view.raiders,
        gathered: view.gathered,
        gathering: view.gathering,
        fighting: view.fighting,
        moving: view.moving,
        idle: view.idle,
        building: view.building,
        selected: view.selected,
        // The structure in hand, as its number key (0: nothing in hand).
        armed: idea.structures.findIndex((structure) => structure.id === view.armed) + 1,
        won: view.won ? 1 : 0,
        lost: view.lost ? 1 : 0,
      };
    },
  },
});
