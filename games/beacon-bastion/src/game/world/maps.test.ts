import { describe, expect, test } from "bun:test";

import downtown from "../../downtown.scene.json";
import mainStreet from "../../editor.scene.json";
import school from "../../school.scene.json";
import { MAP_IDS, MAPS } from "../../maps";
import { TOWER_CATALOG } from "../entities/towers/catalog";

type Doc = { markers: { id: string; kind: string; position: { x: number; z: number }; meta?: Record<string, unknown> }[]; paths: { id: string; points: { x: number; z: number }[]; width?: number }[] };
const DOCS: Record<string, Doc> = { "main-street": mainStreet as unknown as Doc, downtown: downtown as unknown as Doc, school: school as unknown as Doc };

function road(doc: Doc, id: string): [number, number][] {
  return (doc.paths.find((path) => path.id === id)?.points ?? []).map((point) => [point.x, point.z]);
}

function distanceToRoads(doc: Doc, x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const points of [road(doc, "creep-path"), road(doc, "creep-path-flank")]) {
    for (let index = 1; index < points.length; index += 1) {
      const [ax, az] = points[index - 1]!, [bx, bz] = points[index]!;
      const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length));
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
  }
  return best;
}

/** The shortest reach of any worker that throws things: every plot on every map must cover the street. */
const SHORTEST_REACH = Math.min(...Object.values(TOWER_CATALOG).filter((def) => def.fireRateHz > 0).map((def) => def.range));

describe("every map is a complete, playable street", () => {
  for (const id of MAP_IDS) {
    const doc = DOCS[id]!;
    test(`${MAPS[id].label}: two roads that both end at the town hall, at least eleven plots, a spawn for each road`, () => {
      const hall = doc.markers.find((marker) => marker.id === "keep")!.position;
      const main = road(doc, "creep-path"), flank = road(doc, "creep-path-flank");
      expect(main.at(-1)).toEqual([hall.x, hall.z]);
      expect(flank.length).toBeGreaterThanOrEqual(2);
      expect(doc.markers.filter((marker) => marker.id.startsWith("plot-")).length).toBeGreaterThanOrEqual(11);
      expect(doc.markers.some((marker) => marker.id === "creep-spawn")).toBe(true);
    });

    test(`${MAPS[id].label}: every plot sits beside a road, within every worker's reach, and plots never overlap`, () => {
      const plots = doc.markers.filter((marker) => marker.id.startsWith("plot-"));
      for (const plot of plots) {
        const gap = distanceToRoads(doc, plot.position.x, plot.position.z);
        expect(gap, plot.id).toBeGreaterThanOrEqual(3.5);
        expect(gap + 1, plot.id).toBeLessThanOrEqual(SHORTEST_REACH);
      }
      for (let i = 0; i < plots.length; i += 1) {
        for (let j = i + 1; j < plots.length; j += 1) {
          expect(Math.hypot(plots[i]!.position.x - plots[j]!.position.x, plots[i]!.position.z - plots[j]!.position.z)).toBeGreaterThanOrEqual(6);
        }
      }
    });

    test(`${MAPS[id].label}: buildings stand off the street with signed landmarks`, () => {
      const buildings = doc.markers.filter((marker) => marker.kind === "building" && marker.meta?.["model"] !== "lamp");
      expect(buildings.length).toBeGreaterThanOrEqual(12);
      for (const building of buildings.filter((marker) => !String(marker.meta?.["model"]).match(/car|wagon/))) {
        expect(distanceToRoads(doc, building.position.x, building.position.z), building.id).toBeGreaterThanOrEqual(7.5);
      }
      expect(buildings.some((marker) => marker.meta?.["sign"] === "SCHOOL")).toBe(true);
    });
  }

  test("switching maps rebuilds the game on the other street in place: roads, plots and spawn follow", async () => {
    const { game } = await import("../../game.config");
    const path = await import("./path");
    const mainSpawn = path.SPAWN_POINT;
    const downtownGame = game.scenes.build("downtown");
    expect(downtownGame).not.toBe(game);
    expect([path.SPAWN_POINT[0], path.SPAWN_POINT[2]]).toEqual([-40, -18]);
    expect(path.BUILD_PLOTS.find((plot) => plot.id === "plot-1")!.position[0]).toBe(-30);
    game.scenes.build("main-street");
    expect([path.SPAWN_POINT[0], path.SPAWN_POINT[2]]).toEqual([mainSpawn[0], mainSpawn[2]]);
  });

  test("the downtown grid is a different street: its roads run square and enter from two sides", () => {
    const main = road(DOCS.downtown!, "creep-path"), flank = road(DOCS.downtown!, "creep-path-flank");
    for (const points of [main, flank]) {
      for (let index = 1; index < points.length; index += 1) {
        const [ax, az] = points[index - 1]!, [bx, bz] = points[index]!;
        expect(ax === bx || az === bz).toBe(true);
      }
    }
    expect(main[0]).not.toEqual(road(DOCS["main-street"]!, "creep-path")[0]);
    expect(Math.abs(flank[0]![1])).toBeGreaterThan(30);
  });
});
