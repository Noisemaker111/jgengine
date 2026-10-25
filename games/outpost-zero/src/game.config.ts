import { DEFAULT_WALK_CODES, defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { content } from "./game/content";
import { flowSystem } from "./game/flow";
import { gunView, SHOULDER, shoulderView } from "./game/guns";
import { idea } from "./game/idea";
import { entityModels, objectModels, scatterModels } from "./game/models";
import { opsView } from "./game/play";
import { GameUI } from "./game/ui/GameUI";
import { onNewPlayer, systems } from "./loop";
import { time, world } from "./world";

const fastest = Math.max(...idea.guns.map((gun) => gun.rpm));

export const game = defineGame({
  name: idea.name,
  world,
  time,
  input: {
    ...DEFAULT_WALK_CODES,
    sprint: ["ShiftLeft"],
    // Held, the trigger re-fires as fast as the quickest gun; each gun's own cadence and `auto` gate it.
    fire: { hold: ["mouse0", "KeyF"], repeatMs: Math.round(60000 / fastest) },
    aim: { hold: ["mouse2"] },
    reload: ["KeyR"],
    pause: ["Escape", "KeyP"],
    ...Object.fromEntries(idea.guns.map((_, index) => [`gun${index + 1}`, [`Digit${index + 1}`]])),
    ...Object.fromEntries(idea.upgrades.map((_, index) => [`upgrade${index + 1}`, [`Digit${idea.guns.length + index + 1}`]])),
  },
  systems: [flowSystem, ...systems],
  loop: { onNewPlayer },
  content,
  GameUI,
  editorLayers,
  entityModels,
  objectModels,
  sceneScatterModels: scatterModels,
  worldHealthBars: { statId: "health" },
  presentationEffects: { tracers: true },
  look: idea.look,
  mood: idea.mood,
  uiKit: idea.kit,
  persist: { mode: "manual" },
  camera: {
    rig: "shoulder",
    shoulder: { shoulderOffset: SHOULDER.offset, distance: 3.6, heightOffset: SHOULDER.height, ads: { distance: 2, shoulderOffset: SHOULDER.adsOffset, fov: 40 }, fov: 58 },
    frustum: { far: 900 },
    weapon: () => shoulderView.current,
  },
  capture: {
    play: [{ name: "start", input: {} }],
    states: { fight: [{ name: "start", input: {} }, { name: "approach", input: {} }] },
    probe: (ctx) => {
      const view = opsView(ctx);
      const gun = gunView(ctx);
      const health = ctx.scene.entity.stats.get(ctx.player.userId, "health");
      return {
        cash: view.cash,
        kills: view.kills,
        cleared: view.cleared,
        guards: view.outposts.reduce((sum, outpost) => sum + outpost.left, 0),
        nearest: view.outposts.find((outpost) => !outpost.clear)?.left ?? 0,
        health: Math.round(health?.current ?? 0),
        loaded: gun.loaded,
        down: view.down ? 1 : 0,
      };
    },
  },
});
