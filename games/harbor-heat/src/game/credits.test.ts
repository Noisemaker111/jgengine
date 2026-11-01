import { describe, expect, test } from "bun:test";

import { ASSET_SOURCE_IDS } from "./assets";
import { HARBOR_PACK_CREDITS, tribuneAds } from "./credits";

describe("harbor-heat credits", () => {
  test("credit one entry per shipped pack, Quaternius and ambientCG included", () => {
    const packs = HARBOR_PACK_CREDITS.sections.flatMap((section) => section.entries);
    expect(packs).toHaveLength(ASSET_SOURCE_IDS.length);
    const text = tribuneAds().map((ad) => `${ad.title} ${ad.who}`).join("\n");
    expect(text).toMatch(/Quaternius/);
    expect(text).toMatch(/ambientCG/);
    expect(text).toMatch(/CC0/);
    expect(text).toMatch(/Small Harbour Sunset/);
    expect(text).toMatch(/Neon sunset/);
    expect(text).toMatch(/Bangers/);
    expect(text).toMatch(/Barlow/);
  });
});
