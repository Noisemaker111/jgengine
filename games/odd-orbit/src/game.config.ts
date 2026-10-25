import { defineGame } from "@jgengine/shell/defineGame";
import { createElement } from "react";
import { SceneCaptureBinding } from "@jgengine/shell/render/sceneCapture";

import { ORBIT_SOUNDS } from "./game/audio";
import { assets } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { objectModels } from "./game/models";
import { renderEntity } from "./game/render/renderEntity";
import { GameUI } from "./game/ui/GameUI";
import { orbitTheme } from "./game/ui/theme";
import { loop } from "./loop";
import { editorLayers } from "./editorLayers";
import { householdStore } from "./game/session/store";
import { DAY_LENGTH, physics, terrainField, world } from "./world";

export const game = defineGame({
  name: "Odd Orbit",
  world,
  physics,
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  time: { scale: 1, dayLength: DAY_LENGTH, start: DAY_LENGTH * (9 / 24), speeds: [1, 2, 4] },
  content,
  loop,
  GameUI,
  // Hands the live habitat frame to the save card's thumbnail request.
  WorldOverlay: () => createElement(SceneCaptureBinding, {}),
  hudTheme: orbitTheme,
  // Household journal lines are full sentences; give them time to read above the habitat tools.
  notices: { placement: "bottom", ttlMs: 8000 },
  assets,
  editorLayers,
  scenePlacement: false,
  objectModels,
  audio: { sounds: ORBIT_SOUNDS },
  renderEntity,
  pointer: { moveCommand: "world.pointer" },
  touch: { buttons: [] },
  capture: {
    // "New household" is `orbit.new`; the boot screen is a real menu, so a play capture has to open it.
    play: ["orbit.new"],
    // `mid-shift` (dev-only `household.stage`) runs the household forward to the moment somebody is
    // at a station on paid work: the roster, concerns and shift readout are a lived morning, not a
    // fresh boot. Play reaches the same morning by starting a household and waiting out the walk.
    states: {
      title: [],
      paused: ["orbit.new", "pauseToggle"],
      "mid-shift": ["orbit.new", { name: "household.stage", input: { mode: "shift" } }],
      // Four days of the same simulation: mastery tiers and promotion rungs have moved, which is the
      // roster a career proof needs and the one a lane otherwise plays three days to reach.
      "mid-week": ["orbit.new", { name: "household.stage", input: { mode: "week" } }],
      // The first transmission waiting on an answer, and the Authority's letter at the close of term one.
      transmission: ["orbit.new", { name: "household.stage", input: { mode: "transmission" } }],
      "term-review": ["orbit.new", { name: "household.stage", input: { mode: "review" } }],
    },
    probe: (ctx) => {
      const state = householdStore.read(ctx);
      let working = 0;
      for (const id of state.order) {
        const member = state.members[id];
        if (member !== undefined && member.action.kind === "use" && member.action.goal === "work") working += 1;
      }
      return { day: state.day, members: state.order.length, working, credits: state.credits, incident: state.incident == null ? 0 : 1, term: state.charter?.term ?? 0, review: state.charter?.review == null ? 0 : 1 };
    },
  },
  hudFit: { mobile: { designSize: { width: 390, height: 844 }, minScale: 1, maxScale: 1 } },
  lighting: {
    // A warm low key against a cool lilac fill: with the fill as bright as the key everything
    // flattened into one pink wash and the cream living floor never read as cream.
    ambient: { color: "#9c8fbf", intensity: 0.32 },
    hemisphere: { skyColor: "#b9a2dc", groundColor: "#3a3150", intensity: 0.45 },
    directional: [{ color: "#ffdca6", intensity: 2.3, position: [30, 48, 24], castShadow: true }],
  },
  // Dusk-moon presentation: the world owns its sky, so "cinematic" only fills the unset post stack
  // (IBL + tone-map/bloom/AO/grade). Lighting above is authored explicitly and wins.
  look: "cinematic",
  postProcessing: {
    toneMapping: "aces",
    exposure: 0.9,
    aa: "smaa",
    // Soft glow on the luminous green gardens and amber Yield console without bleeding the lilac stone.
    bloom: { strength: 0.3, radius: 0.6, threshold: 0.92 },
    // Contact creases under furniture and beside the habitat walls, kept modest for the draw budget.
    ao: { radius: 1.2, intensity: 1.6, distanceFalloff: 2.6 },
    grade: {
      lift: [0.02, 0.012, 0.03],
      gain: [1.04, 1.0, 1.02],
      gamma: 0.97,
      saturation: 1.12,
      vignette: 0.26,
      grain: 0.008,
    },
  },
  camera: {
    rig: "rts",
    followEntityId: null,
    frustum: { far: 1200 },
    rts: {
      start: { x: 0, z: 0 },
      height: 19,
      pitch: 1.0,
      yaw: 0,
      targetOffset: { y: terrainField.sampleHeight(0, 0) },
      panSpeed: 30,
      edgeScroll: true,
      rotateSpeed: 1.1,
      bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
      zoom: { min: 0.55, max: 2.2, speed: 1 },
    },
  },
});
