import { hdriEnvironment } from "@jgengine/assets/catalogs/hdriLibrary";
import { lutGrade } from "@jgengine/assets/catalogs/lutGrades";
import { defineGame } from "@jgengine/shell/defineGame";
import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { audio } from "./game/audio/catalog";
import { content } from "./game/content";
import { inventories } from "./game/inventories";
import { DEFAULT_WALK_CODES, hotbarSlotBindings } from "@jgengine/core/input/actionBindings";
import { prompts } from "./game/prompts";
import { entityModels, flockModels, objectModels } from "./game/world/models";
import { GameUI } from "./game/ui/GameUI";
import { SceneCaptureBinding } from "@jgengine/core/scene/sceneCapture.draw";
import { createElement } from "@jgengine/core/ui/jsx";
import { loop } from "./loop";
import { residentBoardStore } from "./game/world/residents";
import { physics, world } from "./world";
import { drivingStore, RIVAL_RACER_ID, raceStore, streetPlayOf } from "./game/streetPlay";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { wantedStore } from "./game/streetPlay";
import { vehicleById } from "./game/entities/vehicles/catalog";
import { sessionStore } from "./game/session";
import { pizzeriaBoardStore, pizzeriaStore, shiftGoal, shiftStore } from "./game/pizza/shift";
import { tideStore } from "./game/tide/tideRuntime";
import { nightStore } from "./game/pizza/nights";
import { openCircuits, tideRushStore } from "./game/race/tideRush";
import { cityOf, phoneStore } from "./game/cityRuntime";
import { startedStore } from "./game/commands";
import { DAY_SECONDS, secondsAtHour } from "./game/clock";

/** The HUD's wanted mirror, read without creating the pursuit slice. */
function wantedSnapshotOf(ctx: GameContext): { heat: number; stars: number } | null {
  const value = wantedStore.peek(ctx) as { heat?: unknown; stars?: unknown } | null | undefined;
  if (value == null || typeof value.heat !== "number" || typeof value.stars !== "number") return null;
  return { heat: value.heat, stars: value.stars };
}

/** The pizza loop as probe readings: what a suite proof or a flow asserts a shift did. */
function pizzaProbe(ctx: GameContext, vehicleId: string | null | undefined) {
  const shift = shiftStore.read(ctx);
  const shop = pizzeriaStore.read(ctx);
  const tide = tideStore.read(ctx);
  const medium = vehicleId == null ? null : vehicleById(ctx.scene.entity.get(vehicleId)?.name ?? "")?.medium;
  const goal = cityOf(ctx).missionView();
  return {
    cash: ctx.game.economy.balance(ctx.player.userId, "cash"),
    bag: shift.bag.length,
    board: shift.board.length,
    delivered: shop.deliveries,
    takings: shift.takings,
    lost: shift.lost,
    shiftOver: shift.summary === null ? 0 : 1,
    quotaMet: shift.summary?.metQuota === true ? 1 : 0,
    oven: shop.oven,
    toppings: shop.toppings,
    debt: shop.debt,
    swaps: shop.swaps ?? 0,
    hullDrops: shop.hullDrops ?? 0,
    tideStage: tide?.stageIndex ?? 0,
    open: tide?.open === true ? 1 : 0,
    // 0 on foot, 1 wheels, 2 a hull, 3 the blimp: what the swap docks and the tide change.
    medium: medium === "road" ? 1 : medium === "water" ? 2 : medium === "air" ? 3 : 0,
    // The engine is drowned or the hull aground (aircraft read their own stall here).
    stuck: streetPlayOf(ctx).telemetry().stalled ? 1 : 0,
    speed: Math.round(streetPlayOf(ctx).carSpeedKmh()),
    yaw: ctx.scene.entity.get(vehicleId ?? ctx.player.userId)?.rotationY ?? 0,
    chapterSteps: goal === null ? 0 : goal.step,
    storyAct: Number(cityOf(ctx).fact("story.act") ?? 0),
    nightScore: nightStore.read(ctx).score,
    circuitsOpen: openCircuits(tideRushStore.read(ctx).won).length,
    // Where the pager points right now, so a proof can follow the game's own guidance.
    goalX: shiftGoal(ctx)?.target[0] ?? cityOf(ctx).next()?.target?.[0] ?? 0,
    goalZ: shiftGoal(ctx)?.target[1] ?? cityOf(ctx).next()?.target?.[1] ?? 0,
    books: pizzeriaBoardStore.read(ctx) === true ? 1 : 0,
  };
}

export const game = defineGame({
  name: "High Tide Pizza",
  features: { trade: true, dialogue: true },
  assets,
  audio,
  world,
  scene: {
    editorLayers,
    WorldOverlay: () => createElement(SceneCaptureBinding),
    entityModels,
    objectModels,
    // Blocks past 350 m read as massing: their props draw as one merged proxy per cell. Closer in,
    // props step down to the levels `games:provision build` wrote once they span a fifth and then
    // a fourteenth of the screen, and the shade trees turn to baked impostors past 120 m.
    visibility: {
      hlod: { distance: 350, hysteresis: 40, cluster: 1.5 },
      meshLods: { screenSizes: [0.2, 0.07], hysteresis: 0.1, impostorDistance: 120 },
    },
    worldHealthBars: { roles: ["enemy", "hostile"] },
    worldItem: {
      pickupRadius: 2.4,
      rarityStyle: {
        common: { color: "#cfd6de" },
        rare: { color: "#4fa5e8", beam: true },
        legendary: { color: "#ffb020", beam: true, label: "LEDGER" },
      },
    },
  },
  sceneFlockModels: flockModels,
  scenePlacement: false,
  scenePathKinds: [],
  physics,
  // One 1/60 step per tick whatever the display runs at, so travel, jump apex, traffic and the
  // wanted/search clocks advance identically on a 30 Hz and a 144 Hz machine.
  simulation: { hz: 60 },
  inventories,
  input: {
    ...DEFAULT_WALK_CODES,
    sprint: ["ShiftLeft"],
    flightThrottleUp: ["ArrowUp"],
    flightThrottleDown: ["ArrowDown"],
    flightYawLeft: ["KeyZ"],
    flightYawRight: ["KeyC"],
    flightAirbrake: ["KeyX"],
    flightVectorToggle: ["KeyV"],
    interact: ["KeyE"],
    useMedkit: ["KeyQ"],
    exitVehicle: ["KeyF"],
    phone: ["KeyT"],
    taxiDuty: ["KeyY"],
    tow: ["KeyH"],
    radio: ["KeyR"],
    ...hotbarSlotBindings(4, { action: (slot) => `selectSlot${slot}` }),
  },
  server: { mode: "openworld" },
  controls: {
    // Touch controls are context-curated (#1370): each mode shows only the verbs that context uses.
  // On foot the joystick walks (analog) and the cluster is the five gameplay verbs; flight and
  // vehicle actions never appear until a vehicle is boarded (game/driving/driving.ts switches
  // modes via setTouchControlsMode). Slot switching on touch is the tappable hotbar cards.
    touch: {
      buttons: [
        { action: "interact", label: "Use" },
        { action: "jump", label: "Jump" },
        { action: "useMedkit", label: "First aid", icon: "heart" },
        { action: "sprint", label: "Sprint" },
      ],
      modes: {
        // A counter, a conversation or a receipt owns the screen: no stick or verbs over its buttons.
        screen: { movement: false, buttons: [], look: false },
        car: {
          buttons: [
            { action: "jump", label: "Handbrake", shape: "lever" },
            { action: "tow", label: "Tow", kind: "utility" },
            { action: "taxiDuty", label: "Taxi", kind: "utility" },
            { action: "radio", label: "Radio", kind: "utility" },
            { action: "exitVehicle", label: "Exit", kind: "utility" },
          ],
        },
        aircraft: {
          buttons: [
            { action: "flightThrottleUp", label: "Throttle +", shape: "lever" },
            { action: "flightThrottleDown", label: "Throttle −", shape: "lever" },
            { action: "jump", label: "Boost" },
            { action: "flightAirbrake", label: "Airbrake" },
            { action: "flightYawLeft", label: "Yaw L", icon: false },
            { action: "flightYawRight", label: "Yaw R", icon: false },
            { action: "flightVectorToggle", label: "VTOL", kind: "utility" },
            { action: "exitVehicle", label: "Exit", kind: "utility" },
          ],
        },
      },
    },
    prompts,
    pointer: { grabWorldItems: true },
    // turnSpeed rate-limits body facing so the chase camera arcs behind the runner
  // instead of snap-whipping 90° on every strafe tap.
    movement: { collideObjects: true, turnSpeed: 8 },
    orientation: "landscape",
  },
  // Offline whole-world save: autosaves cash, cred, quests, inventory, safehouse, best lap,
  // and the player's position to localStorage; restored behind the title's Continue.
  persist: true,
  content,
  loop,
  GameUI,
  hudTheme: false,
  uiRenderer: "rune",
  capture: {
    play: ["game.start"],
    // The dispatch poster is the first thing a player sees; a capture state keeps it reproducible.
    // `chase` (dev-only `chase.stage`) puts the player in a car with a witnessed crime, four stars
    // and HHPD cruisers already on the scene - the state a pursuit proof needs, without committing
    // crimes in front of a pedestrian and waiting for the response.
    states: {
      title: [],
      menu: ["game.start", { name: "menu.driver", input: { driver: "Mara Vell" } }, "menu.saveDoc", "menu.title"],
      "menu-bays": ["game.start", { name: "menu.driver", input: { driver: "Mara Vell" } }, "menu.saveDoc", "menu.bays"],
      "menu-new": ["menu.title"],
      chase: ["game.start", { name: "chase.stage", input: { mode: "chase" } }],
      // `flood` (dev-only `shift.stage`): high water at the port swap dock, on the jet-ski, two boxes in the bag.
      flood: ["game.start", { name: "shift.stage", input: { hour: 21.6 } }],
      "king-tide": ["game.start", { name: "shift.stage", input: { hour: 23.6 } }],
      // A jet-ski delivery: high water, the rider idling off Gus's block with his rooftop beacon ahead.
      "jetski-delivery": ["game.start", { name: "shift.stage", input: { hour: 21.6, toward: "gus", back: 18 } }],
      // Dusk at low tide: the family scooter outside Vell's as the shift opens, streets still dry.
      dusk: ["game.start", { name: "time.stage", input: { at: secondsAtHour(18.4) } }, { name: "drive.stage", input: { vehicle: "car_compact" } }],
      // `taxi` (dev-only `gigs.stage`): in the nearest car, taxi light on, a fare hailing at the closest kerb.
      taxi: ["game.start", { name: "gigs.stage", input: { mode: "taxi" } }],
      // Presentation states: the rider on the scooter, at Mercato Fresco, the garage, talking to Nonna,
      // and holding a paid or missed catering receipt.
      drive: ["game.start", { name: "drive.stage", input: { vehicle: "car_compact" } }],
      "drive-cop": ["game.start", { name: "drive.stage", input: { vehicle: "car_cop" } }],
      "drive-bus": ["game.start", { name: "drive.stage", input: { vehicle: "car_bus" } }],
      "fly-heli": ["game.start", { name: "drive.stage", input: { vehicle: "air_helicopter" } }],
      // On the Palm Heights Climb's start line with the race just started against the circuit's own rival.
      "race-loop": ["game.start", { name: "drive.stage", input: { vehicle: "car_compact" } }, { name: "race.stage", input: { route: "race-loop" } }],
      noon: ["game.start", { name: "time.stage", input: { at: secondsAtHour(12) } }],
      night: ["game.start", { name: "time.stage", input: { at: secondsAtHour(23.3) } }],
      shop: ["game.start", "shop.open"],
      garage: ["game.start", "garage.open"],
      dialogue: ["game.start", { name: "dialogue.open", input: { id: "person:nonna" } }],
      result: ["game.start", { name: "result.stage", input: { won: true } }],
      "result-missed": ["game.start", { name: "result.stage", input: { won: false } }],
    },
    views: {
      boulevard: {
        description: "Mainsail Boulevard looking down the palm boulevard — beach and Gulf on the left, deco blocks on the right.",
        look: "@marker:player_spawn",
        lookFrom: "34,9,0.5",
      },
      downtown: {
        description: "Mainsail plaza street level: tower blocks, neon, traffic.",
        look: "@marker:bounty_plaza",
        lookFrom: "46,14,2.4",
      },
      bus: {
        description: "The Islander shuttle parked at the docks, from the kerb.",
        look: "180,150",
        lookFrom: "11,3.2,0.9",
      },
      palms: {
        description: "A palm on the boulevard, close enough to read its trunk and fronds.",
        look: "@marker:player_spawn",
        lookFrom: "16,4,1.9",
      },
      beach: {
        description: "The boardwalk from the water line — dunes, palms, and the city behind them.",
        look: "-198,60",
        lookFrom: "30,8,4.5",
      },
    },
    probe: (ctx) => {
      const vehicleId = drivingStore.read(ctx);
      const entity = ctx.scene.entity.get(vehicleId ?? ctx.player.userId);
      const nearest = residentBoardStore.read(ctx)[0];
      const wanted = wantedSnapshotOf(ctx);
      const race = raceStore.read(ctx);
      // The nearest parked car (police cruisers excluded), so a flow can walk up to one and press E.
      let car: { x: number; z: number; distance: number } | null = null;
      if (vehicleId === null && entity !== null) {
        for (const other of ctx.scene.entity.list()) {
          if (vehicleById(other.name) === undefined || other.id.startsWith("cruiser_")) continue;
          const distance = Math.hypot(other.position[0] - entity.position[0], other.position[2] - entity.position[2]);
          if (car === null || distance < car.distance) car = { x: other.position[0], z: other.position[2], distance };
        }
      }
      return {
        driving: vehicleId == null ? 0 : 1,
        carX: car?.x ?? 0,
        carZ: car?.z ?? 0,
        carDistance: car?.distance ?? -1,
        // A circuit race in progress, and one that ended because the player left the car.
        racing: race?.active === true ? 1 : 0,
        raceCheckpoint: race?.checkpoint ?? 0,
        raceTime: race?.timeSec ?? 0,
        raceFinished: race?.finished === true ? 1 : 0,
        racePosition: race?.position ?? 0,
        raceForfeit: race?.forfeit != null ? 1 : 0,
        rivalOnScene: ctx.scene.entity.get(RIVAL_RACER_ID) === null ? 0 : 1,
        x: entity?.position[0] ?? 0,
        y: entity?.position[1] ?? 0,
        z: entity?.position[2] ?? 0,
        // The nearest resident's mood, so a drive can prove the cast is alive: -1 when nobody is near.
        residentMood: nearest === undefined ? -1 : Math.round(nearest.mood),
        // Heat and its tier: a save/reload proof compares these before and after.
        heat: wanted?.heat ?? 0,
        stars: wanted?.stars ?? 0,
        // The run is stopped behind the pause phone: a flow tells "never paused" from "paused then resumed".
        paused: sessionStore.read(ctx).paused ? 1 : 0,
        // Past the title and in the run; the city phone is out.
        started: startedStore.read(ctx) === true ? 1 : 0,
        phone: phoneStore.read(ctx) === true ? 1 : 0,
        ...pizzaProbe(ctx, vehicleId),
      };
    },
  },
  rendering: {
    // Golden hour is the hero time and the cycle runs on into a neon night. The mood owns the sun,
    // sky fill and haze; the sunset HDRI lights the surfaces and the neon sunset grade ties them.
    look: "cinematic",
    mood: { preset: "golden", sun: { azimuth: 260, elevation: 12, color: "#ffb27a" }, horizonColor: "#f0b8a0", fog: { near: 150, far: 700 } },
    environmentSource: hdriEnvironment("harbour-sunset", { intensity: 1 }),
    postProcessing: {
      toneMapping: "aces",
      exposure: 0.85,
      bloom: { strength: 0.3, threshold: 0.85 },
      grade: { lut: lutGrade("neon-sunset") },
    },
    shadows: true,
  },
  camera: {
    rig: "chase",
    rigs: {
      // The static chase block is the ON-FOOT baseline: flat FOV (speedForMax 0 pins it at base so
    // sprinting never pumps the lens), no bank roll, no velocity lead, no speed shake — every
    // driving-feel extra lives in DRIVE_CAMERA_TUNING (game/driving/driving.ts), overlaid via
    // ctx.camera.setChaseTuning while a vehicle is piloted and cleared on exit (#1299).
      chase: {
        distance: 7.5,
        height: 3,
        lookHeight: 1.15,
        springDamping: 7.5,
        fov: { base: 60, speedForMax: 0 },
      },
    },
    shake: { maxOffset: 0.24, maxRoll: 0.045, decayPerSecond: 2.8, exponent: 2, frequency: 21 },
    lens: { frustum: { far: 900 } },
  },
  // The city opens at golden hour, the art direction's hero time; the day curve runs on into night
  // and round through a bright noon (the `noon` capture state jumps there).
  time: { dayLength: DAY_SECONDS, start: secondsAtHour(17.5) },
});




