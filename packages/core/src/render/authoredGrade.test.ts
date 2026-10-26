import { describe, expect, it } from "bun:test";
import type { DocumentColorGrade } from "@jgengine/core/editor/environment";
import type { LutCube } from "@jgengine/core/render/postProcessing";
import { withAuthoredGrade } from "./authoredGrade";

function cube(seed: number): LutCube {
  const size = 2;
  const data = new Uint8Array(size * size * size * 3).fill(seed);
  return { size, data };
}

const look = {
  postProcessing: {
    toneMapping: "agx" as const,
    exposure: 1.2,
    bloom: { strength: 0.3 },
    grade: { saturation: 1.1, vignette: 0.2 },
  },
};

describe("withAuthoredGrade", () => {
  it("returns the game's look untouched when the document authored no grade", () => {
    expect(withAuthoredGrade(look, undefined)).toBe(look);
  });

  it("applies the authored LUT over the game's grade while keeping its other knobs", () => {
    const authored: DocumentColorGrade = { lut: cube(9) };
    const merged = withAuthoredGrade(look, authored);
    expect(merged.postProcessing?.grade).toEqual({ saturation: 1.1, vignette: 0.2, lut: { cube: authored.lut } });
    expect(merged.postProcessing?.toneMapping).toBe("agx");
    expect(merged.postProcessing?.bloom).toEqual({ strength: 0.3 });
  });

  it("turns a disabled grade stage on when the document authored a LUT", () => {
    const merged = withAuthoredGrade({ postProcessing: { toneMapping: "agx", grade: false } }, { lut: cube(3) });
    expect(merged.postProcessing?.grade).toEqual({ lut: { cube: cube(3) } });
  });

  it("mounts a post chain for a game that had none, so the authored grade applies", () => {
    const merged = withAuthoredGrade({}, { lut: cube(4), autoExposure: { max: 3 } });
    expect(merged.postProcessing?.toneMapping).toBe("agx");
    expect(merged.postProcessing?.grade).toEqual({ lut: { cube: cube(4) } });
    expect(merged.postProcessing?.autoExposure).toEqual({ max: 3 });
  });

  it("carries the authored exposure range and turns adaptation on where the game pinned it off", () => {
    const pinned = withAuthoredGrade({ postProcessing: { autoExposure: false } }, { autoExposure: { min: 0.7, max: 3 } });
    expect(pinned.postProcessing?.autoExposure).toEqual({ min: 0.7, max: 3 });
    const tuned = withAuthoredGrade({ postProcessing: { autoExposure: { min: 0.6, max: 2 } } }, { autoExposure: { max: 4 } });
    expect(tuned.postProcessing?.autoExposure).toEqual({ min: 0.6, max: 4 });
  });

  it("keeps an exposure-only grade from enabling the grade stage", () => {
    const merged = withAuthoredGrade({ postProcessing: { grade: false, toneMapping: "agx" } }, { autoExposure: { max: 3.2 } });
    expect(merged.postProcessing?.grade).toBe(false);
    expect(merged.postProcessing?.autoExposure).toEqual({ max: 3.2 });
  });
});
