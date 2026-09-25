import { describe, expect, test } from "bun:test";
import { resolveViewports, splitViewports, viewportPixels } from "./viewports";

describe("splitViewports", () => {
  test("one seat fills the screen; two split side by side or stacked", () => {
    expect(splitViewports(["slot:0"])).toEqual([{ slot: "slot:0", rect: [0, 0, 1, 1] }]);
    expect(splitViewports(["slot:0", "slot:1"]).map((def) => def.rect)).toEqual([[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]]);
    expect(splitViewports(["slot:0", "slot:1"], "horizontal").map((def) => def.rect)).toEqual([[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]]);
  });

  test("three put the first on top, four make a grid, five fill rows", () => {
    expect(splitViewports(["a", "b", "c"]).map((def) => def.rect)).toEqual([[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]);
    expect(splitViewports(["a", "b", "c", "d"]).map((def) => def.rect)).toEqual([
      [0, 0, 0.5, 0.5],
      [0.5, 0, 0.5, 0.5],
      [0, 0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5, 0.5],
    ]);
    const five = splitViewports(["a", "b", "c", "d", "e"]).map((def) => def.rect);
    expect(five[3]).toEqual([0, 0.5, 0.5, 0.5]);
    const area = five.reduce((sum, rect) => sum + rect[2] * rect[3], 0);
    expect(area).toBeCloseTo(1, 9);
  });
});

describe("resolveViewports", () => {
  test("auto follows the joined seats; an explicit layout shows only joined seats", () => {
    expect(resolveViewports(undefined, ["slot:0", "slot:1"])).toHaveLength(2);
    const layout = [
      { slot: "slot:0", rect: [0, 0, 0.7, 1] as const },
      { slot: "slot:1", rect: [0.7, 0, 0.3, 1] as const },
    ];
    expect(resolveViewports({ layout }, ["slot:0"])).toEqual([layout[0]!]);
  });
});

describe("viewportPixels", () => {
  test("flips to a bottom-left origin and shares edges without gaps", () => {
    const [top, bottom] = splitViewports(["a", "b"], "horizontal");
    expect(viewportPixels(top!.rect, 801, 601)).toEqual({ x: 0, y: 300, width: 801, height: 301 });
    expect(viewportPixels(bottom!.rect, 801, 601)).toEqual({ x: 0, y: 0, width: 801, height: 300 });
    const [left, right] = splitViewports(["a", "b"]);
    const l = viewportPixels(left!.rect, 801, 601);
    const r = viewportPixels(right!.rect, 801, 601);
    expect(l.x + l.width).toBe(r.x);
    expect(r.x + r.width).toBe(801);
  });
});
