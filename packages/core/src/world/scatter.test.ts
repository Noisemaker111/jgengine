import { describe, expect, test } from "bun:test";
import { createRegionField, type RegionDef } from "@jgengine/core/world/regions";
import { pickWeighted, scatterItems, type ScatterLayer } from "@jgengine/core/world/scatter";

interface Tag {
  props: readonly ScatterLayer[];
}

const REGIONS: readonly RegionDef<Tag>[] = [
  { id: "sea", selector: [0.1], height: { baseHeight: -8, amplitude: 2, frequency: 0.02 }, data: { props: [] } },
  { id: "grove", selector: [0.55], height: { baseHeight: 1, amplitude: 1, frequency: 0.02 }, data: { props: [{ item: "tree", density: 0.5 }] } },
  { id: "ridge", selector: [0.95], height: { baseHeight: 18, amplitude: 12, frequency: 0.015, ridged: true }, data: { props: [{ item: "rock", density: 0.1 }] } },
];

const AREA = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
const layersFor = (sample: { data: Tag | undefined }): readonly ScatterLayer[] => sample.data?.props ?? [];

describe("scatter", () => {
  test("places opaque items deterministically, grounded and above water", () => {
    const field = createRegionField({ regions: REGIONS, seed: 5 });
    const a = scatterItems(field, AREA, layersFor);
    const b = scatterItems(createRegionField({ regions: REGIONS, seed: 5 }), AREA, layersFor);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBe(b.length);
    for (const instance of a) {
      expect(["tree", "rock"]).toContain(instance.item);
      expect(instance.y).toBeGreaterThanOrEqual(field.seaLevel);
      expect(Math.abs(instance.y - field.sampleHeight(instance.x, instance.z))).toBeLessThan(1e-6);
    }
  });

  test("honors the max cap", () => {
    const field = createRegionField({ regions: REGIONS, seed: 5 });
    expect(scatterItems(field, AREA, layersFor, { max: 20 }).length).toBeLessThanOrEqual(20);
  });

  test("pickWeighted respects weights and edges", () => {
    const entries = [
      { value: "a", weight: 1 },
      { value: "b", weight: 3 },
    ];
    expect(pickWeighted(entries, 0.1)).toBe("a");
    expect(pickWeighted(entries, 0.9)).toBe("b");
    expect(pickWeighted([], 0.5)).toBeNull();
  });
});
