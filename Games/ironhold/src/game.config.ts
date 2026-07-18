import { defineGame } from "@jgengine/shell/defineGame";

import { editorCatalogs } from "./editorCatalogs";
import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { entityModels } from "./game/models";
import { isPlayerSelectable } from "./game/session";
import { systems } from "./game/systems";
import { GameUI } from "./game/ui/GameUI";
import { IronholdWorldOverlay } from "./game/ui/WorldOverlay";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Ironhold",
  assets,
  world,
  physics,
  input: keybinds,
  server: { mode: "single" },
  save: "none",
  content,
  systems,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  entityModels,
  // Selection rings, marquee + click select, and right-click orders are all shell-native: the game
  // supplies who is selectable and the verb that receives { selection, point }.
  pointer: { select: true, selectFilter: isPlayerSelectable, orderCommand: "unit.order" },
  // Authored map dressing (war-road ribbon + forest ring) renders from the document; units, keeps,
  // and props spawn as entities in onInit, so object placement stays off — no double render.
  editorLayers,
  editorCatalogs,
  scenePlacement: false,
  // Faction-coloured health bars (green Vanguard / red Marauders) live in the world overlay so
  // friend/foe reads at a glance — the shell's built-in world bars are always red.
  WorldOverlay: IronholdWorldOverlay,
  // Soft shadows read well but are the dominant cost under software WebGL; a single 1024 map keeps
  // the look affordable. Real-GPU play is nowhere near this budget.
  shadows: true,
  lighting: {
    ambient: { color: "#9fb4cc", intensity: 0.5 },
    hemisphere: { skyColor: "#cfe0f2", groundColor: "#4a5a2e", intensity: 0.55 },
    directional: [
      {
        color: "#ffeccb",
        intensity: 1.3,
        position: [-36, 48, 26],
        castShadow: true,
        shadowMapSize: 1024,
        shadowCameraSize: 60,
      },
    ],
  },
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
