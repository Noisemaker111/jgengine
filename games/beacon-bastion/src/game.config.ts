import { hdriEnvironment } from "@jgengine/assets/catalogs/hdriLibrary";
import { lutGrade } from "@jgengine/assets/catalogs/lutGrades";
import { defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { BEACON_SOUNDS } from "./game/audio";
import { content } from "./game/content";
import { keep, towersStanding } from "./game/keep";
import { currentWaveNumber, session } from "./game/session";
import { hotbarSlotBindings } from "@jgengine/core/input/actionBindings";
import { entityModels, scatterModels } from "./game/models";
import { renderEntity } from "./game/render/renderEntity";
import { TOWER_IDS } from "./game/entities/towers/catalog";
import { systems } from "./game/systems";
import { GameUI } from "./game/ui/GameUI";
import { BeaconBastionWorldOverlay } from "./game/world/WorldOverlay";
import { loop } from "./loop";
import { physics, world } from "./world";

/** The hiring board's first ten workers take the number keys; the rest are a click away. */
const HOTKEYED = Math.min(10, TOWER_IDS.length);

export const game = defineGame({
  name: "Do Not Disturb",
  assets,
  world,
  physics,
  input: {
    ...hotbarSlotBindings(HOTKEYED, { action: (slot) => `buildTower${slot}` }),
    upgradeTower: ["KeyU"],
    sellTower: ["KeyX"],
    cycleAim: ["KeyT"],
    abilityBlackout: ["KeyQ"],
    abilityQuiet: ["KeyE"],
    mendWalls: ["KeyR"],
  },
  server: { mode: "defense" },
  content,
  // A refused hire/promotion reaches the player as a deny notice; its cue is the town's own "denied" buzz.
  audio: { sounds: BEACON_SOUNDS, uiCues: { deny: BEACON_SOUNDS.denied } },
  chrome: {
    notices: { cap: 3 },
    settings: {
      variant: "panel",
    },
  },
  // The town's signage, menus and end-of-day card draw natively through Rune from the game's own theme.
  hudTheme: false,
  uiRenderer: "rune",
  controls: {
    // Every action already has a control on the HUD itself (the hiring board, the worker card), so the
    // derived touch buttons would only repeat them over the street.
    touch: { hidden: [...Array.from({ length: HOTKEYED }, (_, index) => `buildTower${index + 1}`), "upgradeTower", "sellTower", "cycleAim", "abilityBlackout", "abilityQuiet", "mendWalls"] },
    pointer: { moveCommand: "tower.build" },
  },
  systems,
  loop,
  GameUI,
  scene: {
    entityModels,
    // Tech has no catalog model: each piece draws its own procedural body.
    renderEntity,
    // Draped creep path + instanced foliage render from the document; towers/creeps/props spawn as
  // entities in the loop, so object placement stays off — no double render.
    editorLayers,
    WorldOverlay: BeaconBastionWorldOverlay,
    worldHealthBars: { statId: "health" },
  },
  scenePlacement: false,
  sceneScatterModels: scatterModels,
  capture: {
    play: ["run.begin"],
    // Every state starts from the boot title, so each one opens the run first - without that the builds
    // land behind the title and the shot is the menu, not the state.
    //
    // States a lane can jump to instead of playing there (all compose `run.stage`, dev-only):
    //   mid-wave  a staffed street with a wave of tech mid-route and workers distracted
    //   boss      the server rack on the street, driven through its second phase by real damage
    //   finale    the Data Center rolling in on mains power, with its escort, on a staffed street
    //   result    a day played to its own ending, with the end-of-day card up
    //   breached  wave 1 rolled into an empty town, the street clear and the Coffee Break sign up
    states: {
      title: [],
      menu: ["run.begin", { name: "menu.commander", input: { commander: "Dot Moreno" } }, "menu.save", "menu.title"],
      "menu-keeps": ["run.begin", { name: "menu.commander", input: { commander: "Dot Moreno" } }, "menu.save", "menu.keeps"],
      "menu-new": ["menu.new"],
      "menu-keeps-empty": ["menu.keeps"],
      pause: ["run.begin", "run.pause"],
      "mid-wave": ["run.begin", { name: "run.stage", input: { mode: "midwave" } }],
      boss: ["run.begin", { name: "run.stage", input: { mode: "boss" } }],
      finale: ["run.begin", { name: "run.stage", input: { mode: "finale" } }],
      result: ["run.begin", { name: "run.stage", input: { mode: "result" } }],
      // The first wave rolled into an empty town: focus lost, the street clear, the wave's pay in.
      breached: ["run.begin", { name: "run.stage", input: { mode: "breached" } }],
      "two-towers": [
        "run.begin",
        "buildTower1",
        { name: "tower.build", input: { point: [-12, 0, -3.2] } },
        "buildTower1",
        "buildTower2",
        { name: "tower.build", input: { point: [0, 0, 4] } },
      ],
      "cannon-plot-1": ["run.begin", "buildTower2", { name: "tower.build", input: { point: [-36, 0, -15.2] } }, "buildTower2"],
      "inspect-tower": [
        "run.begin",
        "buildTower2",
        { name: "tower.build", input: { point: [0, 0, 4] } },
        "buildTower2",
        { name: "tower.build", input: { point: [0, 0, 4] } },
      ],
    },
    views: {
      menu: { description: "Title menu over the town, Continue highlighted", state: "menu", settleMs: 1800 },
      menuKeeps: { description: "Slot grid with the street just saved", state: "menu-keeps", settleMs: 1800 },
      menuNew: { description: "New day pane", state: "menu-new", settleMs: 1200 },
      menuKeepsEmpty: { description: "Slot grid with no save", state: "menu-keeps-empty", settleMs: 1200 },
      pause: { description: "Pause menu over live play", state: "pause", settleMs: 900 },
    },
    probe: (ctx) => ({
      gold: keep.of(ctx).num("keep.gold"),
      towers: towersStanding(keep.of(ctx)),
      creeps: session.creeps.size,
      wave: currentWaveNumber(),
    }),
  },
  rendering: {
    // A bright small-town morning: a high sun, saturated cartoon colours and a postcard grade, so
    // the street reads like a Saturday-morning cartoon and the glowing gadgets pop against it.
    look: "cinematic",
    shadows: true,
    mood: { preset: "bright", sun: { azimuth: 210, elevation: 52, color: "#fff2d8" }, horizonColor: "#cfe6f2", fog: { near: 130, far: 280 } },
    environmentSource: hdriEnvironment("partly-cloudy", { intensity: 0.9 }),
    postProcessing: {
      toneMapping: "aces",
      exposure: 1,
      bloom: { strength: 0.22, radius: 0.5, threshold: 0.9 },
      ao: { intensity: 1.1, radius: 1.2 },
      grade: { lut: lutGrade("sunny-postcard"), vignette: 0.14, saturation: 1.08, gamma: 1, lift: [0, 0, 0], gain: [1, 1, 1] },
    },
  },
  camera: {
    // A tower-defense camera that frames the street, not the county: it starts over the middle of
    // Main Street close enough that a barista reads as a barista, pans with the arrow keys or the
    // screen edge (WASD), and scroll-zooms out to see both ends of the road. Q/E stay the town's
    // two buttons, so rotation steps aside.
    rig: "rts",
    follow: { followEntityId: null },
    rigs: {
      rts: {
        height: 40,
        pitch: 1.0,
        yaw: Math.PI / 4,
        start: { x: 2, z: 2 },
        bounds: { minX: -34, maxX: 40, minZ: -30, maxZ: 30 },
        zoom: { min: 0.55, max: 1.7 },
        panSpeed: 28,
        edgeScroll: { margin: 0.02 },
      },
    },
  },
});



