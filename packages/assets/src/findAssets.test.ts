import { describe, expect, test } from "bun:test";

import { CONFIDENT_SCORE, findAssets, type FindAssetsContext } from "./findAssets";

const nothingOnDisk: FindAssetsContext = { has: () => false, gameFiles: [] };

describe("findAssets", () => {
  test("a library request answers with the library model, its licence and the URL libraryModel draws", () => {
    const result = findAssets("street lamp", nothingOnDisk);
    const top = result.matches[0]!;
    expect(top).toMatchObject({ kind: "library", id: "city/street-lamp", score: 100, license: "CC0-1.0", url: "/models/library/city/street-lamp/near.gltf", pull: "model:city/street-lamp", onDisk: false });
    // A tree whose intents only share "street" stays below a confident answer.
    expect(result.matches.find((match) => match.id === "nature/jacaranda")?.score ?? 0).toBeLessThan(CONFIDENT_SCORE);
    expect(result.elsewhere).toEqual([]);
  });

  test("a pack model carries the pack's licence, the URL under /models/<pack>/ and whether that file is on disk", () => {
    const seen: string[] = [];
    const result = findAssets("knight", { has: (rel) => (seen.push(rel), rel === "models/kaykit-adventurers/Knight.glb"), gameFiles: [] });
    expect(result.matches[0]).toMatchObject({ kind: "model", id: "kaykit-adventurers/Knight", license: "CC0-1.0", url: "/models/kaykit-adventurers/Knight.glb", pull: "kaykit-adventurers", onDisk: true });
    expect(seen).toContain("models/kaykit-adventurers/Knight.glb");
  });

  test("a model another game ships is found by name; a game's copy of a catalog file is offered as the catalog model", () => {
    const ctx: FindAssetsContext = {
      has: () => false,
      game: "mine",
      gameFiles: [
        { game: "other", rel: "models/imported/creatures/velociraptor.glb" },
        { game: "other", rel: "models/imported/quaternius-stylized-nature/Pine_1.glb" },
      ],
    };
    const raptor = findAssets("velociraptor", ctx).matches[0]!;
    expect(raptor).toMatchObject({ kind: "game-file", id: "other:models/imported/creatures/velociraptor.glb", from: "other", url: "/models/imported/creatures/velociraptor.glb", license: null, onDisk: false });
    const pine = findAssets("Pine_1", ctx).matches;
    expect(pine.some((match) => match.kind === "game-file")).toBe(false);
    expect(pine[0]).toMatchObject({ kind: "model", id: "quaternius-stylized-nature/Pine_1" });
  });

  test("the game's own copy counts as on disk", () => {
    const result = findAssets("velociraptor", { has: () => false, game: "mine", gameFiles: [{ game: "other", rel: "models/imported/a/velociraptor.glb" }, { game: "mine", rel: "models/imported/a/velociraptor.glb" }] });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ id: "mine:models/imported/a/velociraptor.glb", onDisk: true });
  });

  test("a request nothing here covers names the free sources to search, with the search filled in", () => {
    const result = findAssets("dinosaur", nothingOnDisk);
    expect(result.matches).toEqual([]);
    expect(result.elsewhere.map((source) => source.url)).toEqual(["https://poly.pizza/search/dinosaur", "https://polyhaven.com/models?s=dinosaur"]);
  });

  test("a known library gap comes back with its reason and route", () => {
    const result = findAssets("palm tree", nothingOnDisk);
    expect(result.gap?.route).toContain("generated");
    expect(result.elsewhere.length).toBeGreaterThan(0);
  });

  test("limit caps the matches per request", () => {
    expect(findAssets("tree", { ...nothingOnDisk, limit: 2 }).matches).toHaveLength(2);
  });
});
