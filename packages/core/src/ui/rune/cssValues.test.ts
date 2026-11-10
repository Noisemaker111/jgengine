import { expect, test } from "bun:test";
import { parseDim, parseFilters, parseGradient, parseGradientMasks, parseLinearFade, parseRoundCutout, percentCap, placeLayer } from "./cssValues";

test("CSS filters keep alpha shadows and brightness/blur order", () => {
  expect(parseFilters("brightness(50%) drop-shadow(rgb(255, 64, 32) 9px 5px 3px) blur(2px) brightness(2)"))
    .toEqual([{ kind: 0, n: 0.5 }, { kind: 2, sh: [9,5,3,0xff4020ff] }, { kind: 1, n: 2 }, { kind: 0, n: 2 }]);
  expect(parseFilters("contrast(2)")).toBeNull();
});

test("diagonal and radial masks retain alpha and independent sized composite layers", () => {
  expect(parseGradient("radial-gradient(at 35% 55%, #000, transparent 75%)")).toMatchObject({ g: 1, cx: .35, cy: .55, rf: "corner" });
  const masks = parseGradientMasks("linear-gradient(110deg, #000, transparent), radial-gradient(ellipse at 35% 55%, #fff, transparent 75%)", "50% 100%, 100% 100%", "100% 0%,0% 0%", "no-repeat", "alpha", "intersect");
  expect(masks).toHaveLength(2);
  expect(masks?.[0]).toMatchObject({ g: 1, cx: .35, cy: .55 });
  expect(masks?.[1]).toMatchObject({ g: 0, st: [[0, 0xffffffff], [1, 0xffffff00]], bs: [0,.5,0,1], bp: [0,1,0,0], blend: 7 });
  const luminance = parseGradientMasks("linear-gradient(#000,#fff)", "auto", "0% 0%", "repeat", "luminance", "add");
  expect(luminance?.[0]).toMatchObject({ st: [[0,0xffffff00],[1,0xffffffff]] });
});

test("repeating conic gradients preserve the angular period and hard edges", () => {
  const gradient = parseGradient("repeating-conic-gradient(from 15deg at 25% 75%, #f00 0deg 30deg, #00f 30deg 60deg)");
  if (gradient === null || "flat" in gradient) throw new Error("expected a conic gradient");
  expect(gradient.g).toBe(2);
  expect(gradient.cx).toBe(0.25);
  expect(gradient.cy).toBe(0.75);
  expect(gradient.st.filter(([at]) => Math.abs(at - 1 / 12) < 1e-8).map(([, color]) => color)).toEqual([0xff0000ff, 0x0000ffff]);
  expect(gradient.st.at(-1)?.[0]).toBeGreaterThanOrEqual(1);
});

test("credits masks preserve point, percentage and reversed linear edge fades", () => {
  expect(parseLinearFade("linear-gradient(180deg, transparent 0, #000 16px, #000 calc(100% - 22px), transparent 100%)")).toEqual([0, 0, 16, 0, 0, 0, 22, 0]);
  expect(parseLinearFade("linear-gradient(transparent 0%, rgb(0, 0, 0) 9%, rgb(0, 0, 0) 91%, transparent 100%)")).toEqual([0, 0, 0, 0.09, 0, 0, 0, 1 - 0.91]);
  expect(parseLinearFade("linear-gradient(to left, transparent, #000)")).toEqual([0, 0, 0, 0, 0, 1, 0, 0]);
  expect(parseLinearFade("linear-gradient(180deg, #000 0, #000 calc(100% - 26px), transparent 100%)")).toEqual([0, 0, 0, 0, 0, 0, 26, 0]);
  for (const unsupported of ["linear-gradient(105deg, #000, transparent)", "linear-gradient(#000 0%, #000 36%, rgba(0, 0, 0, 0.22) 52%, rgba(0, 0, 0, 0.22) 100%)", "radial-gradient(black, transparent)"]) expect(parseLinearFade(unsupported)).toBeNull();
});

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

test("sized radial masks put independent ticket notches on both edges", () => {
  expect(parseRoundCutout("radial-gradient(8px at 0px 50%, rgba(0, 0, 0, 0) 97%, rgb(0, 0, 0) 100%)", "51% 100%", "0% 50%")).toEqual([0, 0, 0, 0.5, 7.76, 8]);
  expect(parseRoundCutout("radial-gradient(circle 8px at 100% 50%, rgba(0, 0, 0, 0) 97%, rgb(0, 0, 0) 100%)", "51% 100%", "100% 50%")).toEqual([0, 1, 0, 0.5, 7.76, 8]);
  expect(parseRoundCutout("radial-gradient(circle, rgb(0, 0, 0), transparent)", "auto", "0% 0%")).toBeNull();
});

test("paper dots and grid lines preserve point stops and their repeating tile", () => {
  for (const value of ["radial-gradient(rgba(255, 255, 255, 0.35) 0.7px, rgba(0, 0, 0, 0) 0px)", "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, rgba(0, 0, 0, 0) 0px)"]) {
    const gradient = parseGradient(value);
    if (gradient === null || "flat" in gradient) throw new Error("expected a gradient");
    expect(gradient.ps).toBe(true);
    const tiled = placeLayer(gradient, "8px 8px", "0% 0%", "repeat");
    expect(tiled).toHaveProperty("bs", [8, 0, 8, 0]);
    expect(tiled).toHaveProperty("rp", [true, true]);
    expect(tiled).not.toHaveProperty("flat");
    expect(gradient.st[0]?.[0]).toBe(gradient.st[1]?.[0]);
  }
});

test("capped percentages keep normal intrinsic sizing when the parent has no definite width", () => {
  expect(percentCap(parseDim("min(360px, 100%)"))).toEqual({ size: "100%", max: 360 });
  const other = percentCap(parseDim("min(55%, 580px)"));
  expect(other?.max).toBe(580);
  expect(parseFloat(other?.size ?? "")).toBeCloseTo(55);
  expect(percentCap(parseDim("min(360px, calc(100% - 20px))"))).toBeNull();
});
