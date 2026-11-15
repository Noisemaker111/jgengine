import { defineGame } from "@jgengine/shell/defineGame";
import { createElement } from "@jgengine/core/ui/jsx";
import { hdriEnvironment } from "@jgengine/assets/catalogs/hdriLibrary";
import { lutGrade } from "@jgengine/assets/catalogs/lutGrades";
import { SceneCaptureBinding } from "@jgengine/core/scene/sceneCapture.draw";
import { editorLayers } from "./editorLayers";

import { DRIFT_SOUNDS } from "./game/audio";
import { assets } from "./game/assets";
import { content } from "./game/content";
import { DEFAULT_DRIVE_CODES } from "@jgengine/core/input/actionBindings";
import { entityModels, flockModels, objectModels } from "./game/models";
import { GameUI } from "./game/ui/GameUI";
import { lifecycle, onInit, onNewPlayer, onTick } from "./loop";
import { probeReadings } from "./game/gameCommands";
import { storeLightingZones } from "./game/world/lighting";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Cleanup on Aisle 9",
  world,
  scene: {
    editorLayers,
    // Hands the live aisle frame to the card Continue opens.
    WorldOverlay: () => createElement(SceneCaptureBinding, {}),
    entityModels,
    objectModels,
    // The aisle's far stretch draws as one merged proxy per cell.
    visibility: { hlod: { distance: 300, hysteresis: 30, cluster: 1 } },
  },
  // The authored habitats' pigeons circle under the roof; the species name is the document's, the model is the game's.
  sceneFlockModels: flockModels,
  physics,
  // The cart, rivals, shutters and run clock all integrate `dt` per tick; a fixed 60 Hz step keeps a
  // run the same distance at 30 and 144 fps.
  simulation: { hz: 60 },
  input: {
    ...DEFAULT_DRIVE_CODES,
    handbrake: ["KeyX"],
    jumpHop: ["Space"],
    plowBrace: ["ShiftLeft", "ShiftRight"],
    salvageSwap: { hold: ["KeyE"] },
    usePower: ["KeyF", "KeyQ"],
    rideBar: ["KeyC"],
    restart: ["KeyR"],
    startRun: ["Enter"],
    pauseRun: ["KeyP"],
  },
  assets,
  content,
  loop: { onInit, onNewPlayer, onTick },
  lifecycle,
  // Customer service is drawn natively by Rune: signs, the receipt, the dash and the PA notices are the game's own.
  GameUI,
  uiRenderer: "rune",
  hudTheme: false,
  // Auto quality holds 60 fps; the reporter and telemetry sink stay unset until the host wires them.
  health: { autoQuality: { targetFrameMs: 1000 / 60 } },
  chrome: {
    settings: {
      variant: "sheet",
      hideBindings: ["restart", "startRun"],
      actions: [
        {
          id: "restart",
          label: "Restart run",
          kind: "danger",
          description: "Abandon this cart and start closing time over.",
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
    // The shutters catch a parked cart within seconds, and the capture keeps the sim running while
    // models stream, so a live shot hands the handle to the course autopilot; otherwise it films the
    // receipt of a run nobody drove.
    play: ["startRun", { name: "run.autopilot", input: {} }],
    // `mid-run` is the aisle driven quickly: 14 s of throttle with the mod displays, walls, shutters
    // and rivals all live, then the autopilot keeps it driving. `result` keeps driving to the finish
    // the gauntlet actually gives, so the receipt carries a real line, not a number.
    states: {
      title: [],
      // The pit with a cup season open on its board.
      cup: [{ name: "cup.start", input: {} }, { name: "menu.pane", input: { pane: "cup" } }],
      // A live race with nobody else at the handle: what a proof or a flow plays from.
      race: ["startRun"],
      // The other departments, driven by the course autopilot with every tier open.
      produce: ["startRun", { name: "run.autopilot", input: { event: "price-check", openAll: true } }],
      toys: ["startRun", { name: "run.autopilot", input: { event: "empty-cart", openAll: true } }],
      garden: ["startRun", { name: "run.autopilot", input: { event: "cart-stuffer", openAll: true } }],
      electronics: ["startRun", { name: "run.autopilot", input: { event: "lights-out", openAll: true } }],
      // Driven 18 s down Aisle 9 by the course driver: past the cereal wall and the soda ramp, into
      // the iced-over Frozen Foods, and left to coast there (an autopilot would race on to the tills
      // before a slow capture settles).
      frozen: ["startRun", { name: "run.stage", input: { mode: "midrun", seconds: 18 } }],
      dock: ["startRun", { name: "run.autopilot", input: { event: "grudge-brick", openAll: true } }],
      "mid-run": ["startRun", { name: "run.stage", input: { mode: "midrun" } }, { name: "run.autopilot", input: {} }],
      result: ["startRun", { name: "run.stage", input: { mode: "result" } }],
      // The plow display dodged and the first box wall in the cart's face: the sign says where the plow is.
      walled: ["startRun", { name: "run.stage", input: { mode: "walled" } }],
    },
    views: {
      corridor: {
        description: "Raised three-quarter down Aisle 9 at the snacks/frozen seam — zone kiosks, shelving runs, ceiling lights.",
        look: "0,150",
        lookFrom: "74,34,0.55",
        run: ["startRun"],
      },
      gantry: {
        description: "Bulk & Paint's tall shelving and pallet stacks, framed from the aisle floor.",
        look: "0,360",
        lookFrom: "52,14,0.35",
        run: ["startRun"],
      },
    },
    // `car` is 0 before the cart spawns; every other reading comes off the live session.
    probe: probeReadings,
  },
  audio: { sounds: DRIFT_SOUNDS },
  rendering: {
    shadows: true,
    look: "cinematic",
    // Fluorescent big-box light: a high, near-white key straight down the aisles, bright cool fill.
    // Fog and haze are left to the world's sky and its per-department bands (no mood backdrop), so
    // Electronics fades to its dark lights-out haze and the produce cooler to its own; only the
    // exposure and the strip-light key are set here.
    mood: { exposure: 0.85, fog: false },
    // Low: the glossy tile mirrors the image light, and at 0.55 the aisles burned out white.
    environmentSource: hdriEnvironment("interior-industrial", { intensity: 0.36 }),
    lighting: {
      // Indoor fill: shadows stay soft and neutral under the strip lights, never blue.
      ambient: { color: "#e8e4dc", intensity: 0.32 },
      hemisphere: { skyColor: "#f4f1ea", groundColor: "#8f8878", intensity: 0.58 },
      directional: [
        {
          color: "#fff6e6",
          intensity: 1.0,
          // High and nearly overhead: the strip lights' key, kept here so the cascades below tune its shadow.
          position: [-30, 140, 40],
          castShadow: true,
          // A department runs up to 790 m, so a single ortho frustum drops contact shadows a few seconds in.
          cascades: 3,
          shadowMapSize: 1024,
          shadowCameraSize: 64,
          shadowMaxFar: 220,
          shadowNormalBias: 0.035,
        },
        { color: "#dfe8ff", intensity: 0.25, position: [82, 60, 96] },
      ],
      // Each department re-lights the rig as the camera drives in: Electronics a dark showroom,
      // the Loading Bay sodium orange, Frozen Foods cold blue, the Garden Centre an overcast sky.
      zones: storeLightingZones(),
    },
    postProcessing: {
      toneMapping: "aces",
      // Threshold under the emissive trims' luminance so ceiling tubes, screens, beacons and the
      // checkout gantry are what blooms - the accents the player reads at speed.
      bloom: { strength: 0.3, radius: 0.55, threshold: 0.82 },
      // A punchy packaging grade: the cube does the colour, the numeric stage reins its saturation in.
      grade: {
        lut: lutGrade("vivid-pop"),
        lift: [0, 0, 0],
        gain: [1, 1, 1],
        gamma: 1,
        saturation: 0.88,
        vignette: 0.12,
        grain: 0.01,
        chromaticAberration: 0.001,
      },
    },
  },
  camera: {
    rig: "chase",
    rigs: {
      chase: {
        distance: 7.2,
        height: 2.9,
        lookHeight: 1.3,
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
