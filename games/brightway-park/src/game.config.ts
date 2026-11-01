import { hdriEnvironment } from "@jgengine/assets/catalogs/hdriLibrary";
import { lutGrade } from "@jgengine/assets/catalogs/lutGrades";
import { defineGame } from "@jgengine/shell/defineGame";

import { BRIGHTWAY_SOUNDS } from "./game/audio";
import { assets } from "./game/assets";
import { DAY_LENGTH, DAY_START } from "./game/catalog";
import { content } from "./game/content";
import { entityModels, objectModels } from "./game/models";
import { BrightwayParkWorldOverlay } from "./game/render/WorldOverlay";
import { parkHints, parkHintsWhilePaused } from "./game/onboarding";
import { park } from "./game/park";
import { parkProbe } from "./game/parkProbe";
import { GameUI } from "./game/ui/GameUI";
import { parkKit } from "./game/ui/kit";
import { parkTheme } from "./game/ui/theme";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Brightway Park",
  world,
  physics,
  assets,
  input: {
    pauseToggle: ["KeyP"],
    clearTool: ["KeyX"],
    rotateTool: ["KeyZ"],
    undoBuild: ["KeyU"],
    pickCarousel: ["Digit1"],
    pickCoaster: ["Digit2"],
    pickTrack: ["Digit3"],
    pickFood: ["Digit4"],
    pickTree: ["Digit5"],
    pickPath: ["Digit6"],
  },
  server: { mode: "solo" },
  save: "none",
  // The park is one declaration (`game/park.ts`); its system runs the world and its commands.
  // The first scenario's hints run on the engine's onboarding, after the park so they read this tick's world.
  systems: [park.system, parkHints, parkHintsWhilePaused],
  time: { scale: 1, dayLength: DAY_LENGTH, start: DAY_START, speeds: [1, 2, 4, 8], startPaused: true },
  content,
  loop,
  GameUI,
  scene: {
    entityModels,
    objectModels,
    WorldOverlay: BrightwayParkWorldOverlay,
    worldHealthBars: false,
  },
  // A refused build is a deny notice; its cue is the park's own "denied" chime.
  audio: { sounds: BRIGHTWAY_SOUNDS, uiCues: { deny: BRIGHTWAY_SOUNDS.denied } },
  chrome: { notices: { cap: 3, ttlMs: 5000 } },
  controls: {
    // The build palette is the touch control: no derived pick/clear buttons over it.
    touch: { buttons: [] },
    pointer: { moveCommand: "park.pointer", secondaryCommand: "build.clear" },
  },
  uiKit: parkKit,
  hudTheme: parkTheme,
  rendering: {
    look: "cinematic",
    mood: { preset: "bright", sun: { azimuth: 135, elevation: 52, color: "#fff1d6" }, horizonColor: "#bfe0e6", fog: { near: 260, far: 900 } },
    environmentSource: hdriEnvironment("clear-puresky", { intensity: 0.55 }),
    postProcessing: { toneMapping: "aces", bloom: { strength: 0.35, radius: 0.5, threshold: 0.95 }, grade: { vignette: 0.12, lut: lutGrade("sunny-postcard") } },
  },
  capture: {
    // A new game: the menu's "Open the park" with nothing saved starts the first scenario on the empty lot.
    play: [{ name: "park.scenario", input: { id: "brightway_beginnings" } }, "park.start"],
    // `full-park` stages the day a reviewer asks about: gates open, the authored starter park at
    // its guest cap, lines at the rides. It composes the dev-only `park.stage`, which runs the
    // park's own tick forward instead of the lane waiting out a day at 4x.
    states: {
      title: [],
      menu: ["park.start", "menu.saveDoc", "menu.title"],
      "menu-saves": ["park.start", "menu.saveDoc", "menu.saves"],
      "menu-new": ["menu.new"],
      paused: ["park.start", "pauseToggle"],
      "full-park": ["park.start", { name: "park.stage", input: { mode: "full" } }],
    },
    views: {
      menu: { description: "Gate board over the park, Continue highlighted", state: "menu", settleMs: 1800 },
      menuSaves: { description: "Park saves with the saved day", state: "menu-saves", settleMs: 1800 },
      plaza: { description: "Gate plaza and the crowd at the build camera's near zoom", state: "full-park", look: "0,10", lookFrom: "34,20,0.8", settleMs: 1500 },
      crowd: { description: "Guests and staff close up", state: "full-park", look: "0,18", lookFrom: "16,7,0.8", settleMs: 1500 },
      menuNew: { description: "New day pane with the scenarios", state: "menu-new", settleMs: 1200 },
    },
    probe: parkProbe,
  },
  camera: {
    rig: "rts",
    follow: { followEntityId: null },
    lens: { frustum: { far: 1200 } },
    rigs: {
      rts: {
        start: { x: 0, z: 16 },
        height: 52,
        pitch: 0.86,
        yaw: Math.PI / 4,
        panSpeed: 55,
        edgeScroll: false,
        rotateSpeed: 1.1,
        bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 },
        zoom: { min: 0.5, max: 2.4, speed: 1 },
      },
    },
  },
});

