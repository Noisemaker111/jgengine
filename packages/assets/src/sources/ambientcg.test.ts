import { describe, expect, test } from "bun:test";

import { AMBIENTCG_PINNED_ASSET_IDS } from "./ambientcg";

describe("ambientCG pinned facades", () => {
  test("the lettered brick facade variants keep their exact upstream ids", () => {
    expect(AMBIENTCG_PINNED_ASSET_IDS.get("ambientcg-facade018a")).toBe("Facade018A");
    expect(AMBIENTCG_PINNED_ASSET_IDS.get("ambientcg-facade019a")).toBe("Facade019A");
    expect(AMBIENTCG_PINNED_ASSET_IDS.get("ambientcg-facade020a")).toBe("Facade020A");
  });
});
