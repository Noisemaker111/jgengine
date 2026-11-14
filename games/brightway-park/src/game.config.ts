import { ambientFauna } from "./game/ambientFauna";
import { hdriEnvironment } from "@jgengine/assets/catalogs/hdriLibrary";
import { lutGrade } from "@jgengine/assets/catalogs/lutGrades";
import { defineGame } from "@jgengine/shell/defineGame";

import { HAUNT_SOUNDS } from "./game/audio";
import { assets } from "./game/assets";
import { DAY_LENGTH, DAY_START } from "./game/catalog";
import { content } from "./game/content";
import { entityModels, objectModels } from "./game/models";
import { HauntworksWorldOverlay } from "./game/render/WorldOverlay";
import { parkHints, parkHintsWhilePaused } from "./game/onboarding";
import { park } from "./game/park";
import { parkProbe } from "./game/parkProbe";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Hauntworks",
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
  // The haunt is one declaration (`game/park.ts`); its system runs the world and its commands.
  // The first scenario's hints run on the engine's onboarding, after the park so they read this tick's world.
  systems: [park.system, parkHints, parkHintsWhilePaused],
  time: { scale: 1, dayLength: DAY_LENGTH, start: DAY_START, speeds: [1, 2, 4, 8], startPaused: true },
  content,
  loop,
  GameUI,
  scene: {
    entityModels,
    objectModels,
    WorldOverlay: HauntworksWorldOverlay,
    worldHealthBars: false,
    ambientLife: { fauna: ambientFauna },
  },
  // A refused build is a deny notice; its cue is the haunt's own "denied" knell.
  audio: { sounds: HAUNT_SOUNDS, uiCues: { deny: HAUNT_SOUNDS.denied } },
  chrome: { notices: { cap: 3, ttlMs: 5000 } },
  controls: {
    // The build palette is the touch control: no derived pick/clear buttons over it.
    touch: { buttons: [] },
    pointer: { moveCommand: "park.pointer", secondaryCommand: "build.clear" },
  },
  hudTheme: false,
  uiRenderer: "rune",
  rendering: {
    look: "cinematic",
    // Moonlight: a cold key from high in the south-west, a violet sky, teal haze low over the lot.
    mood: { preset: "night", sun: { azimuth: 215, elevation: 48, color: "#b8ccff", intensity: 1.15 }, skyColor: "#140f2e", horizonColor: "#3a2f66", groundColor: "#1d2a2c", fog: { near: 140, far: 620 }, exposure: 1.05, saturation: 1.08, contrast: 1.06 },
    environmentSource: hdriEnvironment("night-clear", { intensity: 0.45 }),
    // Lanterns, glowing props and ghosts are the only things over the bloom threshold.
    postProcessing: { toneMapping: "aces", bloom: { strength: 0.9, radius: 0.6, threshold: 0.72 }, grade: { vignette: 0.28, lut: lutGrade("night-blue") } },
  },
  capture: {
    // A new game: the menu's "Wake the haunt" with nothing saved starts the first scenario on the empty lot.
    play: [{ name: "park.scenario", input: { id: "first_chill" } }, "park.start"],
    // `full-park` stages the night a reviewer asks about: the gate open, the authored starter haunt
    // at its crowd cap, lines at the rides, a ghost moving in. It composes the dev-only `park.stage`,
    // which runs the park's own tick forward instead of the lane waiting out a night at 4x.
    states: {
      title: [],
      menu: ["park.start", "menu.saveDoc", "menu.title"],
      "menu-saves": ["park.start", "menu.saveDoc", "menu.saves"],
      "menu-new": ["menu.new"],
      paused: ["park.start", "pauseToggle"],
      "full-park": ["park.start", { name: "park.stage", input: { mode: "full" } }],
    },
    views: {
      menu: { description: "Gate board over the haunt, Continue highlighted", state: "menu", settleMs: 1800 },
      menuSaves: { description: "Haunt saves with the saved night", state: "menu-saves", settleMs: 1800 },
      plaza: { description: "Gate plaza and the living at the build camera's near zoom", state: "full-park", look: "0,10", lookFrom: "34,20,0.8", settleMs: 1500 },
      crowd: { description: "The living, the spooks and a ghost close up", state: "full-park", look: "0,18", lookFrom: "16,7,0.8", settleMs: 1500 },
      menuNew: { description: "Wake-the-haunt pane with the scenarios", state: "menu-new", settleMs: 1200 },
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

