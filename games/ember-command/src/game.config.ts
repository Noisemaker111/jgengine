import { defineGame } from "@jgengine/shell/defineGame";

import { editorCatalogs } from "./editorCatalogs";
import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { EMBER_SOUNDS } from "./game/audio";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { entityModels } from "./game/models";
import { isPlayerSelectable } from "./game/session";
import { systems } from "./game/systems";
import { GameUI } from "./game/ui/GameUI";
import { emberTheme } from "./game/ui/theme";
import { EmberCommandWorldOverlay } from "./game/ui/WorldOverlay";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Ember Command",
  assets,
  world,
  physics,
  input: keybinds,
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
  // The command board, the formation tabs and the army call already carry every bound action as a
  // pressable token, so the derived touch buttons would only repeat them over the field.
  touch: {
    hidden: [
      "trainPeasant", "trainFootman", "trainRifleman", "attackMove", "buildBarracks", "buildFarm", "buildTower", "rally", "hold",
      "formationLine", "formationWedge", "formationColumn", "selectArmy", "researchWeapons", "researchArmor", "heroAbility",
      "heroMuster", "heroVolley", "heroWard", "heroPickFirst", "heroPickSecond",
    ],
  },
  // Order reports and refusals: below the stockpile strip, clear of the command console.
  notices: { placement: "top", ttlMs: 5000 },
  entityModels,
  // Selection rings, marquee + click select, and right-click orders are all shell-native: the game
  // supplies who is selectable and the verb that receives { selection, point }. With nothing
  // selected the shell skips `orderCommand`, so the same verb takes the secondary right-click too:
  // armed buildings and rally points still land, and a bare order says to select troops first.
  pointer: { select: true, selectFilter: isPlayerSelectable, orderCommand: "unit.order", secondaryCommand: "unit.order" },
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
  // Authored map dressing (war-road ribbon + forest ring) renders from the document; units, keeps,
  // and props spawn as entities in onInit, so object placement stays off — no double render.
  editorLayers,
  editorCatalogs,
  scenePlacement: false,
  // Faction-coloured health bars (green Vanguard / red Marauders) live in the world overlay so
  // friend/foe reads at a glance — the shell's built-in world bars are always red.
  WorldOverlay: EmberCommandWorldOverlay,
  // Soft shadows read well but are the dominant cost under software WebGL; a single 1024 map keeps
  // the look affordable. Real-GPU play is nowhere near this budget.
  shadows: true,
  // Shipped-game presentation: a real day sky + IBL fill the empty horizon, and the post grade is
  // tuned to the valley's warm ember banners against earthy greens. AO stays off to keep the
  // populated-wave frame cost affordable under software WebGL.
  look: "cinematic",
  postProcessing: {
    toneMapping: "aces",
    exposure: 1.0,
    aa: "smaa",
    bloom: { strength: 0.22, radius: 0.5, threshold: 0.92 },
    ao: false,
    grade: {
      lift: [0.02, 0.014, 0.012],
      gain: [1.06, 1.02, 0.96],
      gamma: 0.97,
      saturation: 1.1,
      vignette: 0.22,
      grain: 0.01,
    },
  },
  // Clear afternoon over the keeps; the sun stands where the hand-built key did (south-west, 47 degrees).
  mood: { preset: "day", sun: { azimuth: 234, elevation: 47, color: "#ffe1ad" }, fog: { near: 70, far: 190 } },
  camera: {
    rig: "rts",
    followEntityId: null,
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
});
