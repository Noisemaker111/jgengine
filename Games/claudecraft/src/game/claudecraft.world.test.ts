import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../world";
import { CRYPT, WORLD_DEPTH, WORLD_WIDTH, ZONES, zoneAt } from "./world/zones";

describe("claudecraft world", () => {
  const summary = summarizeEnvironment(world);

  test("is a populated environment world", () => {
    expect(world.kind).toBe("environment");
    expect(summary.isEmpty).toBe(false);
  });

  test("terrain spans the three zone bands with relief", () => {
    expect(summary.counts.terrain).toBe(1);
    expect(summary.terrain?.bounds.w).toBe(WORLD_WIDTH);
    expect(summary.terrain?.bounds.d).toBe(WORLD_DEPTH);
    expect(summary.terrain?.height.finite).toBe(true);
    expect((summary.terrain?.height.max ?? 0) - (summary.terrain?.height.min ?? 0)).toBeGreaterThan(3);
  });

  test("hub settlements, the crypt, and five dungeon compounds stand as structures", () => {
    expect(summary.counts.structureGroups).toBe(9);
    const buildingTotal = summary.structures.reduce((sum, entry) => sum + entry.buildings, 0);
    expect(buildingTotal).toBeGreaterThanOrEqual(44);
  });

  test("rain sits over the marsh and snow over the peaks", () => {
    expect(summary.counts.weatherSystems).toBe(2);
    const [rain, snow] = world.weather ?? [];
    expect(rain?.kind).toBe("rain");
    expect(snow?.kind).toBe("snow");
    const marsh = ZONES[1];
    expect(rain?.area.position?.[1]).toBe((marsh.zMin + marsh.zMax) / 2);
    expect(snow?.area.position?.[1]).toBeGreaterThan(ZONES[2].zMin);
  });

  test("vale carries the grass band", () => {
    expect(summary.counts.vegetationFields).toBe(1);
    expect(summary.vegetation[0].area.position?.[1]).toBe((ZONES[0].zMin + ZONES[0].zMax) / 2);
  });

  test("zone bands resolve by z and the crypt sits inside the peaks", () => {
    expect(zoneAt(-300).id).toBe("vale");
    expect(zoneAt(0).id).toBe("marsh");
    expect(zoneAt(300).id).toBe("peaks");
    expect(zoneAt(CRYPT.z).id).toBe("peaks");
  });
});
