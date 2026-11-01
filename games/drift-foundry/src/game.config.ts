import { defineGame } from "@jgengine/shell/defineGame";
import { createElement } from "react";
import { SceneCaptureBinding } from "@jgengine/core/scene/sceneCapture.draw";
import { editorLayers } from "./editorLayers";

import { DRIFT_SOUNDS } from "./game/audio";
import { assets } from "./game/assets";
import { content } from "./game/content";
import { DEFAULT_DRIVE_CODES } from "@jgengine/core/input/actionBindings";
import { entityModels, objectModels } from "./game/models";
import { GameUI } from "./game/ui/GameUI";
import { driftTheme } from "./game/ui/theme";
import { foundryKit } from "./game/ui/menu/foundryKit";
import { lifecycle, onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Drift Foundry",
  world,
  scene: {
    editorLayers,
    // Hands the live corridor frame to the card Continue opens.
    WorldOverlay: () => createElement(SceneCaptureBinding, {}),
    entityModels,
    objectModels,
  },
  physics,
  // The kart, rivals, compactor and run clock all integrate `dt` per tick; a fixed 60 Hz step keeps a
  // corridor run the same distance at 30 and 144 fps.
  simulation: { hz: 60 },
  input: {
    ...DEFAULT_DRIVE_CODES,
    handbrake: ["KeyX"],
    jumpHop: ["Space"],
    plowBrace: ["ShiftLeft", "ShiftRight"],
    salvageSwap: { hold: ["KeyE"] },
    restart: ["KeyR"],
    startRun: ["Enter"],
    pauseRun: ["KeyP"],
  },
  assets,
  content,
  loop: { onInit, onNewPlayer, onTick },
  lifecycle,
  GameUI,
  hudTheme: driftTheme,
  // The pit wall: stencilled steel menu plates and the pit sheet on a clipboard for every pane.
  uiKit: foundryKit,
  chrome: {
    // One salvage call at a time, above the speed/route plates, like the old pit-radio toast.
    notices: { placement: "bottom", cap: 1 },
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
  },
  controls: {
    // This run uses its own held throttle/jump pad alongside the branded HUD.
    touch: false,
  },
  capture: {
    // The compactor catches a parked kart within seconds, and the capture keeps the sim running while
    // models stream, so a live shot hands the wheel to the course autopilot; otherwise it films the
    // result card of a run nobody drove.
    play: ["startRun", { name: "run.autopilot", input: {} }],
    // `mid-run` is the corridor driven quickly: 14 s of throttle with the pickups, gates, crusher
    // and rivals all live, then the autopilot keeps it driving. `result` keeps driving to the finish
    // the gauntlet actually gives (an escape in 42 s from the stock build), so the result card
    // carries a real line, not a number.
    states: {
      title: [],
      "mid-run": ["startRun", { name: "run.stage", input: { mode: "midrun" } }, { name: "run.autopilot", input: {} }],
      result: ["startRun", { name: "run.stage", input: { mode: "result" } }],
    },
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
    // `car` is 0 before the car spawns, when the position reads as the origin.
    probe: (ctx) => {
      const car = ctx.scene.entity.get(ctx.player.userId);
      if (car === null) return { car: 0, x: 0, y: 0, z: 0 };
      return { car: 1, x: car.position[0], y: car.position[1], z: car.position[2] };
    },
  },
  audio: { sounds: DRIFT_SOUNDS },
  rendering: {
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
          // A track runs up to 790 m, so a single ortho frustum drops contact shadows a few seconds in.
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
  },
  camera: {
    rig: "chase",
    rigs: {
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
    },
    lens: { frustum: { far: 900 } },
  },
});
