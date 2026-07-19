import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { registerCommands } from "./game/abilities";
import { ROOMS } from "./game/rooms/catalog";
import { activeSpikeCells, type Latch, type RoomState } from "./game/rooms/engine";
import { applyRoomVisuals, currentRoomState } from "./game/rooms/setup";
import { advanceRoom, loadCurrentRoom, seatPlayer, startRun } from "./game/runtime";
import { duetStore, pruneToast, raiseToast } from "./game/stores";
import { cellKey, HERO_IDS } from "./game/types";

const SOLVE_HOLD_SECONDS = 1.4;

/** Stable id + tint for Lumen's retained light beam (`combat.vfxInstance`). */
const BEAM_VFX_ID = "duet-prism-beam";
const BEAM_COLOR = 0x38f0ff;

const lastSignature = perContext(() => ({ value: "" }));
const beamTracker = perContext(() => ({ active: false, key: "" }));

/**
 * Drive Lumen's prism beam as a single retained VFX instance instead of a game-local mesh: create it when the
 * prism is latched and its beam reaches a cell, move it (partial update) as the traced path end shifts, and stop
 * it (with a short fade) when the prism is unlatched or blocked. Only emits on change, so a held, unchanging beam
 * costs no per-tick command traffic.
 */
function updateBeamVfx(ctx: GameContext, latch: Latch, state: RoomState): void {
  const tracker = beamTracker(ctx);
  const stopBeam = (): void => {
    if (!tracker.active) return;
    ctx.scene.entity.vfxInstance.stop(BEAM_VFX_ID, { fadeMs: 160 });
    tracker.active = false;
    tracker.key = "";
  };
  const prism = latch.prism;
  if (prism === null) {
    stopBeam();
    return;
  }
  const start = prism.cell;
  const end = state.beamPath.length > 0 ? state.beamPath[state.beamPath.length - 1]! : start;
  if (start.x === end.x && start.z === end.z) {
    stopBeam();
    return;
  }
  const key = `${start.x},${start.z}->${end.x},${end.z}`;
  const from: [number, number, number] = [start.x, 0.5, start.z];
  const to: [number, number, number] = [end.x, 0.5, end.z];
  if (!tracker.active) {
    ctx.scene.entity.vfxInstance.upsert({ id: BEAM_VFX_ID, kind: "beam", color: BEAM_COLOR, from, to, radius: 0.14 });
    tracker.active = true;
    tracker.key = key;
  } else if (key !== tracker.key) {
    ctx.scene.entity.vfxInstance.update(BEAM_VFX_ID, { from, to });
    tracker.key = key;
  }
}

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
    pruneToast(ctx);
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
      raiseToast(ctx, "Zapped! Retract the spikes first.");
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

  updateBeamVfx(ctx, store.latch, state);

  if (store.status === "playing") {
    if (state.solved) duetStore.update(ctx, (s) => ({ ...s, status: "solved", solveTimer: SOLVE_HOLD_SECONDS }));
  } else if (store.status === "solved") {
    const remaining = store.solveTimer - dt;
    if (remaining <= 0) advanceRoom(ctx);
    else duetStore.update(ctx, (s) => ({ ...s, solveTimer: remaining }));
  }

  pruneToast(ctx);
}

export const loop = { onInit, onNewPlayer, onTick };
