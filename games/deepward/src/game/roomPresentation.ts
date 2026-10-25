import { editorLayers, ROOMS, type Place, type Room } from "../world";
import type { Triple } from "./art";

export const ROOM_LIGHT_BUDGET = 7; // The eighth local light is the existing steam hazard.
export const ROOM_LIGHT_REACH = 12;
export const ROOM_LIGHT_INTENSITY: Readonly<Record<Place, number>> = { home: 17, vault: 27, cold: 13, wells: 6, choir: 3 };
const WALL_THICKNESS = 0.22, SLAB_THICKNESS = 0.14, LAMP_SPACING = 8;
export interface RoomSurface { id: string; at: Triple; size: Triple; kind: "floor" | "ceiling" | "wall"; axis?: "x" | "z" }
export interface RoomLamp { id: string; fixture: Triple; light: Triple; width: number; place: Place }
export interface RoomPresentation { surfaces: RoomSurface[]; lamps: RoomLamp[]; floorY: number; ceilingY: number }
type Volume = (typeof editorLayers.volumes)[number];

/** The same bounded selection drives both vault and home, without changing SDK light profiles. */
export function activeRoomLamps(lamps: readonly RoomLamp[], eye: readonly [number, number, number]): RoomLamp[] {
  return lamps.map(lamp => ({ lamp, distance: (eye[0] - lamp.light[0]) ** 2 + (eye[1] - lamp.light[1]) ** 2 + (eye[2] - lamp.light[2]) ** 2 }))
    .filter(entry => entry.distance < ROOM_LIGHT_REACH ** 2).sort((a, b) => a.distance - b.distance)
    .slice(0, ROOM_LIGHT_BUDGET).map(entry => entry.lamp);
}

/** Exact union of editor footprints: no rounded grid, duplicate floors, or internal doorway walls. */
export function deriveRoomPresentation(place: Place, rooms: readonly Room[] = ROOMS, volumes: readonly Volume[] = editorLayers.volumes): RoomPresentation {
  const selected = rooms.filter(room => room.place === place);
  if (!selected.length) throw new Error(`Deepward has no rooms for ${place}`);
  const elevations = selected.map(room => {
    const volume = volumes.find(entry => entry.id === room.id);
    if (volume?.shape !== "box" || !volume.halfExtents) throw new Error(`Room needs its authored elevation: ${room.id}`);
    return { floor: volume.center.y - volume.halfExtents.y, ceiling: volume.center.y + volume.halfExtents.y };
  });
  const floorY = elevations[0]!.floor, ceilingY = elevations[0]!.ceiling;
  if (!Number.isFinite(floorY) || !Number.isFinite(ceilingY) || ceilingY <= floorY || elevations.some(e => e.floor !== floorY || e.ceiling !== ceilingY)) {
    throw new Error("Deepward room elevations require an authored transition before presentation can join them");
  }
  const xs = [...new Set(selected.flatMap(r => [r.x - r.w / 2, r.x + r.w / 2]))].sort((a, b) => a - b);
  const zs = [...new Set(selected.flatMap(r => [r.z - r.d / 2, r.z + r.d / 2]))].sort((a, b) => a - b);
  const occupied = zs.slice(0, -1).map((z, iz) => xs.slice(0, -1).map((x, ix) => {
    const cx = (x + xs[ix + 1]!) / 2, cz = (z + zs[iz + 1]!) / 2;
    return selected.some(r => Math.abs(cx - r.x) < r.w / 2 && Math.abs(cz - r.z) < r.d / 2);
  }));
  const filled = (ix: number, iz: number) => occupied[iz]?.[ix] === true;
  const surfaces: RoomSurface[] = [];
  for (let iz = 0; iz < zs.length - 1; iz++) {
    const z0 = zs[iz]!, z1 = zs[iz + 1]!;
    let start = -1;
    for (let ix = 0; ix < xs.length; ix++) {
      if (filled(ix, iz) && start < 0) start = ix;
      if (!filled(ix, iz) && start >= 0) {
        const x0 = xs[start]!, x1 = xs[ix]!;
        // Top of the floor is the authored walking plane; roof underside is the authored ceiling.
        surfaces.push({ id: `floor:${iz}:${start}`, kind: "floor", at: [(x0 + x1) / 2, floorY - SLAB_THICKNESS / 2, (z0 + z1) / 2], size: [x1 - x0, SLAB_THICKNESS, z1 - z0] });
        surfaces.push({ id: `ceiling:${iz}:${start}`, kind: "ceiling", at: [(x0 + x1) / 2, ceilingY + SLAB_THICKNESS / 2, (z0 + z1) / 2], size: [x1 - x0, SLAB_THICKNESS, z1 - z0] });
        start = -1;
      }
    }
    for (let ix = 0; ix < xs.length - 1; ix++) {
      if (!filled(ix, iz)) continue;
      const x0 = xs[ix]!, x1 = xs[ix + 1]!, midY = (floorY + ceilingY) / 2;
      for (const side of [-1, 1]) {
        if (!filled(ix + side, iz)) surfaces.push({ id: `wall:z:${ix}:${iz}:${side}`, kind: "wall", axis: "z",
          at: [(side < 0 ? x0 : x1) + side * WALL_THICKNESS / 2, midY, (z0 + z1) / 2], size: [WALL_THICKNESS, ceilingY - floorY, z1 - z0] });
        if (!filled(ix, iz + side)) surfaces.push({ id: `wall:x:${ix}:${iz}:${side}`, kind: "wall", axis: "x",
          at: [(x0 + x1) / 2, midY, (side < 0 ? z0 : z1) + side * WALL_THICKNESS / 2], size: [x1 - x0, ceilingY - floorY, WALL_THICKNESS] });
      }
    }
  }
  const lamps: RoomLamp[] = [], seen = new Set<string>();
  for (const room of selected) {
    const nx = Math.max(1, Math.ceil(room.w / LAMP_SPACING)), nz = Math.max(1, Math.ceil(room.d / LAMP_SPACING));
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      const x = room.x - room.w / 2 + (ix + 0.5) * room.w / nx, z = room.z - room.d / 2 + (iz + 0.5) * room.d / nz;
      const key = `${x}:${z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lamps.push({ id: `${room.id}:lamp:${ix}:${iz}`, fixture: [x, ceilingY - 0.22, z], light: [x, ceilingY - 0.8, z], width: Math.min(2.8, room.w / nx * 0.6), place });
    }
  }
  return { surfaces, lamps, floorY, ceilingY };
}
