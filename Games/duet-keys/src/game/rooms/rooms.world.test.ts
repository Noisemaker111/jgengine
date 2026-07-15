import { describe, expect, test } from "bun:test";

import { cellKey, type Dir, type HeroId, type V2 } from "../types";
import { ROOMS, ROOM_COUNT } from "./catalog";
import { activeSpikeCells, deriveRoomState, isWalkable, type HeroCells, type Latch } from "./engine";

type Op =
  | { kind: "move"; hero: HeroId; to: V2[] }
  | { kind: "prism"; dir: Dir }
  | { kind: "anchor" };

/** Hand-authored intended solution for every room, replayed to prove each is solvable. */
const SOLUTIONS: Record<string, Op[]> = {
  "hold-the-line": [
    { kind: "move", hero: "anchor", to: [{ x: -3, z: -1 }, { x: -1, z: -1 }] },
    { kind: "anchor" },
    { kind: "move", hero: "anchor", to: [{ x: 2, z: -1 }, { x: 2, z: 1 }, { x: 3, z: 1 }] },
    { kind: "move", hero: "lumen", to: [{ x: 3, z: -1 }] },
  ],
  "first-light": [
    { kind: "prism", dir: "east" },
    { kind: "move", hero: "lumen", to: [{ x: 3, z: -1 }] },
    { kind: "move", hero: "anchor", to: [{ x: 3, z: 1 }] },
  ],
  interlock: [
    { kind: "prism", dir: "east" },
    { kind: "move", hero: "anchor", to: [{ x: -2, z: 1 }] },
    { kind: "anchor" },
    { kind: "move", hero: "anchor", to: [{ x: 4, z: 1 }] },
    { kind: "move", hero: "lumen", to: [{ x: 4, z: -1 }] },
  ],
  crosswire: [
    { kind: "prism", dir: "east" },
    { kind: "move", hero: "anchor", to: [{ x: -3, z: 1 }] },
    { kind: "anchor" },
    { kind: "move", hero: "anchor", to: [{ x: 5, z: 1 }] },
    { kind: "move", hero: "lumen", to: [{ x: 5, z: -1 }] },
  ],
};

function sign(n: number): number {
  return n === 0 ? 0 : n > 0 ? 1 : -1;
}

describe("duet-keys rooms are well-formed", () => {
  test("the campaign has four rooms", () => expect(ROOM_COUNT).toBe(4));

  for (const room of ROOMS) {
    const floor = new Set(room.floor.map(cellKey));
    test(`${room.id}: spawns and exits sit on floor`, () => {
      for (const hero of ["lumen", "anchor"] as const) {
        expect(floor.has(cellKey(room.spawn[hero]))).toBe(true);
        expect(floor.has(cellKey(room.exit[hero]))).toBe(true);
      }
    });
    test(`${room.id}: gate/spike wiring references real signals`, () => {
      const plateIds = new Set(room.plates.map((p) => p.id));
      const receiverIds = new Set(room.receivers.map((r) => r.id));
      for (const gate of room.gates) {
        expect(gate.plates.length + gate.receivers.length).toBeGreaterThan(0);
        for (const p of gate.plates) expect(plateIds.has(p)).toBe(true);
        for (const r of gate.receivers) expect(receiverIds.has(r)).toBe(true);
      }
      for (const spike of room.spikes)
        if (spike.retractedBy !== null)
          expect(plateIds.has(spike.retractedBy) || receiverIds.has(spike.retractedBy)).toBe(true);
    });
  }
});

describe("duet-keys rooms are solvable by their intended two-hero plan", () => {
  for (const room of ROOMS) {
    test(`${room.id}: the plan reaches a shared win`, () => {
      const heroes: HeroCells = { lumen: { ...room.spawn.lumen }, anchor: { ...room.spawn.anchor } };
      let latch: Latch = { anchorCell: null, prism: null };
      const ops = SOLUTIONS[room.id];
      expect(ops).toBeDefined();

      for (const op of ops!) {
        if (op.kind === "prism") {
          latch = { anchorCell: latch.anchorCell, prism: { cell: { ...heroes.lumen }, dir: op.dir } };
          continue;
        }
        if (op.kind === "anchor") {
          latch = { anchorCell: { ...heroes.anchor }, prism: latch.prism };
          continue;
        }
        for (const target of op.to) {
          let guard = 0;
          while (heroes[op.hero].x !== target.x || heroes[op.hero].z !== target.z) {
            const cur = heroes[op.hero];
            const dx = sign(target.x - cur.x);
            const next: V2 = dx !== 0 ? { x: cur.x + dx, z: cur.z } : { x: cur.x, z: cur.z + sign(target.z - cur.z) };
            const state = deriveRoomState(room, latch, heroes);
            const spikes = activeSpikeCells(room, state);
            expect(isWalkable(room, state, next)).toBe(true);
            expect(spikes.has(cellKey(next))).toBe(false);
            heroes[op.hero] = next;
            if (++guard > 200) throw new Error(`${room.id}: ${op.hero} path did not converge`);
          }
        }
      }

      expect(deriveRoomState(room, latch, heroes).solved).toBe(true);
    });
  }
});
