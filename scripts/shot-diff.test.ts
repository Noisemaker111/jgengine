import { expect, test } from "bun:test";

import { diffImages } from "./shot-diff";

const image = (width: number, height: number, fill: (x: number, y: number) => [number, number, number]) => {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.set([...fill(x, y), 255], (y * width + x) * 4);
  return { width, height, data };
};

test("identical images are identical", () => {
  const a = image(4, 4, () => [10, 20, 30]);
  expect(diffImages(a, a)).toEqual({ meanAbs: 0, maxAbs: 0, over2: 0, over8: 0, psnr: Infinity, pixels: 16 });
});

test("one pixel off by 40 levels in red counts once, and the heat map marks it", () => {
  const a = image(4, 4, () => [100, 100, 100]);
  const b = image(4, 4, (x, y) => (x === 1 && y === 2 ? [140, 100, 100] : [100, 100, 100]));
  const heat = new Uint8Array(4 * 4 * 4);
  const d = diffImages(a, b, [], heat);
  expect(d.maxAbs).toBe(40);
  expect(d.over8).toBeCloseTo(1 / 16, 5);
  expect(d.meanAbs).toBeCloseTo(40 / 48, 3);
  expect([...heat.slice((2 * 4 + 1) * 4, (2 * 4 + 1) * 4 + 3)]).toEqual([176, 0, 0]);
});

test("an ignored rectangle leaves its pixels out", () => {
  const a = image(4, 4, () => [0, 0, 0]);
  const b = image(4, 4, (x) => (x < 2 ? [255, 255, 255] : [0, 0, 0]));
  expect(diffImages(a, b, [[0, 0, 2, 4]])).toMatchObject({ maxAbs: 0, pixels: 8 });
});

test("images of different sizes are refused", () => {
  expect(() => diffImages(image(2, 2, () => [0, 0, 0]), image(2, 3, () => [0, 0, 0]))).toThrow("differ in size");
});
