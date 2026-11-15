import { describe, expect, test } from "bun:test";
import { sampleLightingZones } from "@jgengine/core/lighting/lightingZones";

import { TRACKS, trackById } from "../tracks/catalog";
import { storeLightingZones } from "./lighting";

const BASE = { keyColor: "#fff6e6", ambientColor: "#e8e4dc", skyColor: "#f4f1ea", groundColor: "#8f8878" };

function lightOnCourse(trackId: string, runMetres: number) {
  const track = trackById(trackId)!;
  const at = track.course.pointAt("main", track.def.origin + runMetres, 0);
  return sampleLightingZones(storeLightingZones(), at.x, at.z, BASE);
}

describe("store lighting zones", () => {
  test("every department drives under its own light, the whole length of its course", () => {
    for (const run of [0, 200, 400]) {
      const showroom = lightOnCourse("electronics", run);
      expect(showroom.key).toBeLessThan(0.2);
      expect(showroom.fill).toBeLessThan(0.4);
      const dock = lightOnCourse("loading-bay", run);
      expect(dock.keyColor).toBe("#ffa14a");
      const garden = lightOnCourse("garden-center", run);
      expect(garden.fill).toBeGreaterThan(1);
    }
  });

  test("Aisle 9 keeps the strip lights except across Frozen Foods, which goes cold blue", () => {
    const snacks = lightOnCourse("aisle-nine", 60);
    expect(snacks).toMatchObject({ key: 1, fill: 1, keyColor: BASE.keyColor });
    const frozen = lightOnCourse("aisle-nine", 225);
    expect(frozen.keyColor).toBe("#cfe4ff");
    expect(frozen.groundColor).toBe("#5f7ea6");
    const bulk = lightOnCourse("aisle-nine", 400);
    expect(bulk.keyColor).toBe(BASE.keyColor);
  });

  test("Produce and the Toy Aisle stay under the store's own rig", () => {
    expect(lightOnCourse("produce", 300)).toMatchObject({ key: 1, fill: 1, environment: 1, exposure: 1 });
    expect(lightOnCourse("toy-aisle", 300)).toMatchObject({ key: 1, fill: 1, environment: 1, exposure: 1 });
  });

  test("no department's light reaches another department's course", () => {
    const zones = storeLightingZones();
    for (const track of TRACKS) {
      const own = zones.filter((zone) => {
        const b = track.course.bounds;
        const [cx, cz] = zone.area.position ?? [0, 0];
        return cx >= b.minX - 100 && cx <= b.maxX + 100 && cz >= b.minZ - 100 && cz <= b.maxZ + 100;
      });
      for (const other of TRACKS) {
        if (other === track) continue;
        const b = other.course.bounds;
        for (const zone of own) {
          const [cx, cz] = zone.area.position ?? [0, 0];
          const reachZ = zone.area.d / 2 + (zone.fade ?? 0);
          const reachX = zone.area.w / 2 + (zone.fade ?? 0);
          const overlaps = cz - reachZ < b.maxZ && cz + reachZ > b.minZ && cx - reachX < b.maxX && cx + reachX > b.minX;
          expect({ zone: track.def.id, over: other.def.id, overlaps }).toEqual({ zone: track.def.id, over: other.def.id, overlaps: false });
        }
      }
    }
  });
});
