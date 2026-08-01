import { defineGame } from "@jgengine/shell/defineGame";

import { assets } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { entityModels, objectModels } from "./game/models";
import { GameUI } from "./game/ui/GameUI";
import { lifecycle, onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Wreckway",
  world,
  physics,
  input: keybinds,
  assets,
  content,
  loop: { onInit, onNewPlayer, onTick },
  lifecycle,
  GameUI,
  capture: {
    play: ["startRun"],
    views: {
      corridor: {
        description: "Raised three-quarter down the canyon at the canyons/flats seam — zone palettes, wall silhouettes, haul road.",
        look: "0,150",
        lookFrom: "74,34,0.55",
        run: ["startRun"],
      },
      gantry: {
        description: "The gantry run's crane legs and container stacks, framed from the corridor floor.",
        look: "0,360",
        lookFrom: "52,14,0.35",
        run: ["startRun"],
      },
    },
    probe: (ctx): Record<string, number> => {
      const car = ctx.scene.entity.get(ctx.player.userId);
      if (car === null) return {};
      return { x: car.position[0], y: car.position[1], z: car.position[2] };
    },
  },
  entityModels,
  objectModels,
  shadows: true,
  // Low warm key over the driver's right wall: the near row is short enough that its shadow stops
  // mid-corridor, so the run is split lit/shadow lengthwise. The cool hemisphere and blue fill keep
  // the shadow half readable instead of collapsing to black under a dusk key this low.
  lighting: {
    // Warm, not cool: a neutral-grey fill made every wall shadow read as a sheet of standing water
    // beside sunlit orange dirt. Shade here is a value step inside one hue family.
    ambient: { color: "#7a6455", intensity: 0.28 },
    hemisphere: { skyColor: "#a08a72", groundColor: "#6b4526", intensity: 0.68 },
    directional: [
      {
        color: "#ffb066",
        intensity: 2.6,
        position: [110, 95, -46],
        castShadow: true,
        // The run is 470m long, so a single ortho frustum drops contact shadows a few seconds in.
        cascades: 3,
        shadowMapSize: 1024,
        shadowCameraSize: 64,
        shadowMaxFar: 220,
        shadowNormalBias: 0.035,
      },
      { color: "#9a8478", intensity: 0.3, position: [82, 38, 96] },
    ],
  },
  postProcessing: {
    toneMapping: "aces",
    // Threshold under the hazard trim's luminance so compactor teeth, tail lights, and lamp heads
    // are what blooms — the accents the player has to read at speed.
    bloom: { strength: 0.34, radius: 0.6, threshold: 0.78 },
    grade: {
      vignette: 0.18,
      saturation: 1.05,
      gamma: 1.02,
      lift: [0, 0.005, 0.016],
      gain: [1.08, 0.99, 0.89],
      grain: 0.024,
      chromaticAberration: 0.0016,
    },
  },
  camera: {
    rig: "chase",
    chase: {
      distance: 7.6,
      height: 2.7,
      lookHeight: 1.25,
      springDamping: 6.5,
      fov: { base: 64, max: 94, speedForMax: 22 },
      shakePerSpeed: 0.022,
      lead: { time: 0.32, max: 5 },
      bank: { perYawRate: 0.32, max: 0.3, damping: 7 },
    },
    frustum: { far: 900 },
  },
  settings: {
    variant: "sheet",
    hideBindings: ["restart", "startRun"],
    actions: [
      {
        id: "restart",
        label: "Restart run",
        kind: "danger",
        description: "Wreck the corridor run again from the start.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
    ],
  },
});
