import { defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { content } from "./game/content";
import { flowSystem } from "./game/flow";
import { idea } from "./game/idea";
import { entityModels, objectModels, scatterModels } from "./game/models";
import { raceView } from "./game/race";
import { GameUI } from "./game/ui/GameUI";
import { onNewPlayer, systems } from "./loop";
import { time, world } from "./world";

export const game = defineGame({
  name: idea.name,
  world,
  time,
  // No walk bindings: the race loop drives the car from these actions.
  input: {
    throttle: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    steerLeft: ["KeyA", "ArrowLeft"],
    steerRight: ["KeyD", "ArrowRight"],
    handbrake: ["Space"],
    nitro: ["ShiftLeft"],
    race: ["Enter"],
    assist: ["KeyT"],
    pause: ["Escape", "KeyP"],
    ...Object.fromEntries(idea.upgrades.map((_, index) => [`buy${index + 1}`, [`Digit${index + 1}`]])),
  },
  systems: [flowSystem, ...systems],
  loop: { onNewPlayer },
  content,
  GameUI,
  editorLayers,
  entityModels,
  objectModels,
  sceneScatterModels: scatterModels,
  look: idea.look,
  mood: idea.mood,
  uiKit: idea.kit,
  persist: { mode: "manual" },
  camera: { rig: "chase", chase: { distance: 7.5, height: 2.6, lookHeight: 1.1, fov: { base: 66, max: 84, speedForMax: 40 }, distanceBySpeed: { extra: 2, speedForMax: 40 }, shakePerSpeed: 0.004 } },
  capture: {
    play: [{ name: "start", input: {} }],
    states: { race: [{ name: "start", input: {} }, { name: "race", input: {} }] },
    probe: (ctx) => {
      const view = raceView(ctx);
      return {
        racing: view.phase === "racing" ? 1 : 0,
        rivals: view.field - 1,
        speed: view.speed,
        lap: view.lap,
        position: view.position,
        cash: view.cash,
        assist: view.assist ? 1 : 0,
      };
    },
  },
});
