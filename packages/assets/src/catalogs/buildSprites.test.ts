import { describe, expect, test } from "bun:test";

import { buildSpriteCatalog } from "./buildSprites";

describe("buildSpriteCatalog", () => {
  test("resolves to null and lists no ids until a sprite pack has been pulled + reindexed", () => {
    const catalog = buildSpriteCatalog({ basePath: "/sprites" });
    expect(catalog.resolve("gameicons-icons/sword")).toBeNull();
    expect(catalog.ids()).toEqual([]);
  });

  test("never throws for an unknown source filter", () => {
    const catalog = buildSpriteCatalog({ basePath: "/sprites", sources: ["gameicons-icons"] });
    expect(catalog.has("gameicons-icons/sword")).toBe(false);
  });
});
