import { defineGame } from "@jgengine/shell/defineGame";

import { BRIGHTWAY_SOUNDS } from "./game/audio";
import { assets } from "./game/assets";
import { DAY_LENGTH } from "./game/catalog";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { entityModels, objectModels } from "./game/models";
import { BrightwayParkWorldOverlay } from "./game/render/WorldOverlay";
import { session } from "./game/session";
import { park } from "./game/park";
import { GameUI } from "./game/ui/GameUI";
import { parkKit } from "./game/ui/kit";
import { parkTheme } from "./game/ui/theme";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Brightway Park",
  world,
  physics,
  assets,
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  // The park is one declaration (`game/park.ts`); its system runs the world and its commands.
  systems: [park.system],
  time: { scale: 1, dayLength: DAY_LENGTH, start: DAY_LENGTH * (9 / 24), speeds: [1, 2, 4], startPaused: true },
  content,
  loop,
  GameUI,
  entityModels,
  objectModels,
  WorldOverlay: BrightwayParkWorldOverlay,
  worldHealthBars: false,
  // A refused build is a deny notice; its cue is the park's own "denied" chime.
  audio: { sounds: BRIGHTWAY_SOUNDS, uiCues: { deny: BRIGHTWAY_SOUNDS.denied! } },
  notices: { cap: 3, ttlMs: 5000 },
  // The build palette is the touch control: no derived pick/clear buttons over it.
  touch: { buttons: [] },
  uiKit: parkKit,
  hudTheme: parkTheme,
  look: "cinematic",
  mood: "day",
  capture: {
    play: ["park.start"],
    // `full-park` stages the day a reviewer asks about: gates open, the authored starter park at
    // its guest cap, lines at the rides. It composes the dev-only `park.stage`, which runs the
    // park's own tick forward instead of the lane waiting out a day at 4x.
    states: {
      title: [],
      menu: ["park.start", "menu.saveDoc", "menu.title"],
      "menu-saves": ["park.start", "menu.saveDoc", "menu.saves"],
      "menu-new": ["menu.new"],
      paused: ["park.start", "pauseToggle"],
      "full-park": ["park.start", { name: "park.stage", input: { mode: "full" } }],
    },
    views: {
      menu: { description: "Gate board over the park, Continue highlighted", state: "menu", settleMs: 1800 },
      menuSaves: { description: "Park saves with the saved day", state: "menu-saves", settleMs: 1800 },
      menuNew: { description: "New day pane with the scenarios", state: "menu-new", settleMs: 1200 },
    },
    probe: (ctx) => {
      let queued = 0;
      let riding = 0;
      for (const guest of session.guests.values()) {
        if (guest.phase === "queued") queued += 1;
        else if (guest.phase === "riding") riding += 1;
      }
      const w = park.of(ctx);
      return { guests: session.guests.size, queued, riding, rating: w.num("park.rating"), cash: w.num("park.cash"), breakdowns: w.num("park.breakdowns") };
    },
  },
  pointer: { moveCommand: "park.pointer", secondaryCommand: "build.clear" },
  camera: {
    rig: "rts",
    followEntityId: null,
    frustum: { far: 1200 },
    rts: {
      start: { x: 0, z: 16 },
      height: 52,
      pitch: 0.86,
      yaw: Math.PI / 4,
      panSpeed: 55,
      edgeScroll: false,
      rotateSpeed: 1.1,
      bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 },
      zoom: { min: 0.5, max: 2.4, speed: 1 },
    },
  },
});

