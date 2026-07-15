import { p2p } from "@jgengine/core/runtime/adapter";
import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { objectStyles } from "./game/objects/catalog";
import { DuetEnvironment, DuetVfx, renderHero } from "./game/render";
import { ROOMS } from "./game/rooms/catalog";
import { isWalkable } from "./game/rooms/engine";
import { currentRoomState } from "./game/rooms/setup";
import { duetStore } from "./game/stores";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Duet Keys",
  world,
  physics,
  input: keybinds,
  server: { mode: "coop" },
  save: "none",
  multiplayer: p2p({ topology: "private", room: "duet-keys" }),
  content,
  loop,
  GameUI,
  presentation: "3d",
  capture: {
    states: {
      solved: ["debug.win"],
      complete: ["debug.complete"],
    },
  },
  environment: DuetEnvironment,
  WorldOverlay: DuetVfx,
  renderEntity: renderHero,
  objectStyles,
  shadows: true,
  camera: {
    rig: "topDown",
    followEntityId: null,
    topDown: { height: 12, pitch: 1.24, yaw: 0, followSmoothing: 12 },
    frustum: { far: 400 },
  },
  movement: {
    mode: "grid",
    cellSize: 1,
    turnSpeed: 14,
    beforeCommit(frame) {
      const store = duetStore.peek(frame.ctx);
      if (store === undefined) return undefined;
      const room = ROOMS[store.roomIndex];
      if (room === undefined) return undefined;
      const state = currentRoomState(frame.ctx, room);
      const target = { x: Math.round(frame.next[0]), z: Math.round(frame.next[2]) };
      if (isWalkable(room, state, target)) return undefined;
      return frame.current;
    },
  },
  lighting: {
    ambient: { color: "#43518a", intensity: 0.6 },
    hemisphere: { skyColor: "#33417a", groundColor: "#0b1020", intensity: 0.55 },
    directional: [{ color: "#e6ecff", intensity: 1.05, position: [8, 20, 10], castShadow: true, shadowCameraSize: 22 }],
  },
  backdrop: {
    background: "#080b18",
    fog: { color: "#080b18", near: 26, far: 60 },
  },
});
