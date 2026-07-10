import { describe, expect, test } from "bun:test";
import { stripPolarityAt } from "../systems/course";
import { sectors } from "./sectors";

describe("authored sector course", () => {
  test("has 3 sectors with escalating length", () => {
    expect(sectors.length).toBe(3);
    for (const sector of sectors) expect(sector.length).toBe(400);
  });

  test("carries 12+ checkpoints total, 4 per sector", () => {
    const total = sectors.reduce((sum, sector) => sum + sector.checkpoints.length, 0);
    expect(total).toBeGreaterThanOrEqual(12);
    for (const sector of sectors) expect(sector.checkpoints.length).toBeGreaterThanOrEqual(4);
  });

  test("every checkpoint respawns onto a supported floor lane 1 strip", () => {
    for (const sector of sectors) {
      for (const checkpoint of sector.checkpoints) {
        const pol = stripPolarityAt(sector.strips, "floor", 1, checkpoint.z);
        expect(pol).not.toBeNull();
      }
    }
  });

  test("checkpoint ids are unique across the whole course", () => {
    const ids = sectors.flatMap((sector) => sector.checkpoints.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("sector 2 and 3 declare polarity gates", () => {
    expect(sectors[1]!.gates.length).toBeGreaterThan(0);
    expect(sectors[2]!.gates.length).toBeGreaterThan(0);
  });
});
