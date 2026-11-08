import { describe, expect, test } from "bun:test";

import { readGrassLook } from "@jgengine/core/grass/grassKind";
import { GRASS_SPECIES } from "@jgengine/core/grass/grassSpecies";
import { GRASS_REALISM_DEFAULT, GRASS_STYLE_CURVES, GRASS_STYLE_DEFAULTS, GRASS_STYLE_SCHEMA, resolveGrassStyle } from "@jgengine/core/grass/grassStyle";
import { environment, grass } from "@jgengine/core/world/features";

describe("grass style", () => {
  test("a scene that sets nothing draws at realism 0.5 with the pre-style normal lift", () => {
    expect(GRASS_STYLE_DEFAULTS).toEqual({ realism: 0.5, normalLift: 0.6, detail: 0.5, exaggeration: 0.5, shading: 0.5, colourSteps: 0, saturation: 0.5, contrast: 0.5, outline: 0 });
    expect(readGrassLook({}).style).toEqual(GRASS_STYLE_DEFAULTS);
  });

  test("every curve stays in 0..1 across realism, and realism moves it", () => {
    for (const curve of Object.values(GRASS_STYLE_CURVES)) {
      for (let r = 0; r <= 1; r += 0.05) {
        expect(curve(r)).toBeGreaterThanOrEqual(0);
        expect(curve(r)).toBeLessThanOrEqual(1);
      }
      expect(curve(0)).not.toBe(curve(1));
    }
  });

  test("realism comes from the patch, else the world, else the default", () => {
    expect(resolveGrassStyle(undefined, undefined, undefined).realism).toBe(GRASS_REALISM_DEFAULT);
    expect(resolveGrassStyle(undefined, { realism: 1 }, undefined).realism).toBe(1);
    expect(resolveGrassStyle({ realism: 0 }, { realism: 1 }, undefined).realism).toBe(0);
  });

  test("a slider set by hand wins over realism; the patch wins over the world", () => {
    expect(resolveGrassStyle(undefined, { realism: 1 }, undefined).normalLift).toBeCloseTo(0.35, 10);
    expect(resolveGrassStyle(undefined, { realism: 1, normalLift: 0.9 }, undefined).normalLift).toBe(0.9);
    expect(resolveGrassStyle({ normalLift: 0.2 }, { realism: 1, normalLift: 0.9 }, undefined).normalLift).toBe(0.2);
  });

  test("a species' tuning holds at the default realism and rides the curve away from it", () => {
    const green = GRASS_SPECIES.find((species) => species.id === "green")!;
    expect(readGrassLook({ species: "green" }).style.normalLift).toBe(0.85);
    expect(readGrassLook({ species: "green" }, { realism: 1 }).style.normalLift).toBeCloseTo(0.6, 10);
    expect(readGrassLook({ species: "green" }, { realism: 0 }).style.normalLift).toBe(1);
    expect(readGrassLook({ species: "green", style: { normalLift: 0.1 } }).style.normalLift).toBe(0.1);
    expect("style" in green && green.style).toEqual({ normalLift: 0.85 });
  });

  test("a named preset backs the sliders it sets", () => {
    expect(resolveGrassStyle(undefined, { preset: "cartoon" }, undefined)).toEqual({ realism: 0, normalLift: 0.85, detail: 0, exaggeration: 1, shading: 0, colourSteps: 1, saturation: 0.65, contrast: 0.75, outline: 0.6 });
    expect(resolveGrassStyle({ preset: "realistic" }, { preset: "cartoon" }, undefined).realism).toBe(1);
    expect(GRASS_STYLE_SCHEMA.presets?.map((preset) => preset.id)).toEqual(["cartoon", "painterly", "animated", "realistic"]);
  });

  test("junk style input is ignored, not thrown", () => {
    expect(resolveGrassStyle("cartoon", [1, 2], undefined)).toEqual(GRASS_STYLE_DEFAULTS);
    expect(resolveGrassStyle({ realism: 7 }, undefined, undefined).realism).toBe(1);
  });

  test("environment({ grassStyle }) redraws its grass bands in the world style; a band's own style wins", () => {
    const world = environment({ grassStyle: { realism: 1 }, vegetation: [grass({ species: "meadow" }), grass({ species: "meadow", style: { realism: 0 } })] });
    expect(world.vegetation?.map((band) => band.look.style.realism)).toEqual([1, 0]);
    expect(environment({ vegetation: grass({ species: "meadow" }) }).vegetation?.[0]?.look.style).toEqual(GRASS_STYLE_DEFAULTS);
  });
});
