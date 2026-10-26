import { describe, expect, it } from "bun:test";
import {
  bakeMinimapBackground,
  bakeMinimapImage,
  encodeBakePng,
  minimapBakeToPngDataUri,
  type MinimapBakeSource,
} from "./minimapBake";

const flatBounds = { minX: -50, minZ: -50, maxX: 50, maxZ: 50 };

function ramp(): MinimapBakeSource {
  // Height ramps west→east so low/high colors both appear.
  return {
    bounds: flatBounds,
    sampleHeight: (x) => x,
  };
}

function pixelAt(bake: { width: number; height: number; pixels: Uint8ClampedArray }, px: number, py: number) {
  const i = (py * bake.width + px) * 4;
  return [bake.pixels[i], bake.pixels[i + 1], bake.pixels[i + 2], bake.pixels[i + 3]];
}

describe("bakeMinimapImage", () => {
  it("is deterministic for a fixed source", () => {
    const a = bakeMinimapImage(ramp(), { resolution: 32 });
    const b = bakeMinimapImage(ramp(), { resolution: 32 });
    expect(a.width).toBe(32);
    expect(a.height).toBe(32);
    expect(Array.from(a.pixels)).toEqual(Array.from(b.pixels));
  });

  it("maps low ground to the low color and high ground to the high color", () => {
    const bake = bakeMinimapImage(ramp(), { resolution: 32, palette: { low: "#000000", high: "#ffffff" } });
    const west = pixelAt(bake, 0, 16); // lowest height
    const east = pixelAt(bake, 31, 16); // highest height
    expect(east[0]!).toBeGreaterThan(west[0]!);
    expect(west[3]).toBe(255);
  });

  it("fills water below the water level", () => {
    const bake = bakeMinimapImage(
      { bounds: flatBounds, sampleHeight: () => -10, waterLevel: 0 },
      { resolution: 8, palette: { water: "#0000ff" } },
    );
    expect(pixelAt(bake, 4, 4)).toEqual([0, 0, 255, 255]);
  });

  it("tints ground inside a zone polygon", () => {
    const bake = bakeMinimapImage(
      {
        bounds: flatBounds,
        sampleHeight: () => 0,
        zones: [{ polygon: [[-50, -50], [0, -50], [0, 0], [-50, 0]], color: "#ff0000", alpha: 1 }],
      },
      { resolution: 32 },
    );
    // top-left quadrant is fully red; bottom-right is not.
    expect(pixelAt(bake, 4, 4)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(bake, 28, 28)[0]).not.toBe(255);
  });

  it("keeps world aspect for a non-square footprint", () => {
    const bake = bakeMinimapImage(
      { bounds: { minX: 0, minZ: 0, maxX: 200, maxZ: 100 }, sampleHeight: () => 0 },
      { resolution: 64 },
    );
    expect(bake.width).toBe(64);
    expect(bake.height).toBe(32);
  });
});

describe("PNG encoding", () => {
  it("emits a valid PNG signature and IHDR dimensions", () => {
    const bake = bakeMinimapImage(ramp(), { resolution: 16 });
    const png = encodeBakePng(bake);
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IHDR width/height are the two big-endian uint32s right after "IHDR" (bytes 16..24).
    const view = new DataView(png.buffer, png.byteOffset);
    expect(view.getUint32(16)).toBe(16);
    expect(view.getUint32(20)).toBe(16);
  });

  it("produces a data URI the Minimap background prop accepts", () => {
    const { background, mapBounds } = bakeMinimapBackground(ramp(), { resolution: 16 });
    expect(background.startsWith("data:image/png;base64,")).toBe(true);
    expect(background.length).toBeGreaterThan(100);
    expect(mapBounds).toEqual(flatBounds);
  });

  it("round-trips to the same data URI for the same bake (deterministic)", () => {
    const a = minimapBakeToPngDataUri(bakeMinimapImage(ramp(), { resolution: 24 }));
    const b = minimapBakeToPngDataUri(bakeMinimapImage(ramp(), { resolution: 24 }));
    expect(a).toBe(b);
  });
});
