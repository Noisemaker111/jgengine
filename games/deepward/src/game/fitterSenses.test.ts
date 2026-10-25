import { expect, test } from "bun:test";
import { createFitterSenses, FITTER_CONE_DEG, FITTER_HEARING, FITTER_SIGHT } from "./controls";
import { distance, lineOfSight, PRINT_SPAWN, VAULT_SPAWN, walkable, type Point } from "../world";

const OBSERVER = "bellwether-fitter";
const DIVER = "diver";
/** Facing straight from the Fitter at the diver, in the engine's atan2(dx, dz) yaw. */
const facing = (from: Point, to: Point) => Math.atan2(to[0] - from[0], to[2] - from[2]);
/** A walkable point `metres` from the Fitter, on a clear line, with room to stand. */
function openAt(metres: number): Point {
  for (let step = 0; step < 64; step++) {
    const angle = (step / 64) * Math.PI * 2;
    const point: Point = [PRINT_SPAWN[0] + Math.sin(angle) * metres, PRINT_SPAWN[1], PRINT_SPAWN[2] + Math.cos(angle) * metres];
    if (walkable(point[0], point[2], "vault") && lineOfSight(PRINT_SPAWN, point)) return point;
  }
  throw new Error("deepward: no open point at that range");
}

test("the Fitter sees a diver in front of it and keeps the memory for half a second", () => {
  const senses = createFitterSenses(), diver = openAt(6);
  expect(distance(PRINT_SPAWN, diver)).toBeLessThanOrEqual(FITTER_SIGHT);
  senses.observe({ id: OBSERVER, position: PRINT_SPAWN, yaw: facing(PRINT_SPAWN, diver) }, [{ id: DIVER, position: diver }], 1_000);
  expect(senses.memoryOf(OBSERVER, DIVER)).not.toBeNull();
  // The memory fades rather than pinning the diver in place forever.
  senses.observe({ id: OBSERVER, position: PRINT_SPAWN, yaw: facing(PRINT_SPAWN, diver) }, [{ id: DIVER, position: diver }], 1_500);
  expect(senses.memoryOf(OBSERVER, DIVER)?.confidence).toBe(1);
  expect(senses.memoryOf(OBSERVER, DIVER)).not.toBeNull();
  senses.observe({ id: OBSERVER, position: PRINT_SPAWN, yaw: facing(PRINT_SPAWN, diver) }, [], 2_100);
  expect(senses.memoryOf(OBSERVER, DIVER)).toBeNull();
});

test("a diver behind the Fitter is outside the cone, and the cone is wide enough for one room", () => {
  const senses = createFitterSenses(), diver = openAt(6);
  const away = facing(PRINT_SPAWN, diver) + Math.PI;
  senses.observe({ id: OBSERVER, position: PRINT_SPAWN, yaw: away }, [{ id: DIVER, position: diver }], 1_000);
  expect(senses.memoryOf(OBSERVER, DIVER)).toBeNull();
  // Half the cone still reaches the side of the room, which is what an indoor fight needs.
  const side = facing(PRINT_SPAWN, diver) + (FITTER_CONE_DEG / 2 - 5) * (Math.PI / 180);
  senses.observe({ id: OBSERVER, position: PRINT_SPAWN, yaw: side }, [{ id: DIVER, position: diver }], 2_000);
  expect(senses.memoryOf(OBSERVER, DIVER)).not.toBeNull();
});

test("a wall stops a sighting, and a search is heard only inside the hearing range", () => {
  const senses = createFitterSenses();
  // A point 5 m away that the station's own line test rejects: a sighting cannot cross it.
  const blocked = (() => {
    for (let step = 0; step < 96; step++) {
      const angle = (step / 96) * Math.PI * 2;
      const point: Point = [PRINT_SPAWN[0] + Math.sin(angle) * 5, PRINT_SPAWN[1], PRINT_SPAWN[2] + Math.cos(angle) * 5];
      if (!lineOfSight(PRINT_SPAWN, point)) return point;
    }
    return null;
  })();
  if (blocked !== null) {
    senses.observe({ id: OBSERVER, position: PRINT_SPAWN, yaw: facing(PRINT_SPAWN, blocked) }, [{ id: DIVER, position: blocked }], 1_000);
    expect(senses.memoryOf(OBSERVER, DIVER)).toBeNull();
  }

  const near = openAt(FITTER_HEARING - 3), far = openAt(FITTER_HEARING + 3);
  senses.pushStimulus({ kind: "sound", sourceId: DIVER, position: near, loudness: 1, at: 2_000 });
  senses.pushStimulus({ kind: "sound", sourceId: DIVER, position: far, loudness: 1, at: 2_000 });
  senses.observe({ id: OBSERVER, position: PRINT_SPAWN, yaw: 0 }, [], 2_100);
  const heard = senses.memoryOf(OBSERVER, DIVER);
  expect(heard).not.toBeNull();
  // The nearer sound is the one remembered, and the far one is out of earshot.
  expect(distance(heard!.lastKnownPos as unknown as Point, near)).toBeLessThan(0.001);
  expect(distance(PRINT_SPAWN, far)).toBeGreaterThan(FITTER_HEARING);
});

test("the station's own spawn points are a valid sight line for the test", () => {
  expect(lineOfSight(VAULT_SPAWN, PRINT_SPAWN)).toBe(true);
});
