import { describe, expect, it } from "bun:test";
import { createEmptyEditorDocument, decodeEditorDocument, exportEditorDocumentJson } from "./document";
import { colorGradeFromDocument, lutCubeFromGrading } from "./environment";
import type { EditorDocument } from "./types";

function docWithGrading(grading: NonNullable<NonNullable<EditorDocument["environment"]>["grading"]>): EditorDocument {
  return { ...createEmptyEditorDocument(), environment: { grading } };
}

function entryAt(cube: ReturnType<typeof lutCubeFromGrading>, red: number, green: number, blue: number): [number, number, number] {
  const levels = cube.size - 1;
  const r = Math.round(red * levels);
  const g = Math.round(green * levels);
  const b = Math.round(blue * levels);
  const offset = (b * cube.size * cube.size + g * cube.size + r) * 3;
  return [cube.data[offset]! / 255, cube.data[offset + 1]! / 255, cube.data[offset + 2]! / 255];
}

describe("lutCubeFromGrading", () => {
  it("bakes a neutral grade to an identity cube", () => {
    const cube = lutCubeFromGrading({ size: 4 });
    let error = 0;
    for (let blue = 0; blue < 4; blue += 1) {
      for (let green = 0; green < 4; green += 1) {
        for (let red = 0; red < 4; red += 1) {
          const got = entryAt(cube, red / 3, green / 3, blue / 3);
          error += Math.abs(got[0] - red / 3) + Math.abs(got[1] - green / 3) + Math.abs(got[2] - blue / 3);
        }
      }
    }
    expect(error).toBeLessThan(0.1);
  });

  it("cools shadows toward the authored swatch while leaving highlights warm", () => {
    const cube = lutCubeFromGrading({ size: 8, shadows: "#001030", highlights: "#ffffff", midtones: "#ffffff", tint: 1 });
    const shadow = entryAt(cube, 0.15, 0.15, 0.15);
    expect(shadow[2]).toBeGreaterThan(shadow[0]);
    expect(shadow[2]).toBeGreaterThan(0.15);
    const highlight = entryAt(cube, 1, 1, 1);
    expect(highlight[0]).toBeGreaterThan(0.95);
    expect(highlight[1]).toBeGreaterThan(0.95);
  });

  it("tints midtones where lighter and darker bands leave off", () => {
    // A midtone swatch must move a grey midtone toward it; the band weights partition the frame, so
    // no band may be starved by the one before it.
    const grey = entryAt(lutCubeFromGrading({ size: 9, midtones: "#000000", tint: 1 }), 0.5, 0.5, 0.5);
    expect(grey[0]).toBeLessThan(0.3);
    const warm = entryAt(lutCubeFromGrading({ size: 9, midtones: "#ff0000", tint: 1 }), 0.5, 0.5, 0.5);
    expect(warm[0]).toBeGreaterThan(warm[2]);
    // A pure black input stays black: a swatch scales to the pixel's brightness rather than painting it.
    const black = entryAt(lutCubeFromGrading({ size: 9, shadows: "#3050ff", tint: 1 }), 0, 0, 0);
    expect(black).toEqual([0, 0, 0]);
  });

  it("applies saturation and contrast and honours the requested cube size", () => {
    const grey = entryAt(lutCubeFromGrading({ size: 9, tint: 0 }), 0.5, 0.5, 0.5);
    expect(grey[0]).toBeCloseTo(0.5, 1);
    const saturated = entryAt(lutCubeFromGrading({ size: 9, saturation: 0, tint: 0 }), 1, 0, 0);
    expect(saturated[0]).toBeCloseTo(saturated[1], 2);
    const contrasted = entryAt(lutCubeFromGrading({ size: 9, contrast: 1.5, tint: 0 }), 0.2, 0.2, 0.2);
    expect(contrasted[0]).toBeLessThan(0.2);
    expect(lutCubeFromGrading({ size: 64 }).size).toBe(16);
    expect(lutCubeFromGrading({ size: 1 }).size).toBe(2);
  });
});

describe("colorGradeFromDocument", () => {
  it("returns nothing for a document with no authored grade", () => {
    expect(colorGradeFromDocument(createEmptyEditorDocument())).toBeUndefined();
    expect(colorGradeFromDocument(docWithGrading({ tint: 0 }))).toBeUndefined();
  });

  it("bakes the authored LUT and carries the authored exposure range", () => {
    const grade = colorGradeFromDocument(docWithGrading({ shadows: "#122a44", tint: 0.6, autoExposure: { min: 0.6, max: 3 } }));
    expect(grade?.lut?.size).toBe(8);
    expect(grade?.autoExposure).toEqual({ min: 0.6, max: 3 });
  });

  it("keeps an exposure-only grade so a neutral look still clamps", () => {
    const grade = colorGradeFromDocument(docWithGrading({ autoExposure: { max: 3.5 } }));
    expect(grade?.lut).toBeUndefined();
    expect(grade?.autoExposure).toEqual({ max: 3.5 });
  });
});

describe("grading in the scene document", () => {
  it("round-trips through export and decode without sharing mutable state", () => {
    const doc = docWithGrading({ shadows: "#122a44", tint: 0.6, autoExposure: { min: 0.6, max: 3 } });
    const decoded = decodeEditorDocument(JSON.parse(exportEditorDocumentJson(doc)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.document.environment?.grading).toEqual({ shadows: "#122a44", tint: 0.6, autoExposure: { min: 0.6, max: 3 } });
    decoded.document.environment!.grading!.autoExposure!.max = 9;
    expect(doc.environment?.grading?.autoExposure?.max).toBe(3);
  });

  it("rejects a swatch that is not a colour and a cube size outside the bakeable range", () => {
    const bad = decodeEditorDocument({ ...createEmptyEditorDocument(), environment: { grading: { shadows: "blue-ish", size: 40 } } });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    const paths = bad.errors.map((diagnostic) => diagnostic.path);
    expect(paths).toContain("$.environment.grading.shadows");
    expect(paths).toContain("$.environment.grading.size");
  });
});
