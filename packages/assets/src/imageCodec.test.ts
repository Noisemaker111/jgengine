import { describe, expect, test } from "bun:test";

import { decodePng, decodeTgaForGltf, encodeJpeg, encodePng, fitRgba, gitBlobSha, hasAlpha, type RgbaImage } from "./imageCodec";

/** A 1x2 true-colour TGA: stored bottom row first (red), then the top row (blue). */
function tga(imageType: number, body: number[], descriptor = 0): Uint8Array {
  return new Uint8Array([0, 0, imageType, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 24, descriptor, ...body]);
}

describe("image codecs", () => {
  test("gitBlobSha matches Git's id for an empty file", () => {
    expect(gitBlobSha(new Uint8Array())).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  });

  test("a bottom-up TGA keeps its stored order, so the first row is the picture's bottom", () => {
    const image = decodeTgaForGltf(tga(2, [0, 0, 255, 255, 0, 0]));
    expect([...image.data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...image.data.subarray(4, 8)]).toEqual([0, 0, 255, 255]);
  });

  test("a top-down TGA is flipped to bottom-row-first, and run-length packets decode", () => {
    const flipped = decodeTgaForGltf(tga(2, [0, 0, 255, 255, 0, 0], 0x20));
    expect([...flipped.data.subarray(0, 4)]).toEqual([0, 0, 255, 255]);
    const rle = decodeTgaForGltf(tga(10, [0x81, 0, 255, 0]));
    expect([...rle.data]).toEqual([0, 255, 0, 255, 0, 255, 0, 255]);
  });

  test("PNG round-trips RGBA, fitRgba halves to the limit and hasAlpha sees transparency", () => {
    const data = new Uint8Array(4 * 4 * 4).map((_, i) => (i % 4 === 3 ? (i < 32 ? 0 : 255) : i));
    const image: RgbaImage = { width: 4, height: 4, data };
    const back = decodePng(encodePng(image));
    expect(back.width).toBe(4);
    expect([...back.data]).toEqual([...data]);
    expect(hasAlpha(image)).toBe(true);
    expect(hasAlpha({ width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) })).toBe(false);
    const small = fitRgba(image, 2);
    expect([small.width, small.height]).toEqual([2, 2]);
    expect([...encodeJpeg(small).subarray(0, 2)]).toEqual([0xff, 0xd8]);
  });
});
