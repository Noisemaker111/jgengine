import { DEFAULT_WALK_CODES, defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { content } from "./game/content";
import { flowSystem } from "./game/flow";
import { idea } from "./game/idea";
import { entityModels, objectModels, scatterModels } from "./game/models";
import { farmView, prompts } from "./game/prompts";
import { GameUI } from "./game/ui/GameUI";
import { onNewPlayer, systems } from "./loop";
import { time, world } from "./world";

export const game = defineGame({
  name: idea.name,
  world,
  // Crops grow on this clock; sleeping jumps it to the next morning.
  time,
  input: {
    ...DEFAULT_WALK_CODES,
    sprint: ["ShiftLeft"],
    interact: ["KeyE"],
    pause: ["Escape", "KeyP"],
    ...Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`digit${index + 1}`, [`Digit${index + 1}`]])),
  },
  systems: [flowSystem, ...systems],
  loop: { onNewPlayer },
  content,
  GameUI,
  prompts,
  editorLayers,
  entityModels,
  objectModels,
  sceneScatterModels: scatterModels,
  look: idea.look,
  mood: idea.mood,
  uiKit: idea.kit,
  persist: { mode: "manual" },
  camera: { rig: "orbit", minDistance: 4, maxDistance: 14, initialDistance: 8, initialHeight: 4, frustum: { far: 700 } },
  capture: {
    play: [{ name: "start", input: {} }],
    states: { morning: [{ name: "start", input: {} }] },
    probe: (ctx) => {
      const view = farmView(ctx);
      return {
        coins: view.coins,
        day: view.day,
        hour: view.hour,
        planted: view.planted,
        ripe: view.ripe,
        harvested: view.harvested,
        carrying: view.bag.count,
        shipped: view.shipped,
        earned: view.earned,
        caught: view.caught,
        fishing: view.fishing.phase === "idle" ? 0 : view.fishing.phase === "waiting" ? 1 : 2,
        inZone: view.fishing.inZone ? 1 : 0,
        casts: view.fishing.casts,
      };
    },
  },
});
