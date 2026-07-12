import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { world } from "../world";
import { DISTRICTS, districtAt, roadPoints } from "./world/districts";

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

  test("districts resolve and roads cover the city", () => {
    expect(districtAt(40, -60)?.id).toBe("downtown");
    expect(districtAt(130, 190)?.id).toBe("port_carmine");
    expect(districtAt(500, 500)).toBeNull();
    expect(roadPoints(20).length).toBeGreaterThan(100);
  });
});
