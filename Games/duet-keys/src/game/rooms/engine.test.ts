import { describe, expect, test } from "bun:test";

import { ROOMS } from "./catalog";
import { deriveRoomState, type HeroCells, type Latch } from "./engine";

const room1 = ROOMS[0]!; // hold-the-line: gate G needs plate p1
const room2 = ROOMS[1]!; // first-light: gate H needs receiver r_r

const EMPTY: Latch = { anchorCell: null, prism: null };

function heroesAt(lumen: HeroCells["lumen"], anchor: HeroCells["anchor"]): HeroCells {
  return { lumen, anchor };
}

describe("deriveRoomState — plates and gates", () => {
  const off = heroesAt({ x: -3, z: 0 }, { x: -3, z: 0 });

  test("weight gate stays shut with no plate held", () => {
    const state = deriveRoomState(room1, EMPTY, off);
    expect(state.openGates).toHaveLength(0);
    expect(state.pressedPlates).toHaveLength(0);
  });

  test("a latched weight opens the gate it wires to", () => {
    const plate = room1.plates[0]!;
    const state = deriveRoomState(room1, { anchorCell: plate.cell, prism: null }, off);
    expect(state.pressedPlates).toContain(plate.id);
    expect(state.openGates).toContain(room1.gates[0]!.id);
  });

  test("standing a hero on the plate presses it too", () => {
    const plate = room1.plates[0]!;
    const state = deriveRoomState(room1, EMPTY, heroesAt(plate.cell, { x: -3, z: 0 }));
    expect(state.pressedPlates).toContain(plate.id);
  });
});

describe("deriveRoomState — beams and receivers", () => {
  test("an east-facing prism powers the receiver in its line and opens the light gate", () => {
    const receiver = room2.receivers[0]!;
    const state = deriveRoomState(
      room2,
      { anchorCell: null, prism: { cell: { x: -3, z: -1 }, dir: "east" } },
      heroesAt({ x: -3, z: -1 }, { x: -3, z: 1 }),
    );
    expect(state.poweredReceivers).toContain(receiver.id);
    expect(state.openGates).toContain(room2.gates[0]!.id);
    expect(state.beamPath.length).toBeGreaterThan(0);
  });

  test("a prism facing away from the receiver powers nothing", () => {
    const state = deriveRoomState(
      room2,
      { anchorCell: null, prism: { cell: { x: -3, z: -1 }, dir: "west" } },
      heroesAt({ x: -3, z: -1 }, { x: -3, z: 1 }),
    );
    expect(state.poweredReceivers).toHaveLength(0);
    expect(state.openGates).toHaveLength(0);
  });
});

describe("deriveRoomState — solved", () => {
  test("solved only when both heroes sit on their own exit pads", () => {
    const half = deriveRoomState(room1, EMPTY, heroesAt(room1.exit.lumen, { x: 0, z: 0 }));
    expect(half.solved).toBe(false);
    const full = deriveRoomState(room1, EMPTY, heroesAt(room1.exit.lumen, room1.exit.anchor));
    expect(full.solved).toBe(true);
  });
});
