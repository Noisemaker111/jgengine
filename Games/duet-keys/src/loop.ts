import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { registerCommands } from "./game/abilities";
import { ROOMS } from "./game/rooms/catalog";
import { activeSpikeCells } from "./game/rooms/engine";
import { applyRoomVisuals, currentRoomState } from "./game/rooms/setup";
import { advanceRoom, loadCurrentRoom, seatPlayer, startRun } from "./game/runtime";
import { duetStore } from "./game/stores";
import { cellKey, HERO_IDS } from "./game/types";

const SOLVE_HOLD_SECONDS = 1.4;

const lastSignature = perContext(() => ({ value: "" }));

function onInit(ctx: GameContext): void {
  registerCommands(ctx);
  startRun(ctx);
}

function onNewPlayer(ctx: GameContext): void {
  seatPlayer(ctx, ctx.player.userId);
  loadCurrentRoom(ctx);
}

function onTick(ctx: GameContext, dt: number): void {
  const store = duetStore.read(ctx);
  if (store.status === "complete") {
    tickToast(ctx, dt);
    return;
  }
  const room = ROOMS[store.roomIndex];
  if (room === undefined) return;

  let state = currentRoomState(ctx, room);

  // Hazards: a hero standing on a live spike is bounced back to its spawn.
  const spikes = activeSpikeCells(room, state);
  if (spikes.size > 0) {
    let zapped = false;
    for (const heroId of HERO_IDS) {
      const entity = ctx.scene.entity.get(heroId);
      if (entity === null) continue;
      const cell = { x: Math.round(entity.position[0]), z: Math.round(entity.position[2]) };
      if (!spikes.has(cellKey(cell))) continue;
      const spawn = room.spawn[heroId];
      ctx.scene.entity.setPose(heroId, { position: [spawn.x, 0, spawn.z], rotationY: 0, dt: 0 });
      zapped = true;
    }
    if (zapped) {
      duetStore.update(ctx, (s) => ({ ...s, toast: "Zapped! Retract the spikes first.", toastTimer: 2.2 }));
      state = currentRoomState(ctx, room);
    }
  }

  const signature = [state.openGates, state.pressedPlates, state.poweredReceivers, state.activeSpikes]
    .map((list) => [...list].sort().join(","))
    .join("|");
  if (signature !== lastSignature(ctx).value) {
    applyRoomVisuals(ctx, room, state);
    duetStore.update(ctx, (s) => ({
      ...s,
      pressedPlates: state.pressedPlates,
      poweredReceivers: state.poweredReceivers,
      openGates: state.openGates,
      activeSpikes: state.activeSpikes,
    }));
    lastSignature(ctx).value = signature;
  }

  if (store.status === "playing") {
    if (state.solved) duetStore.update(ctx, (s) => ({ ...s, status: "solved", solveTimer: SOLVE_HOLD_SECONDS }));
  } else if (store.status === "solved") {
    const remaining = store.solveTimer - dt;
    if (remaining <= 0) advanceRoom(ctx);
    else duetStore.update(ctx, (s) => ({ ...s, solveTimer: remaining }));
  }

  tickToast(ctx, dt);
}

function tickToast(ctx: GameContext, dt: number): void {
  const store = duetStore.read(ctx);
  if (store.toast === null) return;
  const remaining = store.toastTimer - dt;
  if (remaining <= 0) duetStore.update(ctx, (s) => ({ ...s, toast: null, toastTimer: 0 }));
  else duetStore.update(ctx, (s) => ({ ...s, toastTimer: remaining }));
}

export const loop = { onInit, onNewPlayer, onTick };
