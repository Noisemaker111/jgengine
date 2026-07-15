import { addCell, cellKey, type Dir, DIR_VECTORS, type HeroId, sameCell, type V2 } from "../types";
import type { RoomDef } from "./catalog";

export interface Prism {
  readonly cell: V2;
  readonly dir: Dir;
}

/** The two persistent devices the heroes latch onto the room. */
export interface Latch {
  readonly anchorCell: V2 | null;
  readonly prism: Prism | null;
}

export type HeroCells = Record<HeroId, V2>;

export interface RoomState {
  readonly pressedPlates: readonly string[];
  readonly poweredReceivers: readonly string[];
  readonly openGates: readonly string[];
  readonly activeSpikes: readonly string[];
  /** Cells a hero may not enter this frame: closed-gate cells (walls are already off-floor). */
  readonly blocked: ReadonlySet<string>;
  readonly beamPath: readonly V2[];
  readonly solved: boolean;
}

function floorSet(room: RoomDef): Set<string> {
  return new Set(room.floor.map(cellKey));
}

function closedGateCellKeys(room: RoomDef, open: ReadonlySet<string>): Set<string> {
  const keys = new Set<string>();
  for (const gate of room.gates) {
    if (open.has(gate.id)) continue;
    for (const cell of gate.cells) keys.add(cellKey(cell));
  }
  return keys;
}

function traceBeam(
  room: RoomDef,
  prism: Prism | null,
  floor: Set<string>,
  closedGates: Set<string>,
): { powered: Set<string>; path: V2[] } {
  const powered = new Set<string>();
  const path: V2[] = [];
  if (prism === null) return { powered, path };
  const step = DIR_VECTORS[prism.dir];
  const receiverAt = new Map(room.receivers.map((r) => [cellKey(r.cell), r.id]));
  const maxLen = room.floor.length + 1;
  let cursor = prism.cell;
  for (let i = 0; i < maxLen; i++) {
    cursor = addCell(cursor, step);
    const key = cellKey(cursor);
    if (!floor.has(key)) break; // wall or room edge stops the beam
    if (closedGates.has(key)) break; // a shut door blocks the light
    path.push(cursor);
    const receiver = receiverAt.get(key);
    if (receiver !== undefined) powered.add(receiver);
  }
  return { powered, path };
}

/** Resolve every derived signal in a room from its heroes and the two latched devices. Pure. */
export function deriveRoomState(room: RoomDef, latch: Latch, heroes: HeroCells): RoomState {
  const floor = floorSet(room);

  const pressed = new Set<string>();
  for (const plate of room.plates) {
    const held =
      sameCell(heroes.lumen, plate.cell) ||
      sameCell(heroes.anchor, plate.cell) ||
      (latch.anchorCell !== null && sameCell(latch.anchorCell, plate.cell));
    if (held) pressed.add(plate.id);
  }

  // Beams may pass through doors they open, so iterate to a fixed point.
  let open = new Set<string>();
  let powered = new Set<string>();
  let beamPath: V2[] = [];
  for (let iteration = 0; iteration < room.gates.length + 2; iteration++) {
    const closed = closedGateCellKeys(room, open);
    const beam = traceBeam(room, latch.prism, floor, closed);
    const nextOpen = new Set<string>();
    for (const gate of room.gates) {
      const platesOk = gate.plates.every((p) => pressed.has(p));
      const receiversOk = gate.receivers.every((r) => beam.powered.has(r));
      const hasRequirement = gate.plates.length > 0 || gate.receivers.length > 0;
      if (hasRequirement && platesOk && receiversOk) nextOpen.add(gate.id);
    }
    const stable = setsEqual(nextOpen, open) && setsEqual(beam.powered, powered);
    open = nextOpen;
    powered = beam.powered;
    beamPath = beam.path;
    if (stable) break;
  }

  const signals = new Set<string>([...pressed, ...powered]);
  const activeSpikes: string[] = [];
  for (const spike of room.spikes) {
    const retracted = spike.retractedBy !== null && signals.has(spike.retractedBy);
    if (!retracted) activeSpikes.push(spike.id);
  }

  const solved = sameCell(heroes.lumen, room.exit.lumen) && sameCell(heroes.anchor, room.exit.anchor);

  return {
    pressedPlates: [...pressed],
    poweredReceivers: [...powered],
    openGates: [...open],
    activeSpikes,
    blocked: closedGateCellKeys(room, open),
    beamPath,
    solved,
  };
}

export function isWalkable(room: RoomDef, state: RoomState, cell: V2): boolean {
  const key = cellKey(cell);
  const onFloor = room.floor.some((c) => cellKey(c) === key);
  return onFloor && !state.blocked.has(key);
}

export function activeSpikeCells(room: RoomDef, state: RoomState): Set<string> {
  const active = new Set(state.activeSpikes);
  const keys = new Set<string>();
  for (const spike of room.spikes) {
    if (!active.has(spike.id)) continue;
    for (const cell of spike.cells) keys.add(cellKey(cell));
  }
  return keys;
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}
