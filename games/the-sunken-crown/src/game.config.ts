import { DEFAULT_WALK_CODES, defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { content } from "./game/content";
import { flowSystem } from "./game/flow";
import { idea } from "./game/idea";
import { canSprint, journeyView } from "./game/journey";
import { entityModels, objectModels, scatterModels } from "./game/models";
import { prompts } from "./game/prompts";
import { GOAL, journey, placeId, relicId } from "./game/spec";
import { GameUI } from "./game/ui/GameUI";
import { onNewPlayer, systems } from "./loop";
import { time, world } from "./world";

const first = idea.landmarks.find((landmark) => landmark.relic !== undefined);
const second = idea.landmarks.filter((landmark) => landmark.relic !== undefined)[1];

export const game = defineGame({
  name: idea.name,
  world,
  // A slow day passes while you walk: long light, a dusk worth stopping for.
  time,
  // Binding the movement actions makes the shell drive the walk controller.
  input: {
    ...DEFAULT_WALK_CODES,
    sprint: ["ShiftLeft"],
    interact: ["KeyE"],
    attack: ["mouse0", "KeyF"],
    travel: ["KeyT"],
    pause: ["Escape", "KeyP"],
  },
  // Sprint runs on the stamina bar the journey keeps; a relic deepens it.
  movement: { canSprint },
  systems: [flowSystem, ...systems],
  loop: { onNewPlayer },
  content,
  GameUI,
  prompts,
  editorLayers,
  entityModels,
  objectModels,
  sceneScatterModels: scatterModels,
  worldHealthBars: { statId: "health" },
  look: idea.look,
  mood: idea.mood,
  uiKit: idea.kit,
  persist: { mode: "manual" },
  camera: { rig: "orbit", minDistance: 4, maxDistance: 18 },
  capture: {
    play: [{ name: "start", input: {} }],
    // `journey`: the first place found and its relic taken, so a clip opens with glide in hand.
    states: {
      journey: [
        { name: "start", input: {} },
        ...(first === undefined
          ? []
          : [
              { name: `${idea.spec}.act`, input: { action: "discover", target: placeId(first.id) } },
              { name: `${idea.spec}.act`, input: { action: "take_relic", target: relicId(first.id) } },
            ]),
        ...(second === undefined ? [] : [{ name: `${idea.spec}.act`, input: { action: "discover", target: placeId(second.id) } }]),
      ],
    },
    probe: (ctx) => {
      const view = journeyView(ctx);
      const world = journey.of(ctx);
      return {
        found: view.found,
        relics: view.relics,
        won: view.won ? 1 : 0,
        guardians: view.guardians,
        gliding: view.gliding ? 1 : 0,
        glided: view.glided,
        stamina: view.stamina,
        distance: view.distance ?? -1,
        goalLit: world.fact(`${GOAL}.lit`) === true ? 1 : 0,
        x: view.at?.[0] ?? 0,
        z: view.at?.[1] ?? 0,
        y: ctx.scene.entity.get(ctx.player.userId)?.position[1] ?? 0,
      };
    },
  },
});
