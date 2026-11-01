import { describe, expect, test } from "bun:test";

import { isLibraryLicense } from "../library/libraryLicense";
import { sourceById } from "../sources";
import { FONT_LIBRARY, FONT_LICENSE, fontOf, libraryFontPairing } from "./fontLibrary";
import { HDRI_LIBRARY, HDRI_LICENSE, hdriEnvironment, hdriOf } from "./hdriLibrary";
import { creditsForLooks } from "./looksCredits";
import { LUT_GRADES, LUT_GRADE_LICENSE } from "./lutGrades";
import { MATERIAL_LIBRARY, libraryMaterialRoles } from "./materialLibrary";
import { lookServedPath } from "./curatedPull";

describe("curated looks", () => {
  test("every HDRI, grade and font resolves to a served file and an accepted licence", () => {
    expect(HDRI_LIBRARY.length).toBeGreaterThanOrEqual(8);
    expect(HDRI_LIBRARY.length).toBeLessThanOrEqual(16);
    for (const entry of HDRI_LIBRARY) {
      expect(isLibraryLicense(HDRI_LICENSE)).toBe(true);
      expect(entry.author.length).toBeGreaterThan(0);
      expect(lookServedPath("hdri", entry.id)).toBe(`hdri/library/${entry.id}/${entry.id}.hdr`);
      expect(hdriEnvironment(entry.id)).toEqual({ kind: "hdri", url: `/hdri/library/${entry.id}/${entry.id}.hdr` });
    }
    for (const grade of LUT_GRADES) {
      expect(isLibraryLicense(LUT_GRADE_LICENSE)).toBe(true);
      expect(lookServedPath("lut", grade.id)).toBe(`lut/${grade.id}/${grade.id}.cube`);
    }
    expect(FONT_LIBRARY.length).toBeGreaterThanOrEqual(12);
    expect(FONT_LIBRARY.length).toBeLessThanOrEqual(24);
    expect(FONT_LICENSE).toBe("OFL-1.1");
    for (const font of FONT_LIBRARY) expect(lookServedPath("font", font.id)).toBe(`fonts/${font.id}/${font.id}.woff2`);
  });

  test("the curated sets cover the requested conditions and moods", () => {
    const ids = HDRI_LIBRARY.map((entry) => entry.id);
    for (const id of ["clear-noon", "golden-hour", "overcast", "dusk", "night-city", "interior-industrial", "forest-shade", "snow"]) expect(ids).toContain(id);
    const moods = new Set(FONT_LIBRARY.flatMap((font) => font.moods));
    for (const mood of ["fantasy", "sci-fi", "industrial", "cozy", "sports", "military"]) expect(moods.has(mood)).toBe(true);
    expect(FONT_LIBRARY.filter((font) => font.role === "display").length).toBeGreaterThanOrEqual(6);
  });

  test("unknown ids and swapped roles throw", () => {
    expect(() => hdriOf("nope")).toThrow("unknown HDRI");
    expect(() => fontOf("nope")).toThrow("unknown font");
    // type-escape: roles are checked at runtime for callers that bypass the typed ids
    expect(() => libraryFontPairing("barlow" as never, "oswald" as never)).toThrow("body face");
    expect(libraryFontPairing("oswald", "barlow").display.family).toBe("Oswald");
  });

  test("credits carry author and licence for every kind", () => {
    const sections = creditsForLooks({ hdri: ["snow"], lut: ["sepia"], fonts: ["oswald", "barlow"] });
    expect(sections.map((section) => section.heading)).toEqual(["HDRI skies", "Colour grades", "Fonts"]);
    expect(sections[0]?.entries[0]).toMatchObject({ detail: "CC0-1.0", href: "https://polyhaven.com/a/snowy_park_01" });
    expect(sections[2]?.entries.every((entry) => entry.detail === "OFL-1.1")).toBe(true);
  });

  test("the material library holds 40+ CC0 ambientCG scans with colour, normal and roughness", () => {
    const scans = MATERIAL_LIBRARY.filter((entry) => entry.source !== undefined);
    expect(new Set(scans.map((entry) => entry.source)).size).toBeGreaterThanOrEqual(40);
    for (const entry of scans) {
      const source = sourceById.get(entry.source ?? "");
      expect(source?.license, entry.name).toBe("CC0-1.0");
      expect(source?.provider, entry.name).toBe("ambientcg");
      expect(libraryMaterialRoles(entry)).toEqual(expect.arrayContaining(["color", "normal", "roughness"]));
    }
    expect(scans.filter((entry) => libraryMaterialRoles(entry).includes("ao")).length).toBeGreaterThanOrEqual(30);
  });
});
