import { describe, expect, test } from "bun:test";

import { ROCK_SCHEMA } from "@jgengine/core/nature/natureGenerators";
import {
  assignScatterVariants,
  isScatterGeneratorItem,
  parseScatterVariantItem,
  scatterGeneratorBase,
  scatterGeneratorVariantCount,
  scatterVariantItem,
} from "./scatterGenerator";
import type { ScatterInstance } from "./scatterRegion";

const placement = (id: string, item: string): ScatterInstance => ({ id, regionId: "r", item, x: 0, y: 0, z: 0, rotationY: 0, scale: 1 });

describe("scatter generator items", () => {
  test("tell generator mappings from model mappings", () => {
    expect(isScatterGeneratorItem({ generator: "nature.rock" })).toBe(true);
    expect(isScatterGeneratorItem({ url: "/models/palm.glb" })).toBe(false);
    expect(isScatterGeneratorItem("asset:palm")).toBe(false);
  });

  test("bake a bounded number of variants", () => {
    expect(scatterGeneratorVariantCount({ generator: "g" })).toBe(6);
    expect(scatterGeneratorVariantCount({ generator: "g", variants: 0 })).toBe(1);
    expect(scatterGeneratorVariantCount({ generator: "g", variants: 99 })).toBe(16);
  });

  test("layer params over the named preset", () => {
    const base = scatterGeneratorBase({ generator: "nature.rock", preset: "boulder", params: { moss: 0 } }, ROCK_SCHEMA);
    expect(base["size"]).toBe(3.6);
    expect(base["moss"]).toBe(0);
  });

  test("give each placement a stable variant and leave other items alone", () => {
    const instances = [...Array.from({ length: 200 }, (_, i) => placement(`p${i}`, "palm")), placement("g", "grass")];
    const first = assignScatterVariants(instances, (item) => (item === "palm" ? 4 : undefined));
    const again = assignScatterVariants(instances, (item) => (item === "palm" ? 4 : undefined));
    expect(first.map((instance) => instance.item)).toEqual(again.map((instance) => instance.item));
    expect(first[200]).toBe(instances[200]);
    const used = new Set(first.slice(0, 200).map((instance) => parseScatterVariantItem(instance.item)?.variant));
    expect([...used].sort()).toEqual([0, 1, 2, 3]);
    expect(first.every((instance, index) => instance.id === instances[index]?.id)).toBe(true);
  });

  test("round-trip the variant tag", () => {
    expect(parseScatterVariantItem(scatterVariantItem("tree~2", 5))).toEqual({ item: "tree~2", variant: 5 });
    expect(parseScatterVariantItem("tree")).toBeNull();
  });
});
