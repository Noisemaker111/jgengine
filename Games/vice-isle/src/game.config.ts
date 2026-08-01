import { defineGame } from "@jgengine/shell/defineGame";
import { assets } from "./game/assets";
import { audio } from "./game/audio/catalog";
import { content } from "./game/content";
import { inventories } from "./game/inventories";
import { keybinds } from "./game/keybinds";
import { prompts } from "./game/prompts";
import { entityModels, objectModels } from "./game/world/models";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";
import { drivingStore } from "./game/handroll";

export const game = defineGame({
  name: "Vice Isle",
  features: { quest: true, trade: true, dialogue: true },
  assets,
  audio,
  world,
  physics,
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
      car: {
        buttons: [
          { action: "jump", label: "Handbrake", shape: "lever" },
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
  capture: {
    play: ["game.start"],
    // `game.start` is what builds the isle — 170+ building lots, street furniture, traffic and peds
    // all start streaming only once it has run, which is *after* the host's readiness gate has
    // already seen an idle loader. Without this wait a play capture frames the bare terrain the
    // world had not been placed on yet, which is exactly what "sparse prototype" screenshots were.
    settleMs: 12000,
    views: {
      boulevard: {
        description: "Ocean Drive looking down the palm boulevard — beach and Gulf on the left, deco blocks on the right.",
        look: "@marker:player_spawn",
        lookFrom: "34,9,0.5",
      },
      downtown: {
        description: "Vice plaza street level: tower blocks, neon, traffic.",
        look: "@marker:bounty_plaza",
        lookFrom: "46,14,2.4",
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
      return { x: entity?.position[0] ?? 0, y: entity?.position[1] ?? 0, z: entity?.position[2] ?? 0 };
    },
  },
  prompts,
  entityModels,
  objectModels,
  // Mid-afternoon Gulf sun, not noon. The old key was almost overhead at a low intensity with a
  // very bright ambient, so nothing cast a shadow long enough to describe its own shape and every
  // building read as a flat sticker. Sun down and up in strength, ambient way down, plus a cool
  // bounce off the water so the shaded side of a pastel block goes blue rather than muddy.
  lighting: {
    ambient: { color: "#ffe4c0", intensity: 0.18 },
    hemisphere: { skyColor: "#a9d8ef", groundColor: "#b09a6f", intensity: 0.34 },
    directional: [
      {
        color: "#fff0cf",
        intensity: 2.05,
        position: [170, 74, 44],
        castShadow: true,
        // Cascades follow the camera, so the spawn at (-190, 40) gets the same shadow
        // density as the origin — a single origin-anchored box cannot cover this isle.
        cascades: 3,
        shadowMaxFar: 220,
        shadowMapSize: 2048,
      },
      { color: "#8fbcdc", intensity: 0.26, position: [-170, 44, -70] },
    ],
  },
  shadows: true,
  // Tropical film look: ACES so the sky and the white stucco stop clipping, bloom low enough that
  // chrome, water glints and neon actually catch, and a grade that lifts the shadows warm and pulls
  // the highlights golden. Saturation is the tropical read; the vignette and a touch of grain keep
  // the frame from looking like a flat render. AO is deliberately off — it re-renders the scene for
  // depth/normals and this open, hazy city barely shows the contact gain.
  postProcessing: {
    toneMapping: "aces",
    exposure: 0.96,
    bloom: { strength: 0.24, radius: 0.7, threshold: 0.9 },
    grade: {
      lift: [0.018, 0.011, 0.004],
      gain: [1.06, 1.02, 0.94],
      gamma: 0.96,
      saturation: 1.24,
      vignette: 0.26,
      grain: 0.012,
    },
  },
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
  // Warm sea haze rather than the old near-white wash, and it starts far closer so the city
  // separates into near, mid, and horizon bands instead of one evenly-lit slab.
  backdrop: {
    background: "#79bde2",
    fog: { color: "#b9cfd8", near: 90, far: 620 },
  },
  // Starts at the day curve's noon keyframe, which is the only point where `world.ts`'s authored
  // sky colours reach the dome unblended with the engine's dawn and dusk presets.
  time: { dayLength: 720, start: 360 },
  orientation: "landscape",
});
