import { defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { BEACON_SOUNDS } from "./game/audio";
import { content } from "./game/content";
import { keep, towersStanding } from "./game/keep";
import { currentWaveNumber, session } from "./game/session";
import { keybinds } from "./game/keybinds";
import { entityModels, scatterModels } from "./game/models";
import { systems } from "./game/systems";
import { GameUI } from "./game/ui/GameUI";
import { beaconTheme } from "./game/ui/theme";
import { BeaconBastionWorldOverlay } from "./game/world/WorldOverlay";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Beacon Bastion",
  assets,
  world,
  physics,
  input: keybinds,
  server: { mode: "defense" },
  content,
  // A refused build/upgrade reaches the player as a deny notice; its cue is the keep's own "denied" knock.
  audio: { sounds: BEACON_SOUNDS, uiCues: { deny: BEACON_SOUNDS.denied! } },
  notices: { cap: 3 },
  // The keep's own theme: beacon-fire accent, soot timber surfaces, Cinzel and Alegreya Sans.
  hudTheme: beaconTheme,
  // The phone HUD is laid out for 390x844 in style.css, so it draws at its own size instead of the
  // desktop layout shrunk to 0.4.
  hudFit: { mobile: { designSize: { width: 390, height: 844 }, minScale: 1, maxScale: 1 } },
  // Every action already has a control on the HUD itself (the rack's plaques, the mason's tablet), so
  // the derived touch buttons would only repeat them over the field.
  touch: { hidden: ["buildTower1", "buildTower2", "buildTower3", "buildTower4", "upgradeTower", "sellTower", "cycleAim", "abilityFire", "abilityBell"] },
  systems,
  loop,
  GameUI,
  settings: {
    variant: "panel",
  },
  entityModels,
  // Draped creep path + instanced foliage render from the document; towers/creeps/props spawn as
  // entities in the loop, so object placement stays off — no double render.
  editorLayers,
  scenePlacement: false,
  sceneScatterModels: scatterModels,
  WorldOverlay: BeaconBastionWorldOverlay,
  worldHealthBars: { statId: "health" },
  pointer: { moveCommand: "tower.build" },
  capture: {
    play: ["run.begin"],
    // Every state starts from the boot title, so each one opens the run first - without that the builds
    // land behind the title and the shot is the menu, not the state.
    //
    // States a lane can jump to instead of playing there (all compose `run.stage`, dev-only):
    //   mid-wave  wave 1 on the approach, raiders mid-path
    //   boss      the Warden on the field, driven through its second phase by real damage
    //   result    a defense played to its own ending, with the result card up
    states: {
      title: [],
      menu: ["run.begin", { name: "menu.commander", input: { commander: "Mara Vell" } }, "menu.save", "menu.title"],
      "menu-keeps": ["run.begin", { name: "menu.commander", input: { commander: "Mara Vell" } }, "menu.save", "menu.keeps"],
      "menu-new": ["menu.new"],
      "menu-keeps-empty": ["menu.keeps"],
      pause: ["run.begin", "run.pause"],
      "mid-wave": ["run.begin", { name: "run.stage", input: { mode: "midwave" } }],
      boss: ["run.begin", { name: "run.stage", input: { mode: "boss" } }],
      result: ["run.begin", { name: "run.stage", input: { mode: "result" } }],
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
      menu: { description: "Title menu over the standing keep, Continue highlighted", state: "menu", settleMs: 1800 },
      menuKeeps: { description: "Slot grid with the keep just saved", state: "menu-keeps", settleMs: 1800 },
      menuNew: { description: "New defense pane", state: "menu-new", settleMs: 1200 },
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
  shadows: true,
  // Graded post stack without the cinematic preset's image-based light, which washed the slopes
  // blue under this world's own golden-hour sky.
  postProcessing: {
    toneMapping: "aces",
    exposure: 0.95,
    bloom: { strength: 0.16, radius: 0.5, threshold: 0.95 },
    ao: { intensity: 1.3, radius: 1.4 },
    grade: { saturation: 1.12, gain: [1.05, 1.02, 0.95], vignette: 0.22 },
  },
  // Warm low sun rakes the relief so mounds, towers, and the keep cast long readable shadows; a cool
  // hemisphere fill keeps the shadow sides from going muddy black.
  mood: { preset: "day", sun: { azimuth: 237, elevation: 49, color: "#ffeccb", intensity: 1.45 }, fog: { near: 110, far: 230 } },
  camera: {
    rig: "topDown",
    followEntityId: null,
    // The arena is 60x48 world units and the rig's 45-degree azimuth projects that diagonal
    // vertically, so the default height has to clear both ends of the raider route plus the
    // bottom build bar; the offset centres the route in the band the HUD leaves free.
    topDown: {
      height: 70,
      pitch: 1.08,
      yaw: Math.PI / 4,
      targetOffset: { x: -16, z: -6 },
      zoom: { min: 0.6, max: 1.8 },
    },
  },
});



