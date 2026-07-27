import { describe, expect, test } from "bun:test";

import type { AssetSource, SingleAsset } from "./manifest";
import { verifyData, verifyManifest } from "./verify";

const okSource: AssetSource = {
  id: "quaternius-stylized-nature",
  provider: "quaternius",
  title: "Stylized Nature MegaKit",
  license: "CC0-1.0",
  author: "Quaternius",
  categories: ["nature"],
  download: { scrape: "https://quaternius.com/packs/stylizednaturemegakit.html" },
};

/** One index entry from {@link okSource} — a model pack with none has never been pulled. */
const okIndex = [
  { id: "tree_01", source: okSource.id, categories: ["nature"], file: "tree_01.glb" },
];

describe("verifyData", () => {
  test("passes clean data", () => {
    const result = verifyData({ sources: [okSource], singles: [], aliases: [], index: okIndex });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("fails a source missing its license", () => {
    const bad: AssetSource = { ...okSource, license: "  " };
    const result = verifyData({ sources: [bad], singles: [], aliases: [], index: [] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("missing license"))).toBe(true);
  });

  test("fails a single missing its author", () => {
    const single: SingleAsset = {
      id: "single/x",
      url: "https://cdn/x.glb",
      license: "CC0-1.0",
      author: "",
      categories: ["prop"],
    };
    const result = verifyData({ sources: [], singles: [single], aliases: [], index: [] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("missing author"))).toBe(true);
  });

  test("fails an alias pointing at a missing index id", () => {
    const result = verifyData({
      sources: [],
      singles: [],
      aliases: [{ key: "nature/ghost", target: "quaternius-stylized-nature/does_not_exist" }],
      index: [
        { id: "quaternius-stylized-nature/real", source: "quaternius-stylized-nature", categories: ["nature"], file: "real.glb" },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("not found"))).toBe(true);
  });

  test("the shipped manifest verifies clean", () => {
    expect(verifyManifest().ok).toBe(true);
  });
});

describe("never-pulled model packs", () => {
  test("fails a model pack that contributes no index entries", () => {
    // The shape that let a Street Pack sit in the catalogue titled "Downtown City MegaKit":
    // nothing had ever pulled it, so nothing had ever checked the pin.
    const result = verifyData({ sources: [okSource], singles: [], aliases: [], index: [] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("contributes no index entries"))).toBe(true);
  });

  test("passes one that records why in `unpulled`", () => {
    const source: AssetSource = { ...okSource, unpulled: "page JS-gates the download" };
    const result = verifyData({ sources: [source], singles: [], aliases: [], index: [] });
    expect(result.ok).toBe(true);
  });

  test("holds only model packs to it — materials and sprites pull on demand", () => {
    const material: AssetSource = { ...okSource, id: "ambientcg-rock001", provider: "ambientcg", kind: "material" };
    const result = verifyData({ sources: [material], singles: [], aliases: [], index: [] });
    expect(result.ok).toBe(true);
  });
});
