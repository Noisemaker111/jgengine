import { expect, test } from "bun:test";
import { parseGradient } from "./cssValues";

test("Tailwind's computed Oklab gradient keeps its direction, stops and alpha", () => {
  const gradient = parseGradient("linear-gradient(in oklab, rgb(43, 74, 68) 0%, rgb(29, 53, 49) 50%, rgb(12, 22, 20) 100%)");
  expect(gradient).not.toBeNull();
  if (gradient === null || "flat" in gradient) throw new Error("expected a gradient");
  expect(gradient.a).toBe(Math.PI);
  expect(gradient.st[0]).toEqual([0, 0x2b4a44ff]);
  expect(gradient.st.at(-1)).toEqual([1, 0x0c1614ff]);
  expect(gradient.st).toContainEqual([0.5, 0x1d3531ff]);
  const transparent = parseGradient("linear-gradient(to right in oklab, rgb(255, 0, 0), rgba(0, 0, 255, 0))");
  if (transparent === null || "flat" in transparent) throw new Error("expected a gradient");
  expect(transparent.a).toBe(Math.PI / 2);
  const middle = transparent.st.find(([at]) => at === 0.5)?.[1];
  expect(middle).toBe(0xff000080);
});

test("gradient hard stops remain ordered and unsupported colour spaces report a gap", () => {
  const gradient = parseGradient("linear-gradient(90deg in oklab, rgb(255, 0, 0) 50%, rgb(0, 0, 255) 50%)");
  if (gradient === null || "flat" in gradient) throw new Error("expected a gradient");
  expect(gradient.st).toEqual([[0.5, 0xff0000ff], [0.5, 0x0000ffff]]);
  expect(parseGradient("linear-gradient(in unsupported, rgb(0, 0, 0), rgb(255, 255, 255))")).toBeNull();
});
