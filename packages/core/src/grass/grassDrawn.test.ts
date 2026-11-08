import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import * as THREE from "three";

import { grassCoverGrain, grassCoverMapFragment } from "@jgengine/core/grass/GrassCover.draw";
import { resolveGrassBake } from "@jgengine/core/grass/grassBake.draw";
import { drawnGrassLook, grassMownAmount } from "@jgengine/core/grass/grassDrawn";
import { createGrassTuftTemplate } from "@jgengine/core/grass/grassField";
import { grassBladeDensity, readGrassLook } from "@jgengine/core/grass/grassKind";
import { grassStyleShape } from "@jgengine/core/grass/grassMaterial.draw";
import { GRASS_SPECIES } from "@jgengine/core/grass/grassSpecies";
import { grassDetailScale, grassRealismFromPage, resolveGrassStyle } from "@jgengine/core/grass/grassStyle";

/** Ground a look's blades cover, the quantity `grassBladeDensity` holds: count x mean width x (0.3 + mean height). */
function cover(look: ReturnType<typeof readGrassLook>): number {
  const width = look.blade.bladeWidth * (1 - look.blade.widthVariation * 0.3);
  const height = look.blade.bladeHeight * (1 - look.blade.heightVariation * 0.3);
  return grassBladeDensity(look) * width * (0.3 + Math.min(height, 1.2));
}

describe("drawn grass", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  test("at the default style every species draws exactly as it grows", () => {
    for (const species of GRASS_SPECIES) {
      const look = readGrassLook({ species: species.id });
      expect(drawnGrassLook(look)).toBe(look);
      expect(grassStyleShape(look).toArray()).toEqual([0, 0, 1, 0]);
    }
  });

  test("detail trades blade count for width: six times the blades at 1, half at 0, the same cover", () => {
    expect(grassDetailScale(0.5)).toBe(1);
    expect(grassDetailScale(1)).toBeCloseTo(6, 10);
    expect(grassDetailScale(0)).toBeCloseTo(1 / 2, 10);
    for (const id of ["lawn", "meadow", "tallgrass-prairie", "green"]) {
      const look = readGrassLook({ species: id });
      for (const detail of [0, 0.25, 0.75, 1]) {
        const drawn = drawnGrassLook(readGrassLook({ species: id, style: { detail } }));
        expect(grassBladeDensity(drawn) / grassBladeDensity(look)).toBeCloseTo(grassDetailScale(detail), 6);
        expect(cover(drawn)).toBeCloseTo(cover(look), 6);
      }
    }
  });

  test("a bunchgrass keeps its clumps across detail and fills them; a sward spreads its blades over more tufts too", () => {
    const tuftsPerM2 = (look: ReturnType<typeof readGrassLook>) => grassBladeDensity(look) / look.tuft.tuftBlades;
    const tussock = readGrassLook({ species: "snow-tussock" });
    for (const detail of [0, 1]) {
      const drawn = drawnGrassLook(readGrassLook({ species: "snow-tussock", style: { detail } }));
      // Within the rounding of a whole blade count, the tussock field has the same clumps at every detail.
      expect(tuftsPerM2(drawn) / tuftsPerM2(tussock)).toBeGreaterThan(0.95);
      expect(tuftsPerM2(drawn) / tuftsPerM2(tussock)).toBeLessThan(1.25);
    }
    const lawn = readGrassLook({ species: "lawn" });
    const fine = drawnGrassLook(readGrassLook({ species: "lawn", style: { detail: 1 } }));
    expect(tuftsPerM2(fine) / tuftsPerM2(lawn)).toBeGreaterThan(1.8);
    expect(fine.tuft.tuftBlades).toBeGreaterThan(lawn.tuft.tuftBlades);
  });

  test("flowers per square metre hold across detail, and far heads widen only as the default would", () => {
    for (const id of ["poppy-field", "wildflower-meadow", "tallgrass-prairie"]) {
      const perM2 = (look: ReturnType<typeof readGrassLook>) => (grassBladeDensity(look) / look.tuft.tuftBlades) * look.flowers.flowerShare;
      const today = readGrassLook({ species: id });
      for (const detail of [0.2, 0.8, 1]) expect(perM2(drawnGrassLook(readGrassLook({ species: id, style: { detail } })))).toBeCloseTo(perM2(today), 6);
    }
    expect(grassStyleShape(readGrassLook({ species: "meadow" }, { realism: 1 })).z).toBeCloseTo(6, 10);
  });

  test("cover holds across the whole realism range for every species", () => {
    for (const species of GRASS_SPECIES) {
      const look = readGrassLook({ species: species.id });
      for (const realism of [0, 0.3, 1]) expect(cover(drawnGrassLook(readGrassLook({ species: species.id }, { realism })))).toBeCloseTo(cover(look), 6);
    }
  });

  test("realism 1 bakes more, thinner blades in fuller tufts; realism 0 fewer, wider ones", () => {
    const area = [40, 40] as const;
    const today = resolveGrassBake({ look: readGrassLook({ species: "lawn" }), area });
    const real = resolveGrassBake({ look: readGrassLook({ species: "lawn" }, { realism: 1 }), area });
    const toon = resolveGrassBake({ look: readGrassLook({ species: "lawn" }, { realism: 0 }), area });
    expect(real.bladesPerM2 / today.bladesPerM2).toBeCloseTo(6, 6);
    expect(real.look.tuft.tuftBlades).toBeGreaterThan(today.look.tuft.tuftBlades);
    expect(real.look.blade.bladeWidth).toBeCloseTo(today.look.blade.bladeWidth / 6, 10);
    expect(toon.look.blade.bladeWidth).toBeCloseTo(today.look.blade.bladeWidth * 2, 10);
    expect(toon.look.tuft.tuftBlades).toBeLessThan(today.look.tuft.tuftBlades);
  });

  test("exaggeration evens and curls blades at the cartoon end and roughens unmown ones at the natural end", () => {
    const meadow = readGrassLook({ species: "meadow" });
    const toon = drawnGrassLook(readGrassLook({ species: "meadow", style: { exaggeration: 1 } }));
    expect(toon.blade.heightVariation).toBe(0);
    expect(toon.blade.curvature).toBeGreaterThan(meadow.blade.curvature);
    const natural = drawnGrassLook(readGrassLook({ species: "meadow", style: { exaggeration: 0 } }));
    expect(natural.blade.heightVariation).toBeGreaterThan(meadow.blade.heightVariation);
    // A mown lawn's tips are cut level, so the natural end keeps its heights even.
    const lawn = readGrassLook({ species: "lawn" });
    expect(grassMownAmount(lawn)).toBeGreaterThan(0.9);
    expect(grassMownAmount(meadow)).toBe(0);
    expect(drawnGrassLook(readGrassLook({ species: "lawn", style: { exaggeration: 0 } })).blade.heightVariation).toBeCloseTo(lawn.blade.heightVariation, 2);
  });

  test("the shader tears mown tips at the natural end and rounds every tip at the cartoon end", () => {
    expect(grassStyleShape(readGrassLook({ species: "lawn" }, { realism: 1 })).x).toBeGreaterThan(0.9);
    expect(grassStyleShape(readGrassLook({ species: "meadow" }, { realism: 1 })).x).toBe(0);
    expect(grassStyleShape(readGrassLook({ species: "meadow" }, { realism: 0 })).y).toBe(1);
    expect(grassStyleShape(readGrassLook({ species: "lawn" }, { realism: 0 })).x).toBe(0);
  });

  test("the natural end lays blades every way; the default tuft is untouched by it", () => {
    const inputs = (realism?: number) => {
      const look = drawnGrassLook(readGrassLook({ species: "meadow" }, realism === undefined ? undefined : { realism, detail: 0.5 }));
      return createGrassTuftTemplate({ look, seed: "t", segments: 4, bladesPerM2: grassBladeDensity(look) });
    };
    const today = inputs();
    const real = inputs(1);
    // Same blade count (detail pinned), different lean and heading per blade.
    expect(real.bladeBend.length).toBe(today.bladeBend.length);
    expect(Array.from(real.bladeBend)).not.toEqual(Array.from(today.bladeBend));
  });

  test("default tufts are byte for byte the tufts drawn before detail and shape existed", () => {
    // sha1 prefixes of each default template's buffers, taken from the phase 1 (pre-detail) code.
    const before: Record<string, string> = { meadow: "4569e39b88f56f56", lawn: "f1661b6e66048cb0", "tallgrass-prairie": "9ffe7559648f9782", green: "080061fbcccebdcc", papyrus: "35a3caefed13f073", "snow-tussock": "14ea5747e56df360" };
    for (const [id, hash] of Object.entries(before)) {
      const look = readGrassLook({ species: id });
      const t = createGrassTuftTemplate({ look, seed: "tuft-hash", segments: 4, bladesPerM2: grassBladeDensity(look) });
      const sha = createHash("sha1");
      for (const array of [t.position, t.uv, t.bladeOffset, t.bladeVary, t.bladeBend, t.index]) sha.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
      expect(`${id} ${sha.digest("hex").slice(0, 16)}`).toBe(`${id} ${hash}`);
    }
  });

  test("a page's ?realism= overrides every patch and world realism; hand-set sliders still win", () => {
    expect(grassRealismFromPage()).toBeUndefined();
    (globalThis as { window?: unknown }).window = {
      location: { href: "http://x/?realism=1", search: "?realism=1" },
      history: { state: null, replaceState: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    expect(grassRealismFromPage()).toBe(1);
    expect(resolveGrassStyle({ realism: 0 }, { realism: 0.2 }, undefined).realism).toBe(1);
    expect(resolveGrassStyle({ detail: 0.1 }, undefined, undefined).detail).toBe(0.1);
    expect(readGrassLook({ species: "lawn" }).style.detail).toBe(1);
  });

  test("the turf grain follows detail: flat at 0, as generated at 0.5, finer and stronger at 1", () => {
    expect(grassCoverGrain(0.5)).toEqual({ strength: 1, scale: 1 });
    expect(grassCoverGrain(0)).toEqual({ strength: 0, scale: 1 });
    expect(grassCoverGrain(1)).toEqual({ strength: 1.6, scale: 2 });
    const chunk = grassCoverMapFragment(THREE.ShaderChunk.map_fragment);
    expect(chunk).toContain("texture2D( map, vMapUv * uGrainScale )");
    expect(chunk).toContain("mix( vec3( uGrainMean ), sampledDiffuseColor.rgb, uGrain )");
    expect(() => grassCoverMapFragment("diffuseColor = vec4(1.0);")).toThrow("map_fragment changed");
  });
});
