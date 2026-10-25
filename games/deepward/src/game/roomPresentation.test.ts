import { expect, test } from "bun:test";
import { ROOMS, floorAt, type Place } from "../world";
import { activeRoomLamps, deriveRoomPresentation, ROOM_LIGHT_BUDGET, ROOM_LIGHT_REACH } from "./roomPresentation";

for (const place of ["home", "vault"] as const) {
  test(`${place} floors cover exactly the authored union without overlaps; walls stay outside it`, () => {
    const plan = deriveRoomPresentation(place), floors = plan.surfaces.filter(s => s.kind === "floor");
    for (const floor of floors) expect(floor.at[1] + floor.size[1] / 2).toBeCloseTo(plan.floorY);
    for (let i = 0; i < floors.length; i++) for (const b of floors.slice(i + 1)) {
      const a = floors[i]!;
      expect(Math.abs(a.at[0] - b.at[0]) < (a.size[0] + b.size[0]) / 2 && Math.abs(a.at[2] - b.at[2]) < (a.size[2] + b.size[2]) / 2).toBe(false);
    }
    for (const room of ROOMS.filter(r => r.place === place)) {
      for (const fx of [-0.499, 0, 0.499]) for (const fz of [-0.499, 0, 0.499]) {
        const x = room.x + room.w * fx, z = room.z + room.d * fz;
        expect(floors.some(f => Math.abs(x - f.at[0]) <= f.size[0] / 2 && Math.abs(z - f.at[2]) <= f.size[2] / 2)).toBe(true);
      }
    }
    for (const wall of plan.surfaces.filter(s => s.kind === "wall")) expect(floorAt(wall.at[0], wall.at[2], place)).toBe(false);
    for (const roof of plan.surfaces.filter(s => s.kind === "ceiling")) expect(roof.at[1] - roof.size[1] / 2).toBeCloseTo(plan.ceilingY);
  });
  test(`${place} distributed lamps reach room edges and corners with a bounded active pool`, () => {
    const plan = deriveRoomPresentation(place);
    expect(ROOM_LIGHT_BUDGET + 1).toBe(8);
    for (const lamp of plan.lamps) { expect(floorAt(lamp.light[0], lamp.light[2], place)).toBe(true); expect(lamp.light[1]).toBeLessThan(plan.ceilingY); }
    for (const room of ROOMS.filter(r => r.place === place)) {
      for (const fx of [-0.499, 0, 0.499]) for (const fz of [-0.499, 0, 0.499]) {
        const x = room.x + room.w * fx, z = room.z + room.d * fz;
        expect(plan.lamps.some(l => Math.hypot(x - l.light[0], plan.floorY - l.light[1], z - l.light[2]) < ROOM_LIGHT_REACH)).toBe(true);
        const active = activeRoomLamps(plan.lamps, [x, plan.floorY + 1.62, z]);
        expect(active.length).toBeGreaterThan(0); expect(active.length).toBeLessThanOrEqual(ROOM_LIGHT_BUDGET);
        expect(active.every(l => Math.hypot(x - l.light[0], plan.floorY + 1.62 - l.light[1], z - l.light[2]) < ROOM_LIGHT_REACH)).toBe(true);
      }
    }
  });
}
test("fractional editor footprints keep an open shared boundary without grid rounding", () => {
  const place: Place = "vault";
  const rooms = [{ id: "a", name: "a", place, x: 0.25, z: 0.25, w: 2.5, d: 2.5 }, { id: "b", name: "b", place, x: 2.75, z: 0.25, w: 2.5, d: 2.5 }];
  const volumes = rooms.map(r => ({ id: r.id, kind: "deepward-room", shape: "box" as const, center: { x: r.x, y: 1.95, z: r.z }, halfExtents: { x: r.w / 2, y: 1.95, z: r.d / 2 } }));
  const plan = deriveRoomPresentation(place, rooms, volumes);
  expect(plan.surfaces.filter(s => s.kind === "floor").reduce((area, s) => area + s.size[0] * s.size[2], 0)).toBeCloseTo(12.5);
  expect(plan.surfaces.some(s => s.kind === "wall" && Math.abs(s.at[0] - 1.5) < 0.2 && Math.abs(s.at[2] - 0.25) < 0.2)).toBe(false);
});
