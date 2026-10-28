import { describe, expect, test } from "bun:test";
import { defineGenerator } from "../generator/generator";
import { defineParamSchema } from "../generator/paramSchema";
import { createScatterHeroSet, type ScatterHeroMember } from "./scatterHeroes";
import { isUniqueScatterItem, scatterGeneratorVariantCount, scatterPlacementVariant } from "./scatterGenerator";

function row(count: number, spacing: number): ScatterHeroMember[] {
  return Array.from({ length: count }, (_, index) => ({ id: `t${index}`, x: index * spacing, z: 0 }));
}

describe("scatter hero set", () => {
  test("picks the nearest placements within reach, at most the cap", () => {
    const set = createScatterHeroSet({ heroes: 3, distance: 25 });
    set.setMembers(row(100, 10));
    const update = set.update(0, 0);
    expect(update.heroes).toEqual(["t0", "t1", "t2"]);
    expect(update.changed).toBe(true);
    expect(set.update(0, 0).changed).toBe(false);
  });

  test("a hero keeps its place until past the hysteresis distance", () => {
    const set = createScatterHeroSet({ heroes: 1, distance: 10, hysteresis: 1.5 });
    set.setMembers([{ id: "a", x: 0, z: 0 }, { id: "b", x: 20, z: 0 }]);
    expect(set.update(2, 0).heroes).toEqual(["a"]);
    // b is now nearer than a, but a has not left its reach, so it stays the hero.
    expect(set.update(10.5, 0).heroes).toEqual(["a"]);
    expect(set.update(16, 0).heroes).toEqual(["b"]);
  });

  test("resident meshes past the cap leave least recently used first, never a current hero", () => {
    const set = createScatterHeroSet({ heroes: 1, distance: 5, resident: 2 });
    set.setMembers(row(10, 100));
    expect(set.update(0, 0).evicted).toEqual([]);
    expect(set.update(100, 0).evicted).toEqual([]);
    expect(set.update(200, 0).evicted).toEqual(["t0"]);
    expect(set.update(100, 0).evicted).toEqual([]);
    expect(set.update(300, 0).evicted).toEqual(["t2"]);
    expect(set.state()).toEqual({ heroes: ["t3"], resident: ["t1", "t3"] });
  });

  test("placements that are gone are evicted, and state round-trips", () => {
    const set = createScatterHeroSet({ heroes: 2, distance: 50 });
    set.setMembers(row(3, 10));
    set.update(0, 0);
    const saved = set.state();
    set.setMembers([{ id: "t0", x: 0, z: 0 }]);
    expect(set.update(0, 0)).toEqual({ heroes: ["t0"], evicted: ["t1"], changed: true });
    set.restore(saved);
    expect(set.state()).toEqual(saved);
  });

  test("an update reads only the cells near the camera", () => {
    const set = createScatterHeroSet({ heroes: 4, distance: 10 });
    const members = row(200_000, 1);
    set.setMembers(members);
    const started = performance.now();
    for (let step = 0; step < 1000; step += 1) set.update((step * 37) % 200_000, 0);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("unique scatter items", () => {
  const schema = defineParamSchema({ fields: [{ key: "seed", type: "seed" }, { key: "height", type: "number", min: 1, max: 10, default: 5 }] });
  const tree = defineGenerator({ id: "test.tree", label: "Tree", schema, output: "parts", generate: (params) => params });

  test("every placement gets its own seed, the same each time", () => {
    const spec = { generator: "test.tree", variants: "unique" as const };
    expect(isUniqueScatterItem(spec)).toBe(true);
    expect(scatterGeneratorVariantCount(spec)).toBe(4);
    const seeds = new Set<string>();
    for (let index = 0; index < 500; index += 1) seeds.add(scatterPlacementVariant(tree, "oak", spec, `p${index}`).seed);
    expect(seeds.size).toBe(500);
    expect(scatterPlacementVariant(tree, "oak", spec, "p7")).toEqual(scatterPlacementVariant(tree, "oak", spec, "p7"));
    expect(scatterPlacementVariant(tree, "oak", spec, "p7").seed).not.toBe(scatterPlacementVariant(tree, "elm", spec, "p7").seed);
  });
});
