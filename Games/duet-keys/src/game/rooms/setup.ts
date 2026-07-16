import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { ObjectVisual } from "@jgengine/core/scene/objectStore";

import { HEROES } from "../entities/players/catalog";
import { objectStyles, type ObjectId } from "../objects/catalog";
import { duetStore } from "../stores";
import { cellKey, HERO_IDS, type V2 } from "../types";
import type { RoomDef } from "./catalog";
import { deriveRoomState, type RoomState } from "./engine";

function visual(color: string, opacity = 1): ObjectVisual {
  return { color, opacity };
}

function place(ctx: GameContext, id: ObjectId, cell: V2, instanceId: string, look?: ObjectVisual): void {
  ctx.scene.object.place(id, cell.x, 0, cell.z, {
    instanceId,
    parentSpace: "replace",
    visual: look,
  });
}

function clearScene(ctx: GameContext): void {
  for (const object of ctx.scene.object.list()) ctx.scene.object.remove(object.instanceId);
}

function gateCellId(gateId: string, index: number): string {
  return `gate:${gateId}:${index}`;
}

function spikeCellId(spikeId: string, index: number): string {
  return `spike:${spikeId}:${index}`;
}

/** Tear down the previous room and build the requested one, seating both heroes at their spawns. */
export function buildRoom(ctx: GameContext, room: RoomDef): void {
  clearScene(ctx);

  room.walls.forEach((cell, i) => place(ctx, "wall", cell, `wall:${i}`));
  room.emitters.forEach((cell, i) => place(ctx, "emitter", cell, `emit:${i}`));
  for (const plate of room.plates)
    place(ctx, "plate", plate.cell, `plate:${plate.id}`, visual(objectStyles.plate.color));
  for (const receiver of room.receivers)
    place(ctx, "receiver", receiver.cell, `recv:${receiver.id}`, visual(objectStyles.receiver.color));
  for (const gate of room.gates)
    gate.cells.forEach((cell, i) => place(ctx, "gate", cell, gateCellId(gate.id, i), visual(objectStyles.gate.color)));
  for (const spike of room.spikes)
    spike.cells.forEach((cell, i) =>
      place(ctx, "spike", cell, spikeCellId(spike.id, i), visual(objectStyles.spike.color)),
    );
  place(ctx, "exit_lumen", room.exit.lumen, "exit:lumen");
  place(ctx, "exit_anchor", room.exit.anchor, "exit:anchor");

  for (const heroId of HERO_IDS) {
    const spawn = room.spawn[heroId];
    if (ctx.scene.entity.get(heroId) === null) {
      ctx.scene.entity.spawn(heroId, { id: heroId, position: [spawn.x, 0, spawn.z], role: "player" });
    } else {
      ctx.scene.entity.setPose(heroId, { position: [spawn.x, 0, spawn.z], rotationY: 0, dt: 0 });
    }
  }
}

const DIM = 0.14;
const GATE_SUNK_Y = -1.1;
const PLATE_PRESSED_Y = -0.05;
const SPIKE_UP_Y = 0;
const SPIKE_RETRACTED_Y = -0.55;

/** Repaint stateful objects to match the derived room signals — a gate sinks into the floor when
 * open, a plate settles under a held weight, spikes rise/retract; color communicates the same
 * state for the top-down read. */
export function applyRoomVisuals(ctx: GameContext, room: RoomDef, state: RoomState): void {
  const open = new Set(state.openGates);
  const pressed = new Set(state.pressedPlates);
  const powered = new Set(state.poweredReceivers);
  const spikesActive = new Set(state.activeSpikes);

  for (const gate of room.gates) {
    const isOpen = open.has(gate.id);
    gate.cells.forEach((cell, i) => {
      const instanceId = gateCellId(gate.id, i);
      ctx.scene.object.move(instanceId, cell.x, isOpen ? GATE_SUNK_Y : 0, cell.z);
      ctx.scene.object.setVisual(
        instanceId,
        isOpen ? visual(HEROES.lumen.glow, 0.5) : visual(objectStyles.gate.color),
      );
    });
  }
  for (const plate of room.plates) {
    const isPressed = pressed.has(plate.id);
    ctx.scene.object.move(`plate:${plate.id}`, plate.cell.x, isPressed ? PLATE_PRESSED_Y : 0, plate.cell.z);
    ctx.scene.object.setVisual(
      `plate:${plate.id}`,
      isPressed ? visual(HEROES.anchor.color) : visual(objectStyles.plate.color),
    );
  }
  for (const receiver of room.receivers)
    ctx.scene.object.setVisual(
      `recv:${receiver.id}`,
      powered.has(receiver.id) ? visual(HEROES.lumen.color) : visual(objectStyles.receiver.color),
    );
  for (const spike of room.spikes) {
    const active = spikesActive.has(spike.id);
    spike.cells.forEach((cell, i) => {
      const instanceId = spikeCellId(spike.id, i);
      ctx.scene.object.move(instanceId, cell.x, active ? SPIKE_UP_Y : SPIKE_RETRACTED_Y, cell.z);
      ctx.scene.object.setVisual(instanceId, active ? visual(objectStyles.spike.color) : visual("#3a4466", DIM));
    });
  }
}

export function heroCells(ctx: GameContext): { lumen: V2; anchor: V2 } {
  const cellOf = (id: string, fallback: V2): V2 => {
    const entity = ctx.scene.entity.get(id);
    if (entity === null) return fallback;
    return { x: Math.round(entity.position[0]), z: Math.round(entity.position[2]) };
  };
  return { lumen: cellOf("lumen", { x: 0, z: 0 }), anchor: cellOf("anchor", { x: 0, z: 0 }) };
}

/** Recompute the full room state for the current room from live positions + latch. */
export function currentRoomState(ctx: GameContext, room: RoomDef): RoomState {
  const latch = duetStore.read(ctx).latch;
  return deriveRoomState(room, latch, heroCells(ctx));
}

export function cellSetKey(cell: V2): string {
  return cellKey(cell);
}
