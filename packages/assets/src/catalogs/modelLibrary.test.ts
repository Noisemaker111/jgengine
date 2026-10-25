import { describe, expect, test } from "bun:test";

import jpeg from "jpeg-js";

import { downscaleJpeg } from "../modelLibraryPull";
import {
  MODEL_LIBRARY,
  MODEL_LIBRARY_GENRES,
  findLibraryModel,
  libraryModel,
  libraryModelCredits,
  libraryModelGap,
} from "./modelLibrary";

describe("model library", () => {
  test("every entry is named, credited, licensed and sourced from its official site", () => {
    const names = new Set<string>();
    for (const entry of MODEL_LIBRARY) {
      expect(entry.name).toMatch(/^[a-z-]+\/[a-z0-9-]+$/);
      expect(names.has(entry.name)).toBe(false);
      names.add(entry.name);
      expect(entry.author.length).toBeGreaterThan(0);
      expect(entry.intents.length).toBeGreaterThan(0);
      expect(entry.genres.length).toBeGreaterThan(0);
      if (entry.origin.provider === "polyhaven") {
        expect(entry.license).toBe("CC0-1.0");
        expect(entry.homepage).toBe(`https://polyhaven.com/a/${entry.origin.asset}`);
        expect(entry.origin.far).toBeLessThanOrEqual(entry.origin.near);
      }
    }
  });

  test("every genre the library is curated for has models", () => {
    for (const genre of MODEL_LIBRARY_GENRES) {
      expect(MODEL_LIBRARY.some((entry) => entry.genres.includes(genre))).toBe(true);
    }
  });

  test("a plain-words request finds the right model first", () => {
    expect(findLibraryModel("streetlight")[0]!.entry.name).toBe("city/street-lamp");
    expect(findLibraryModel("fire hydrant")[0]!.entry.name).toBe("city/fire-hydrant");
    expect(findLibraryModel("office desk")[0]!.entry.name).toBe("office/desk");
    expect(findLibraryModel("crate", { genre: "tower-defense" }).every((m) => m.entry.genres.includes("tower-defense"))).toBe(true);
    expect(findLibraryModel("")).toEqual([]);
  });

  test("requests the library cannot answer realistically name their gap", () => {
    expect(findLibraryModel("sedan")).toEqual([]);
    expect(libraryModelGap("sedan")?.route).toContain("CarConcept");
    expect(libraryModelGap("server rack")?.route).toContain("generated");
    expect(libraryModelGap("street lamp")).toBeNull();
  });

  test("libraryModel draws the pulled near and far levels at real size", () => {
    const model = libraryModel("city/street-lamp");
    expect(model.url).toBe("/models/library/city/street-lamp/near.gltf");
    expect(model.anchor).toBe("origin");
    expect(model.targetHeight).toBeUndefined();
    expect(model.variants?.levels.map((level) => level.url)).toEqual([
      "/models/library/city/street-lamp/near.gltf",
      "/models/library/city/street-lamp/far.gltf",
    ]);
    expect(libraryModel("park/bench", { basePath: "/m", targetHeight: 1 }).url).toBe("/m/library/park/bench/near.gltf");
    expect(() => libraryModel("city/nope")).toThrow("Unknown library model");
  });

  test("credits carry title, author, license and page", () => {
    expect(libraryModelCredits(["city/street-lamp"])[0]).toBe(
      "Cast-iron street lamp by Josh Dean (CC0-1.0) https://polyhaven.com/a/street_lamp_01",
    );
  });

  test("textures are halved until they fit the budget", () => {
    const width = 64;
    const data = new Uint8Array(width * width * 4).fill(200);
    const source = new Uint8Array(jpeg.encode({ data, width, height: width }, 90).data);
    const small = jpeg.decode(downscaleJpeg(source, 16), { useTArray: true });
    expect([small.width, small.height]).toEqual([16, 16]);
    expect(downscaleJpeg(source, 64)).toBe(source);
  });
});
