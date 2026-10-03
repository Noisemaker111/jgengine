import { expect, test } from "bun:test";
import * as footprints from "./footprintGrid";
import type { MergedRegion, RegionFootprint } from "./footprintGrid";
import { footprintCells } from "./buildSockets";
import { validatePlacement } from "./placement";

const { canMerge, mergeFootprints, splitRegion, createFootprintGrid, footprintObstacles } = footprints;
const cell = (col: number, row = 0) => ({ col, row });
function part(id: string, col: number, capacity = 2): RegionFootprint {
  return { id, kind: "caller-kind", tier: 2, cells: [cell(col)], capacity };
}

test("regions require matching kind/tier and cardinal contact", () => {
  const a = part("a", 0);
  expect(canMerge(a, part("b", 1))).toBe(true);
  for (const b of [part("b", 3), { ...part("b", 1), cells: [cell(1, 1)] },
    { ...part("b", 1), kind: "other" }, { ...part("b", 1), tier: 3 }]) {
    expect(canMerge(a, b)).toBe(false);
    expect(mergeFootprints(a, b, "joined")).toBeNull();
  }
});

test("unequal capacities and original identities survive JSON merge/split", () => {
  const a = part("a", 0, 1);
  const b = { ...part("b", 1, 9), cells: [cell(1), cell(2)] };
  const merged = mergeFootprints(a, b, "pooled")!;
  expect(merged.capacity).toBe(10);
  expect(merged.cells).toEqual([cell(0), cell(1), cell(2)]);
  expect(splitRegion(JSON.parse(JSON.stringify(merged)), ["a"])).toEqual([a, b]);
  expect(splitRegion(merged, ["b"])).toEqual([b, a]);
});

test("nested pooling preserves contributions and explicit intermediate identities", () => {
  const ab = mergeFootprints(part("a", 0, 1), part("b", 1, 4), "ab")!;
  const cd = mergeFootprints(part("c", 2, 9), part("d", 3, 2), "cd")!;
  const all = mergeFootprints(ab, cd, "all")!;
  expect(all.capacity).toBe(16);
  expect(all.contributions.map(value => value.id)).toEqual(["a", "b", "c", "d"]);
  expect(splitRegion(JSON.parse(JSON.stringify(all)), ["a", "b"], { left: "ab", right: "cd" })).toEqual([ab, cd]);
  expect(splitRegion(all, ["a", "b"])).toBeNull();
  expect(splitRegion(all, ["a"], { left: "renamed", right: "bcd" })).toBeNull();
});

test.each([{ left: "c", right: "cd" }, { left: "ab", right: "b" }])(
  "split rejects an output identity belonging to the opposite partition: %j",
  ids => {
    const ab = mergeFootprints(part("a", 0, 1), part("b", 1, 4), "ab")!;
    const cd = mergeFootprints(part("c", 2, 9), part("d", 3, 2), "cd")!;
    const all = mergeFootprints(ab, cd, "all")!;
    expect(splitRegion(all, ["a", "b"], ids)).toBeNull();
  },
);

test("ordinary and own-source split identities remain mergeable without capacity loss", () => {
  const ab = mergeFootprints(part("a", 0, 1), part("b", 1, 4), "ab")!;
  const cd = mergeFootprints(part("c", 2, 9), part("d", 3, 2), "cd")!;
  const all = mergeFootprints(ab, cd, "all")!;
  for (const ids of [{ left: "ab", right: "cd" }, { left: "a", right: "c" }]) {
    const [left, right] = splitRegion(JSON.parse(JSON.stringify(all)), ["a", "b"], ids)!;
    expect(canMerge(left, right)).toBe(true);
    expect(mergeFootprints(left, right, "all")).toEqual(all);
    expect([left.capacity, right.capacity]).toEqual([5, 11]);
  }
});

test("duplicate cells, overlap, disconnected sources and duplicate identities are refused", () => {
  const a = part("a", 0);
  for (const b of [part("b", 0), { ...part("b", 1), cells: [cell(0), cell(1)] }, part("a", 1), { ...part("b", 1), cells: [cell(1), cell(1)] },
    { ...part("b", 1), cells: [cell(1), cell(3)] }, { ...part("b", 1), cells: [] },
    { ...part("b", 1), cells: [cell(1.5)] }, { ...part("b", 1), cells: [cell(Infinity)] }]) {
    expect(canMerge(a, b)).toBe(false);
    expect(mergeFootprints(a, b, "joined")).toBeNull();
  }
  const ab = mergeFootprints(a, part("b", 1), "ab")!;
  expect(mergeFootprints(ab, part("a", 2), "invalid")).toBeNull();
  const namedC = mergeFootprints(a, part("b", 1), "c")!;
  const cd = mergeFootprints(part("c", 2), part("d", 3), "cd")!;
  expect(mergeFootprints(namedC, cd, "invalid")).toBeNull();
});

test("capacity must be nonnegative and finite, and pooling must remain finite", () => {
  for (const capacity of [-1, NaN, Infinity]) {
    expect(mergeFootprints(part("a", 0), part("b", 1, capacity), "invalid")).toBeNull();
  }
  expect(mergeFootprints(part("a", 0, Number.MAX_VALUE), part("b", 1, Number.MAX_VALUE), "overflow")).toBeNull();
  const fractions = mergeFootprints(part("a", 0, 0.25), part("b", 1, 0.75), "fractional")!;
  expect(fractions.capacity).toBe(1);
  expect(splitRegion(fractions, ["a"])!.map(region => region.capacity)).toEqual([0.25, 0.75]);
});

test("split shares the caller's current tier without inventing upgrade capacity", () => {
  const merged = mergeFootprints(part("a", 0, 1), part("b", 1, 9), "pooled")!;
  const upgraded = { ...merged, tier: 4 };
  const split = splitRegion(upgraded, ["a"])!;
  expect(split.map(region => region.tier)).toEqual([4, 4]);
  expect(split.map(region => region.capacity)).toEqual([1, 9]);
  expect(canMerge(upgraded, part("c", 2))).toBe(false);
});

test("split rejects unknown/duplicate selections, empty sides and disconnected partitions", () => {
  const ab = mergeFootprints(part("a", 0), part("b", 1), "ab")!;
  const all = mergeFootprints(ab, part("c", 2), "all")!;
  for (const selected of [[], ["a", "unknown"], ["a", "a"], ["a", "b", "c"]]) {
    expect(splitRegion(all, selected, { right: "bc" })).toBeNull();
  }
  expect(splitRegion(all, ["a", "c"], { left: "ac" })).toBeNull();
  expect(splitRegion(all, ["b"], { right: "ac" })).toBeNull();
  expect(splitRegion(all, ["a"], { right: "a" })).toBeNull();
});

test("corrupt serialized contribution totals, coverage and duplicate identities fail closed", () => {
  const merged = mergeFootprints(part("a", 0, 1), part("b", 1, 9), "pooled")!;
  const corruptions: MergedRegion[] = [
    { ...merged, capacity: 20 },
    { ...merged, contributions: [merged.contributions[0]!] },
    { ...merged, contributions: [merged.contributions[0]!, { ...merged.contributions[1]!, id: "a" }] },
    { ...merged, contributions: [merged.contributions[0]!, { ...merged.contributions[1]!, cells: [cell(0)] }] },
  ];
  for (const corrupt of corruptions) {
    expect(mergeFootprints(corrupt, part("c", 2), "invalid")).toBeNull();
    expect(splitRegion(corrupt, ["a"])).toBeNull();
  }
});

test("caller budgets reject before reading oversized arrays", () => {
  const cells = new Array(10_000);
  Object.defineProperty(cells, 0, { get() { throw new Error("budget should refuse before cell reads"); } });
  expect(mergeFootprints({ ...part("a", 0), cells }, part("b", 1), "joined", { maxCells: 3 })).toBeNull();
  expect(canMerge(part("a", 0), part("b", 1), { maxContributions: 1 })).toBe(false);
  const merged = mergeFootprints(part("a", 0), part("b", 1), "joined")!;
  expect(splitRegion(merged, ["a"], {}, { maxCells: 1 })).toBeNull();
  expect(splitRegion(merged, ["a"], {}, { maxContributions: 1 })).toBeNull();
  expect(canMerge(part("a", 0), part("b", 1), { maxCells: -1 })).toBe(false);
  const corrupt = { ...merged, contributions: [{ ...merged.contributions[0]!, cells }, merged.contributions[1]!] };
  expect(splitRegion(corrupt, ["a"], {}, { maxCells: 2 })).toBeNull();
});

test("outputs are detached and merging never changes caller reservations", () => {
  const a = part("a", 0);
  const b = part("b", 1, 7);
  const merged = mergeFootprints(a, b, "joined")!;
  a.cells[0]!.col = 100;
  expect(merged.cells[0]).toEqual(cell(0));
  const split = splitRegion(merged, ["a"])!;
  split[0].cells[0]!.col = 200;
  expect(merged.contributions[0]!.cells[0]).toEqual(cell(0));
  expect(b.capacity).toBe(7);
});

test("grid placement composition replaces reservations only when the caller commits", () => {
  const grid = createFootprintGrid();
  const a = { ...part("a", 0, 2), cells: grid.cellsFor([0, 0], { w: 2, d: 1 }) };
  const b = { ...part("b", 0, 6), cells: grid.cellsFor([2, 0], { w: 2, d: 1 }) };
  grid.reserve(a.id, a.kind, a.cells); grid.reserve(b.id, b.kind, b.cells);
  const original = grid.snapshot();
  const merged = mergeFootprints(a, b, "pooled")!;
  expect(grid.snapshot()).toEqual(original);
  expect(merged.capacity).toBe(8);
  grid.release(a.id); grid.release(b.id); grid.reserve(merged.id, merged.kind, merged.cells);
  expect(validatePlacement({ center: [0, 0], footprint: { w: 1, d: 1 } }, { obstacles: footprintObstacles(grid) }).status).toBe("rejected");
  const split = splitRegion(merged, [a.id])!;
  grid.release(merged.id);
  for (const region of split) grid.reserve(region.id, region.kind, region.cells);
  expect(grid.snapshot()).toEqual(original);
});

test("modular socket footprints pool caller capacity independently of occupied area", () => {
  const small = { ...part("module-a", 0, 7), kind: "caller-module", cells: footprintCells([0, 0, 0], { w: 2, d: 1 }) };
  const large = { ...part("module-b", 0, 1), kind: "caller-module", cells: footprintCells([2.5, 0, 0], { w: 3, d: 1 }) };
  const merged = mergeFootprints(small, large, "modules")!;
  expect(merged.capacity).toBe(8);
  expect(splitRegion(JSON.parse(JSON.stringify(merged)), [large.id])).toEqual([large, small]);
});
