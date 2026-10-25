import { defineGame } from "@jgengine/shell/defineGame";
import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { audio } from "./game/audio/catalog";
import { content } from "./game/content";
import { inventories } from "./game/inventories";
import { keybinds } from "./game/keybinds";
import { prompts } from "./game/prompts";
import { entityModels, objectModels } from "./game/world/models";
import { GameUI } from "./game/ui/GameUI";
import { bindHarborCapture } from "./game/menuProfile";
import { SceneCaptureBinding } from "@jgengine/shell/render/sceneCapture";
import { createElement } from "react";
import { harborKit, harborTheme } from "./game/ui/theme";
import { loop } from "./loop";
import { residentBoardStore } from "./game/world/residents";
import { physics, world } from "./world";
import { drivingStore } from "./game/handroll";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { wantedStore } from "./game/handroll/shared";
import { convoySnapshot } from "./game/runState";

/** The HUD's wanted mirror, read without creating the pursuit slice. */
function wantedSnapshotOf(ctx: GameContext): { heat: number; stars: number } | null {
  const value = wantedStore.peek(ctx) as { heat?: unknown; stars?: unknown } | null | undefined;
  if (value == null || typeof value.heat !== "number" || typeof value.stars !== "number") return null;
  return { heat: value.heat, stars: value.stars };
}

export const game = defineGame({
  name: "Harbor Heat",
  features: { trade: true, dialogue: true },
  assets,
  audio,
  world,
  editorLayers,
  scenePlacement: false,
  scenePathKinds: [],
  physics,
  // One 1/60 step per tick whatever the display runs at, so travel, jump apex, traffic and the
  // wanted/search clocks advance identically on a 30 Hz and a 144 Hz machine.
  simulation: { hz: 60 },
  inventories,
  input: keybinds,
  server: { mode: "openworld" },
  // Touch controls are context-curated (#1370): each mode shows only the verbs that context uses.
  // On foot the joystick walks (analog) and the cluster is the five gameplay verbs; flight and
  // vehicle actions never appear until a vehicle is boarded (game/handroll/driving.ts switches
  // modes via setTouchControlsMode). Slot switching on touch is the tappable hotbar cards.
  touch: {
    buttons: [
      { action: "fire", label: "Fire" },
      { action: "jump", label: "Jump" },
      { action: "interact", label: "Use" },
      { action: "throwGrenade", label: "Grenade", icon: "bomb" },
      { action: "useMedkit", label: "Medkit", icon: "heart" },
      { action: "sprint", label: "Sprint" },
    ],
    modes: {
      // A counter, a conversation or a receipt owns the screen: no stick or verbs over its buttons.
      screen: { movement: false, buttons: [], look: false },
      car: {
        buttons: [
          { action: "jump", label: "Handbrake", shape: "lever" },
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
  // Offline whole-world save: autosaves cash, cred, quests, inventory, safehouse, best lap,
  // and the player's position to localStorage; restored behind the title's Continue.
  persist: true,
  content,
  loop,
  GameUI,
  WorldOverlay: () => createElement(SceneCaptureBinding, { bind: bindHarborCapture }),
  hudTheme: harborTheme,
  uiKit: harborKit,
  // The phone HUD is drawn at its own compact size (pager, scanner, chart and belt each have a
  // phone cut in hud.css), so on a phone it scales against a square 480 px design instead of
  // shrinking the 1600 px desktop layout to the 0.4 floor, upright or sideways alike.
  hudFit: { mobile: { designSize: { width: 480, height: 480 }, minScale: 0.6 } },
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
      // `taxi` (dev-only `gigs.stage`): in the nearest car, taxi light on, a fare hailing at the closest kerb.
      taxi: ["game.start", { name: "gigs.stage", input: { mode: "taxi" } }],
      // Presentation states: the courier behind the wheel, at the gun counter, the garage, talking
      // to Marco, and holding a paid or missed receipt.
      drive: ["game.start", { name: "drive.stage", input: { vehicle: "car_sport" } }],
      "drive-cop": ["game.start", { name: "drive.stage", input: { vehicle: "car_cop" } }],
      "drive-bus": ["game.start", { name: "drive.stage", input: { vehicle: "car_bus" } }],
      shop: ["game.start", "shop.open"],
      garage: ["game.start", "garage.open"],
      dialogue: ["game.start", { name: "dialogue.open", input: { id: "person:marco" } }],
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
      return {
        x: entity?.position[0] ?? 0,
        y: entity?.position[1] ?? 0,
        z: entity?.position[2] ?? 0,
        // The nearest resident's mood, so a drive can prove the cast is alive: -1 when nobody is near.
        residentMood: nearest === undefined ? -1 : Math.round(nearest.mood),
        // Heat, its tier and the convoy's wave: a save/reload proof compares these before and after.
        heat: wanted?.heat ?? 0,
        stars: wanted?.stars ?? 0,
        wave: convoySnapshot(ctx)?.wave ?? 0,
      };
    },
  },
  prompts,
  entityModels,
  objectModels,
  // Mid-afternoon Gulf sun under a clear tropical sky. The scene document places the sun low in
  // the east-southeast so palms and blocks throw long shadows; the mood owns the rig, haze and grade.
  look: "cinematic",
  mood: "day",
  shadows: true,
  worldHealthBars: { roles: ["enemy", "hostile"] },
  // Direct-fire weapons want the muzzle→impact tracer; ballistic/exploding shots skip it
  // automatically so a lobbed round never draws a straight fake beam.
  presentationEffects: { tracers: true },
  worldItem: {
    pickupRadius: 2.4,
    rarityStyle: {
      common: { color: "#cfd6de" },
      rare: { color: "#4fa5e8", beam: true },
      legendary: { color: "#ffb020", beam: true, label: "LEDGER" },
    },
  },
  pointer: { grabWorldItems: true },
  // turnSpeed rate-limits body facing so the chase camera arcs behind the runner
  // instead of snap-whipping 90° on every strafe tap.
  movement: { collideObjects: true, turnSpeed: 8 },
  camera: {
    rig: "chase",
    // The static chase block is the ON-FOOT baseline: flat FOV (speedForMax 0 pins it at base so
    // sprinting never pumps the lens), no bank roll, no velocity lead, no speed shake — every
    // driving-feel extra lives in DRIVE_CAMERA_TUNING (game/handroll/driving.ts), overlaid via
    // ctx.camera.setChaseTuning while a vehicle is piloted and cleared on exit (#1299).
    chase: {
      distance: 7.5,
      height: 3,
      lookHeight: 1.15,
      springDamping: 7.5,
      fov: { base: 60, speedForMax: 0 },
    },
    shake: { maxOffset: 0.24, maxRoll: 0.045, decayPerSecond: 2.8, exponent: 2, frequency: 21 },
    frustum: { far: 900 },
  },
  // Starts at the day curve's noon keyframe, where the mood's sky colours reach the dome unblended
  // with the engine's dawn and dusk presets.
  time: { dayLength: 720, start: 360 },
  orientation: "landscape",
});




