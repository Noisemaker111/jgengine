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
    probe: (ctx) => {
      const vehicleId = drivingStore.read(ctx);
      const entity = ctx.scene.entity.get(vehicleId ?? ctx.player.userId);
      return { x: entity?.position[0] ?? 0, y: entity?.position[1] ?? 0, z: entity?.position[2] ?? 0 };
    },
  },
  prompts,
  entityModels,
  objectModels,
  lighting: {
    ambient: { color: "#ffe6c4", intensity: 0.72 },
    hemisphere: { skyColor: "#bfe2f2", groundColor: "#7a8560", intensity: 0.7 },
    directional: [{ color: "#fff2d8", intensity: 1.25, position: [120, 220, 40], castShadow: true }],
  },
  shadows: true,
  worldHealthBars: { roles: ["enemy", "hostile"] },
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
  backdrop: {
    background: "#a9dcf0",
    fog: { color: "#cfe9f2", near: 150, far: 640 },
  },
  time: { dayLength: 720, start: 320 },
  orientation: "landscape",
});
