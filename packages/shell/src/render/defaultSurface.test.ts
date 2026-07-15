import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { detailMaps } from "./defaultSurface";

describe("detailMaps", () => {
  test("builds tiling normal + roughness DataTextures with no DOM", () => {
    const maps = detailMaps();
    expect(maps.normal).toBeInstanceOf(THREE.DataTexture);
    expect(maps.roughness).toBeInstanceOf(THREE.DataTexture);
    expect(maps.normal.wrapS).toBe(THREE.RepeatWrapping);
    expect(maps.normal.wrapT).toBe(THREE.RepeatWrapping);
    expect(maps.normal.image.width).toBeGreaterThan(0);
    expect(maps.normal.image.data.length).toBe(maps.normal.image.width * maps.normal.image.height * 4);
  });

  test("caches the same instances across calls", () => {
    expect(detailMaps().normal).toBe(detailMaps().normal);
  });

  test("normal map encodes a mostly-upward tangent-space surface (blue dominant)", () => {
    const data = detailMaps().normal.image.data as Uint8Array;
    let blueDominant = 0;
    const pixels = data.length / 4;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 2] >= data[index] && data[index + 2] >= data[index + 1]) blueDominant += 1;
    }
    expect(blueDominant / pixels).toBeGreaterThan(0.9);
  });
});
