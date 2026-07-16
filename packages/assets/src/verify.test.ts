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

describe("verifyData", () => {
  test("passes clean data", () => {
    const result = verifyData({ sources: [okSource], singles: [], aliases: [], index: [] });
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
