import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { world } from "../world";
import {
  BOUNTY_SPOTS,
  BRIEFCASE_POS,
  AUTHORED_VEHICLE_SPAWNS,
  CICADA_STAGE_POS,
  DISTRICTS,
  DOCK_FIGHT_CENTER,
  districtAt,
  GARAGE_POS,
  GUNSHOP_POS,
  KINGPIN_POS,
  MARCO_POS,
  PLAYER_SPAWN,
  RACE_CHECKPOINTS,
  RACE_ROUTES,
  roadPoints,
  ROADS,
  SAFEHOUSE_POS,
  VCPD_POS,
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

  test("the eleven race checkpoints match the authored loop", () => {
    expect(RACE_CHECKPOINTS).toEqual([
      [-60, 120],
      [60, 120],
      [60, 0],
      [180, 0],
      [180, -240],
      [60, -240],
      [-60, -240],
      [-60, -120],
      [-180, -120],
      [-180, 120],
      [-68, 122],
    ]);
  });

  test("four authored race circuits ride the street grid", () => {
    expect(RACE_ROUTES.map((route) => route.id)).toEqual(["race-loop", "race-harbor", "race-heights", "race-coast"]);
    const avenues = new Set([-180, -60, 60, 180]);
    const streets = new Set([-240, -120, 0, 120, 240]);
    for (const route of RACE_ROUTES.filter((r) => r.id !== "race-loop")) {
      expect(route.checkpoints.length).toBeGreaterThanOrEqual(5);
      const start = route.checkpoints[route.checkpoints.length - 1]!;
      const first = route.checkpoints[0]!;
      expect(Math.hypot(start[0] - first[0], start[1] - first[1])).toBeLessThan(12);
      for (const [x, z] of route.checkpoints) {
        expect(avenues.has(x) || streets.has(z) || Math.min(...[...avenues].map((a) => Math.abs(x - a))) <= 8).toBe(true);
      }
    }
  });

  test("every gameplay POI resolves to its exact position", () => {
    expect(PLAYER_SPAWN).toEqual([-176, 0, 24]);
    expect(KINGPIN_POS).toEqual([92, 0, -252]);
    expect(MARCO_POS).toEqual([52, 0, -52]);
    expect(GUNSHOP_POS).toEqual([-52, 0, 8]);
    expect(GARAGE_POS).toEqual([-68, 0, 116]);
    expect(DOCK_FIGHT_CENTER).toEqual([130, 0, 196]);
    expect(BRIEFCASE_POS).toEqual([142, 0, 208]);
    expect(VCPD_POS).toEqual([54, 0, -40]);
    expect(SAFEHOUSE_POS).toEqual([48, 0, -222]);
    expect(CICADA_STAGE_POS).toEqual([74, 0, -236]);
  });

  test("the loop's authored spots sit inside their districts", () => {
    expect(districtAt(VCPD_POS[0], VCPD_POS[2])?.id).toBe("downtown");
    expect(districtAt(SAFEHOUSE_POS[0], SAFEHOUSE_POS[2])?.id).toBe("palm_heights");
    expect(districtAt(CICADA_STAGE_POS[0], CICADA_STAGE_POS[2])?.id).toBe("palm_heights");
  });

  test("five bounty spots rotate across the isle", () => {
    expect(BOUNTY_SPOTS).toHaveLength(5);
    expect(new Set(BOUNTY_SPOTS.map((s) => s.id)).size).toBe(5);
    const districts = new Set(BOUNTY_SPOTS.map((s) => districtAt(s.position[0], s.position[2])?.id ?? "streets"));
    expect(districts.size).toBeGreaterThanOrEqual(4);
  });

  test("aircraft plus the SUV and bus spawn from editor-authored vehicle markers", () => {
    expect(AUTHORED_VEHICLE_SPAWNS.map((spawn) => spawn.catalogId)).toEqual([
      "air_helicopter",
      "air_trainer",
      "air_prop",
      "air_jet",
      "air_vtol",
      "car_suv",
      "car_bus",
    ]);
    expect(new Set(AUTHORED_VEHICLE_SPAWNS.map((spawn) => spawn.id)).size).toBe(7);
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
