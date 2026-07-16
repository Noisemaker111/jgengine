import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { world } from "../world";
import {
  BRIEFCASE_POS,
  DISTRICTS,
  DOCK_FIGHT_CENTER,
  districtAt,
  GARAGE_POS,
  GUNSHOP_POS,
  KINGPIN_POS,
  MARCO_POS,
  PLAYER_SPAWN,
  RACE_CHECKPOINTS,
  roadPoints,
  ROADS,
} from "./world/districts";

describe("vice-isle authored scene parity", () => {
  test("four district footprints round-trip from the document unchanged", () => {
    expect(DISTRICTS.map((d) => [d.id, d.center[0], d.center[1], d.radius])).toEqual([
      ["ocean_drive", -170, 0, 110],
      ["downtown", 40, -60, 120],
      ["port_carmine", 130, 190, 100],
      ["palm_heights", 70, -240, 90],
    ]);
  });

  test("nine street segments keep their order and endpoints", () => {
    expect(ROADS).toHaveLength(9);
    expect(ROADS[0]).toEqual({ from: [-180, -280], to: [-180, 280] });
    expect(ROADS[4]).toEqual({ from: [-180, -240], to: [180, -240] });
    expect(ROADS[8]).toEqual({ from: [-180, 240], to: [180, 240] });
  });

  test("the ten race checkpoints match the authored loop", () => {
    expect(RACE_CHECKPOINTS).toEqual([
      [-60, 120],
      [60, 120],
      [60, 0],
      [180, 0],
      [180, -240],
      [60, -240],
      [-60, -120],
      [-180, -120],
      [-180, 120],
      [-68, 122],
    ]);
  });

  test("every gameplay POI resolves to its exact position", () => {
    expect(PLAYER_SPAWN).toEqual([-176, 0, 24]);
    expect(KINGPIN_POS).toEqual([92, 0, -252]);
    expect(MARCO_POS).toEqual([52, 0, -52]);
    expect(GUNSHOP_POS).toEqual([-52, 0, 8]);
    expect(GARAGE_POS).toEqual([-68, 0, 116]);
    expect(DOCK_FIGHT_CENTER).toEqual([130, 0, 196]);
    expect(BRIEFCASE_POS).toEqual([142, 0, 208]);
  });
});

describe("vice-isle world", () => {
  const summary = summarizeEnvironment(world);

  test("is a populated environment world", () => {
    expect(world.kind).toBe("environment");
    expect(summary.isEmpty).toBe(false);
  });

  test("four districts stand as structure groups", () => {
    expect(summary.counts.structureGroups).toBe(4);
    expect(summary.counts.buildings).toBeGreaterThanOrEqual(40);
  });

  test("terrain has relief, water, and its own coastal palette", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.max).toBeGreaterThan(summary.terrain?.height.min ?? 0);
    expect(summary.terrain?.palette.low).not.toBe("#30402c");
  });

  test("structure groups carry their own styles, not the generic default", () => {
    const styles = summary.structures.map((s) => s.style);
    expect(styles).toContain("coastal");
    expect(styles).toContain("neon");
    expect(styles).toContain("industrial");
    expect(styles.every((s) => s !== "generic")).toBe(true);
  });

  test("nine street ribbons ride the road primitive", () => {
    expect(summary.counts.roads).toBe(9);
    expect(summary.roads.every((r) => r.width === 9)).toBe(true);
    expect(summary.roads.reduce((sum, r) => sum + r.length, 0)).toBeGreaterThan(4000);
  });

  test("districts resolve and roads cover the city", () => {
    expect(districtAt(40, -60)?.id).toBe("downtown");
    expect(districtAt(130, 190)?.id).toBe("port_carmine");
    expect(districtAt(500, 500)).toBeNull();
    expect(roadPoints(20).length).toBeGreaterThan(100);
  });

  test("a tropical rain system rolls in over Ocean Drive", () => {
    expect(summary.counts.weatherSystems).toBe(1);
    const [rain] = summary.weather;
    expect(rain?.kind).toBe("rain");
    expect(rain?.area.position).toEqual([-170, 0]);
    expect(rain?.density).toBeGreaterThan(0);
  });
});
