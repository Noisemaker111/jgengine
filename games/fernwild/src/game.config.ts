// Every import is one name per line, even a single name: a lane that adds a name, a prompt source or a
// system adds a line, which a rebase keeps beside another lane's (scripts/generated-rebase.ts). Two lanes
// adding a name to one import line, or a source to one list expression, was a hand rebase each time.
import {
  ambientFauna,
} from "./game/ambientFauna";
import {
  hdriEnvironment,
} from "@jgengine/assets/catalogs/hdriLibrary";
import {
  lutGrade,
} from "@jgengine/assets/catalogs/lutGrades";
import {
  authoredSpawnRotation,
} from "@jgengine/core/world/authoredSpawn";
import {
  createGameFlowSystem,
} from "@jgengine/core/game/gameFlow";
import {
  DEFAULT_WALK_CODES,
  defineGame,
} from "@jgengine/core/shell/gameKit.draw";

import {
  editorLayers,
} from "./editorLayers";
import {
  assets,
} from "./game/assets";
import {
  basePrompts,
} from "./game/base";
import {
  cavePrompts,
} from "./game/caves";
import {
  eggPrompts,
} from "./game/eggs";
import {
  bodyPrompts,
} from "./game/deathBody";
import {
  breedingPrompts,
} from "./game/breeding";
import {
  obeliskPrompts,
} from "./game/broodmother";
import {
  creaturePrompts,
  mountCanFly,
} from "./game/creatures";
import {
  content,
} from "./game/content";
import {
  itemTraits,
} from "./game/data/items";
import {
  SURVIVOR,
} from "./game/data/survivor";
import {
  entityModels,
  objectModels,
  scatterModels,
  rockSolids,
} from "./game/models";
import {
  BAG,
  BAG_SLOTS,
  HOTBAR,
  HOTBAR_SLOTS,
} from "./game/bags";
import {
  supplyDropPrompts,
} from "./game/supplyDrops";
import {
  canRun,
  survivorPrompts,
} from "./game/survivor";
import {
  CLIMB_SPEED,
} from "./game/data/flight";
import {
  SWIM_SLOW,
} from "./game/data/swim";
import {
  firstDay,
} from "./game/onboarding";
import {
  notePrompts,
} from "./game/dossier";
import {
  GameUI,
} from "./game/rune/GameUI";
import {
  BaseWorld,
} from "./game/world/BaseWorld";
import {
  onNewPlayer,
  survivorStart,
  systems,
} from "./loop";
import {
  time,
  world,
} from "./world";
import { sessionProbe } from "./game/probe/session";
import { survivorProbe } from "./game/probe/survivor";
import { creaturesProbe } from "./game/probe/creatures";
import { dossierProbe } from "./game/probe/dossier";
import { deathBodyProbe } from "./game/probe/deathBody";
import { bagsProbe } from "./game/probe/bags";
import { baseProbe } from "./game/probe/base";
import { breedingProbe } from "./game/probe/breeding";
import { cavesProbe } from "./game/probe/caves";
import { supplyDropsProbe } from "./game/probe/supplyDrops";
import { broodmotherProbe } from "./game/probe/broodmother";
import { probeFrame } from "./game/probe/frame";

export const game = defineGame({
  name: "Fernwild",
  simulation: { hz: 60 },
  rendering: {
    look: "cinematic",
    mood: { preset: "day", sun: { elevation: 58, color: "#fff0d0" }, horizonColor: "#b8dcd8", fog: { near: 180, far: 900 } },
    environmentSource: hdriEnvironment("tropical-clouds", { intensity: 0.9 }),
    postProcessing: {
      toneMapping: "aces",
      bloom: { strength: 0.25, radius: 0.6, threshold: 0.9 },
      ao: { radius: 1.1, intensity: 1.2, distanceFalloff: 3, blend: 1 },
      grade: { vignette: 0.12, lut: lutGrade("tropical-lush") },
    },
  },
  assets,
  hudTheme: false,
  world,
  time,
  content,
  inventories: {
    [BAG]: { slots: BAG_SLOTS, traits: itemTraits },
    // The number keys use this inventory's slots.
    [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits, hud: "hotbar" },
  },
  input: {
    ...DEFAULT_WALK_CODES,
    sprint: ["ShiftLeft"],
    // ARK's crouch, which under water swims down; Space swims up.
    crouch: ["KeyC"],
    fire: { hold: ["mouse0"], repeatMs: 250 },
    interact: ["KeyE"],
    // ARK's whistles: T for follow, U for stay.
    whistleFollow: ["KeyT"],
    whistleStay: ["KeyU"],
    // ARK's flyer grab: F lifts the creature below in the talons, and lets it go.
    airlift: ["KeyF"],
    inventory: ["KeyI", "Tab"],
    // ARK's extended HUD: the numbers under the vital icons.
    hudDetail: ["KeyH"],
    // ARK's third/first-person swap.
    view: ["KeyV"],
    // Building: R turns the ghost, G demolishes the piece in front.
    rotateBuild: ["KeyR"],
    demolish: ["KeyG"],
    pause: ["Escape", "KeyP"],
    ...Object.fromEntries(Array.from({ length: HOTBAR_SLOTS }, (_, slot) => [`slot${slot + 1}`, [`Digit${(slot + 1) % 10}`]])),
  },
  controls: {
    // A ridden flyer hovers: Space climbs, C dives, WASD flies at the mount's own speed; out of stamina it drops.
    movement: {
      canSprint: canRun,
      swim: { speedMultiplier: SWIM_SLOW, dive: true },
      feel: { runMultiplier: SURVIVOR.runMultiplier },
      flight: { mode: "hover", verticalSpeed: CLIMB_SPEED, canFly: mountCanFly },
    },
    // The camera starts behind the survivor on the authored spawn facing, so you wash up looking inland.
    // One prompt source per line, in the order the prompts show.
    prompts: (ctx) => [
      ...survivorPrompts(ctx),
      ...creaturePrompts(ctx),
      ...basePrompts(ctx),
      ...cavePrompts(ctx),
      ...bodyPrompts(ctx),
      ...supplyDropPrompts(ctx),
      ...eggPrompts(ctx),
      ...breedingPrompts(ctx),
      ...obeliskPrompts(ctx),
      ...notePrompts(ctx),
    ],
  },
  systems: [
    createGameFlowSystem(),
    ...systems,
    firstDay,
  ],
  newGame: survivorStart,
  loop: { onNewPlayer },
  GameUI,
  scene: {
    WorldOverlay: BaseWorld,
    editorLayers,
    entityModels,
    objectModels,
    ambientLife: { fauna: ambientFauna },
    // Grass, flowers and plants step down to the levels `games:provision build` wrote, chunk by chunk,
    // once they span 6% and then 2% of the screen.
    visibility: { meshLods: { screenSizes: [0.045, 0.015], hysteresis: 0.15 }, hlod: { distance: 250, hysteresis: 30, cluster: 1 } },
  },
  sceneScatterModels: scatterModels,
  // The whole Island's forests, rocks and ore plus the dense south beach: about 48k placements, all drawn.
  sceneScatterBudget: 60_000,
  sceneScatterSolids: rockSolids,
  persist: { mode: "manual" },
  camera: {
    perspective: "third",
    orbit: { initialYaw: authoredSpawnRotation(editorLayers) },
    lens: { frustum: { far: 2400 } },
  },
  capture: {
    play: [{ name: "start", input: {} }],
    // Boot and stay on the title, as the page opens.
    states: { title: [] },
    probe: (ctx) => {
      const frame = probeFrame(ctx);
      return {
        ...sessionProbe(ctx, frame),
        ...survivorProbe(ctx, frame),
        ...creaturesProbe(ctx, frame),
        ...dossierProbe(ctx, frame),
        ...deathBodyProbe(ctx),
        ...bagsProbe(ctx),
        ...baseProbe(ctx, frame),
        ...breedingProbe(ctx, frame),
        ...cavesProbe(ctx),
        ...supplyDropsProbe(ctx),
        ...broodmotherProbe(ctx, frame),
      };
    },
  },
});

