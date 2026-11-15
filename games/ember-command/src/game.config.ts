import { defineGame } from "@jgengine/shell/defineGame";
import { hdriEnvironment } from "@jgengine/assets/catalogs/hdriLibrary";
import { lutGrade } from "@jgengine/assets/catalogs/lutGrades";

import { editorCatalogs } from "./editorCatalogs";
import { withSceneSet } from "@jgengine/core/editor/sceneSet";

import { bindScene, editorLayers } from "./editorLayers";
import { sceneSet, type MapId } from "./maps";
import { rebindYard } from "./game/yardInstance";
import { assets } from "./game/assets";
import { LAWN_SOUNDS } from "./game/audio";
import { content } from "./game/content";
import { entityModels, flockModels, scatterModels } from "./game/models";
import { isPlayerSelectable } from "./game/session";
import { systems } from "./game/systems";
import { GameUI } from "./game/ui/GameUI";
import { LawnOrderWorldOverlay } from "./game/world/WorldOverlay";
import { renderEntity } from "./game/world/renderEntity";
import "./game/world/yardKinds.draw";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, rebindWorld, world } from "./world";

/** Where the camera opens: just in front of the red nest authored on the live lawn. */
function openingView(): { x: number; z: number } {
  const nest = editorLayers.markers.find((marker) => marker.catalogId === "keep_player");
  return nest === undefined ? { x: 0, z: 26 } : { x: nest.position.x * 0.8, z: nest.position.z - 10 };
}

/** Build the game for one lawn: the scene document, its ground and the yard read from it are rebound first. */
function buildGame(id: MapId) {
  bindScene(id);
  rebindWorld();
  rebindYard();
  return defineGame({
    name: "LAWN ORDER",
    assets,
    world,
    physics,
    input: {
      // RTS command card laid out like the console grid (1 2 3 9 0 · R P · B G T U Y F · Z X C V). No movement actions:
      // there is no avatar, and the "rts" camera rig owns WASD/arrow panning, edge-scroll and zoom.
      trainWorker: ["Digit1"],
      trainSoldier: ["Digit2"],
      trainSpitter: ["Digit3"],
      trainScout: ["Digit9"],
      trainBeetle: ["Digit0"],
      layTrail: ["KeyP"],
      attackMove: ["KeyR"],
      buildBarracks: ["KeyB"],
      buildGarden: ["KeyG"],
      buildMound: ["KeyT"],
      buildNursery: ["KeyU"],
      buildGranary: ["KeyY"],
      rally: ["KeyF"],
      hold: ["KeyV"],
      formationLine: ["KeyL"],
      formationWedge: ["KeyJ"],
      formationColumn: ["KeyK"],
      selectArmy: ["KeyH"],
      researchWeapons: ["KeyZ"],
      researchArmor: ["KeyX"],
      researchAssault: ["KeyN"],
      researchBulwark: ["KeyM"],
      heroAbility: ["KeyC"],
      heroMuster: ["Digit4"],
      heroVolley: ["Digit5"],
      heroWard: ["Digit6"],
      // The level-up card's two options, so a pick never needs the mouse mid-battle.
      heroPickFirst: ["Digit7"],
      heroPickSecond: ["Digit8"],
    },
    audio: { sounds: LAWN_SOUNDS },
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
    // The garden-journal HUD draws on one native Rune surface: its own typed theme, no shell HUD theme or DOM kit.
    hudTheme: false,
    uiRenderer: "rune",
    controls: {
      // The command board, the formation tabs and the army call already carry every bound action as a
    // pressable token, so the derived touch buttons would only repeat them over the field.
      touch: {
        hidden: [
          "trainWorker", "trainSoldier", "trainSpitter", "trainScout", "trainBeetle", "layTrail", "attackMove", "buildBarracks", "buildGarden", "buildMound",
          "buildNursery", "buildGranary", "rally", "hold",
          "formationLine", "formationWedge", "formationColumn", "selectArmy", "researchWeapons", "researchArmor", "researchAssault", "researchBulwark", "heroAbility",
          "heroMuster", "heroVolley", "heroWard", "heroPickFirst", "heroPickSecond",
        ],
      },
      // Selection rings, marquee + click select, and right-click orders are all shell-native: the game
    // supplies who is selectable and the verb that receives { selection, point }. With nothing
    // selected the shell skips `orderCommand`, so the same verb takes the secondary right-click too:
    // armed buildings and rally points still land, and a bare order says to select troops first.
      pointer: { select: true, selectFilter: isPlayerSelectable, orderCommand: "unit.order", secondaryCommand: "unit.order" },
    },
    scene: {
      entityModels,
      // Ants, beetles, wasps and the dug chambers are stylized procedural meshes (no ant models exist in
      // the catalog): each caste reads from its silhouette, team colour on the gaster and the head.
      renderEntity,
      // Authored yard dressing (the hose, patio stones, grass forests, clover and flowers) renders from the
      // document; ants, nests and food spawn as entities in onInit, so object placement stays off.
      editorLayers,
      editorCatalogs,
      // Faction-coloured health bars, the pheromone trails and the yard hazards (sprinkler jet, mower,
      // rain and the magnifying-glass beam) live in the world overlay.
      WorldOverlay: LawnOrderWorldOverlay,
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
        // Dev-only: a Barracks up and a war chest, so the research row is live; `doctrine` has Bulwark under way.
        research: ["match.start", "research.capture"],
        doctrine: ["match.start", { name: "research.capture", input: { doctrine: "bulwark" } }],
        // Dev-only: the finale as the player receives it, with the kid's beam over the lawn.
        boss: [{ name: "campaign.skipTo", input: { index: 4 } }, "match.start"],
        // Dev-only (pair with `?map=front-yard`): mission VI with the column marching onto the driveway.
        driveway: [{ name: "campaign.skipTo", input: { index: 5 } }, "match.start", "driveway.capture"],
      },
      views: {
        "keep-player": {
          description: "The red colony's nest and its opening column.",
          look: "@marker:keep_player",
          lookFrom: "22,10",
        },
        "keep-enemy": {
          description: "The Black Ant Nest — the objective the run is scored on.",
          look: "@marker:keep_enemy",
          lookFrom: "22,10",
        },
        column: {
        description: "Follow the Marshal's column, for the front yard's cracks and the car's shade.",
        look: "@entity:hero",
        lookFrom: "16,9",
      },
      hero: {
          description: "Close on Marshal Mandible, for hero model and health-bar work.",
          look: "@entity:hero",
          lookFrom: "10,4",
        },
      },
    },
    sceneScatterModels: scatterModels,
    sceneFlockModels: flockModels,
    scenePlacement: false,
    rendering: {
      // Soft shadows read well but are the dominant cost under software WebGL; a single 1024 map keeps
    // the look affordable. Real-GPU play is nowhere near this budget.
      shadows: true,
      // A blazing suburban summer noon seen from ant height: a high white-gold sun, a clear sky for fill,
      // a soft green-gold haze where the lawn runs off past the fence, and the lush cube for saturation.
      mood: { preset: "bright", sun: { azimuth: 150, elevation: 58, color: "#fff1c4" }, horizonColor: "#cfe9b0", fog: { near: 95, far: 230 } },
      environmentSource: hdriEnvironment("clear-noon", { intensity: 0.9 }),
      postProcessing: {
        toneMapping: "aces",
        exposure: 0.74,
        aa: "smaa",
        bloom: { strength: 0.22, radius: 0.5, threshold: 0.92 },
        ao: { intensity: 1.2 },
        grade: {
          lut: lutGrade("tropical-lush"),
          lift: [0, 0, 0],
          gain: [1, 1, 1],
          gamma: 1,
          saturation: 1,
          vignette: 0.24,
          grain: 0.01,
        },
      },
    },
    camera: {
      rig: "rts",
      follow: { followEntityId: null },
      rigs: {
        rts: {
          height: 27,
          pitch: 1.0,
          yaw: Math.PI / 4,
          panSpeed: 36,
          edgeScroll: true,
          rotateSpeed: 1.2,
          zoom: { min: 0.5, max: 2 },
          // Open over the red colony's nest on whichever lawn is live.
          start: openingView(),
          bounds: { minX: -46, maxX: 46, minZ: -46, maxZ: 46 },
        },
      },
    },
  });
}

/** The game on the live lawn; picking another lawn rebuilds it in place (`maps.ts`). */
export const game = withSceneSet(sceneSet, (id) => buildGame(id as MapId));
