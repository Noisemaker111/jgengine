import { defineGame } from "@jgengine/shell/defineGame";
import { hdriEnvironment } from "@jgengine/assets/catalogs/hdriLibrary";
import { lutGrade } from "@jgengine/assets/catalogs/lutGrades";

import { editorCatalogs } from "./editorCatalogs";
import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { EMBER_SOUNDS } from "./game/audio";
import { content } from "./game/content";
import { entityModels, scatterModels } from "./game/models";
import { isPlayerSelectable } from "./game/session";
import { systems } from "./game/systems";
import { GameUI } from "./game/ui/GameUI";
import { emberKit } from "./game/ui/emberKit";
import { emberTheme } from "./game/ui/theme";
import { EmberCommandWorldOverlay } from "./game/ui/WorldOverlay";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Ember Command",
  assets,
  world,
  physics,
  input: {
    // RTS command card laid out like the console grid (1 2 3 R · B G T F · Z X C V). No movement actions:
    // there is no avatar, and the "rts" camera rig owns WASD/arrow panning, edge-scroll and zoom.
    trainPeasant: ["Digit1"],
    trainFootman: ["Digit2"],
    trainRifleman: ["Digit3"],
    attackMove: ["KeyR"],
    buildBarracks: ["KeyB"],
    buildFarm: ["KeyG"],
    buildTower: ["KeyT"],
    rally: ["KeyF"],
    hold: ["KeyV"],
    formationLine: ["KeyL"],
    formationWedge: ["KeyJ"],
    formationColumn: ["KeyK"],
    selectArmy: ["KeyH"],
    researchWeapons: ["KeyZ"],
    researchArmor: ["KeyX"],
    heroAbility: ["KeyC"],
    heroMuster: ["Digit4"],
    heroVolley: ["Digit5"],
    heroWard: ["Digit6"],
    // The level-up card's two options, so a pick never needs the mouse mid-battle.
    heroPickFirst: ["Digit7"],
    heroPickSecond: ["Digit8"],
  },
  audio: { sounds: EMBER_SOUNDS },
  server: { mode: "single" },
  save: "none",
  // Offline whole-world save, written only at campaign beats (mission start, win, loss) so a battle
  // is never captured mid-fight: the campaign track, the carried stores and the entity world persist
  // to localStorage, and `loop.ts` restores the track on boot behind the field desk.
  persist: { mode: "manual" },
  content,
  systems,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  hudTheme: emberTheme,
  // The parchment kit with wax red as its accent, so toasts, prompts and menu panes match the war-table CSS.
  uiKit: emberKit,
  controls: {
    // The command board, the formation tabs and the army call already carry every bound action as a
  // pressable token, so the derived touch buttons would only repeat them over the field.
    touch: {
      hidden: [
        "trainPeasant", "trainFootman", "trainRifleman", "attackMove", "buildBarracks", "buildFarm", "buildTower", "rally", "hold",
        "formationLine", "formationWedge", "formationColumn", "selectArmy", "researchWeapons", "researchArmor", "heroAbility",
        "heroMuster", "heroVolley", "heroWard", "heroPickFirst", "heroPickSecond",
      ],
    },
    // Selection rings, marquee + click select, and right-click orders are all shell-native: the game
  // supplies who is selectable and the verb that receives { selection, point }. With nothing
  // selected the shell skips `orderCommand`, so the same verb takes the secondary right-click too:
  // armed buildings and rally points still land, and a bare order says to select troops first.
    pointer: { select: true, selectFilter: isPlayerSelectable, orderCommand: "unit.order", secondaryCommand: "unit.order" },
  },
  chrome: {
    // Order reports and refusals: below the stockpile strip, clear of the command console.
    notices: { placement: "top", ttlMs: 5000 },
  },
  scene: {
    entityModels,
    // Authored map dressing (war-road ribbon + forest ring) renders from the document; units, keeps,
  // and props spawn as entities in onInit, so object placement stays off — no double render.
    editorLayers,
    editorCatalogs,
    // Faction-coloured health bars (green Vanguard / red Marauders) live in the world overlay so
  // friend/foe reads at a glance — the shell's built-in world bars are always red.
    WorldOverlay: EmberCommandWorldOverlay,
  },
  // The three views a reviewer asks about, pinned to authored markers so they frame the same thing
  // after the map moves — `bun run shoot ember-command --view keep-enemy`.
  capture: {
    play: ["match.start"],
    // `mission-live` is the campaign mission as the player receives it: `match.start` opens the
    // next mission from the campaign track, so the objective card, the mission notice and the live
    // wave are already on screen. Nothing is staged, and nothing needs to be played first.
    states: {
      "menu": ["menu.record"],
      "menu-missions": ["menu.record", { name: "menu.focus", input: { verb: "missions" } }],
      "menu-new": [],
      "mission-live": ["match.start"],
      // Dev-only: the first muster played through its world reports, so a flow can reach the
      // mission's own cleared boundary instead of the counter's next tick.
      "mission-cleared": ["campaign.capture"],
    },
    views: {
      "keep-player": {
        description: "The Vanguard keep and its opening formation.",
        look: "@marker:keep_player",
        lookFrom: "22,10",
      },
      "keep-enemy": {
        description: "The Marauder warcamp — the objective the run is scored on.",
        look: "@marker:keep_enemy",
        lookFrom: "22,10",
      },
      hero: {
        description: "Close on Bram, for hero model and health-bar work.",
        look: "@entity:hero",
        lookFrom: "10,4",
      },
    },
  },
  sceneScatterModels: scatterModels,
  scenePlacement: false,
  rendering: {
    // Soft shadows read well but are the dominant cost under software WebGL; a single 1024 map keeps
  // the look affordable. Real-GPU play is nowhere near this budget.
    shadows: true,
    // Late autumn afternoon: the dusk sky at 0.7 for fill, the warm south-west key, a parchment-haze map edge,
    // and the autumn painterly cube standing in for the hand lift and gain.
    mood: { preset: "golden", sun: { azimuth: 225, elevation: 30, color: "#ffc98a" }, horizonColor: "#d8c9a8", fog: { near: 90, far: 220 } },
    environmentSource: hdriEnvironment("dusk", { intensity: 0.7 }),
    postProcessing: {
      toneMapping: "aces",
      exposure: 1.0,
      aa: "smaa",
      bloom: { strength: 0.22, radius: 0.5, threshold: 0.92 },
      ao: { intensity: 1.2 },
      grade: {
        lut: lutGrade("autumn-painterly"),
        lift: [0, 0, 0],
        gain: [1, 1, 1],
        gamma: 1,
        saturation: 1,
        vignette: 0.2,
        grain: 0.01,
      },
    },
  },
  camera: {
    rig: "rts",
    follow: { followEntityId: null },
    rigs: {
      rts: {
        height: 34,
        pitch: 1.0,
        yaw: Math.PI / 4,
        panSpeed: 36,
        edgeScroll: true,
        rotateSpeed: 1.2,
        zoom: { min: 0.6, max: 2 },
        start: { x: 0, z: 26 },
        bounds: { minX: -46, maxX: 46, minZ: -46, maxZ: 46 },
      },
    },
  },
});
