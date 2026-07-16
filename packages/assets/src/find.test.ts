import { describe, expect, test } from "bun:test";

import { findAssets, rankAssets } from "./find";

describe("findAssets", () => {
  test("surfaces a model pack by name", () => {
    const packs = findAssets("nature", { kind: "pack" });
    expect(packs.every((entry) => entry.kind === "pack")).toBe(true);
    expect(packs.some((entry) => entry.kind === "pack" && entry.source === "quaternius-stylized-nature")).toBe(
      true,
    );
  });

  test("finds a HUD component by name", () => {
    const match = findAssets("vital-bar").find((entry) => entry.kind === "component");
    expect(match).toBeDefined();
    if (match?.kind === "component") expect(match.name).toBe("vital-bar");
  });

  test("finds a mana component through its description", () => {
    const names = findAssets("mana")
      .filter((entry) => entry.kind === "component")
      .map((entry) => (entry.kind === "component" ? entry.name : ""));
    expect(names.length).toBeGreaterThan(0);
    expect(names.some((name) => name === "vital-bar" || name === "resource-orb")).toBe(true);
  });

  test("matches a multi-word query where every token lands in one field", () => {
    const names = findAssets("mana bar")
      .filter((entry) => entry.kind === "component")
      .map((entry) => (entry.kind === "component" ? entry.name : ""));
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain("vital-bar");
  });

  test("finds an icon glyph exactly", () => {
    const top = findAssets("sword")[0];
    expect(top?.kind).toBe("icon");
    if (top?.kind === "icon") expect(top.name).toBe("sword");
  });

  test("matches a whole pack by provider", () => {
    const packs = findAssets("medieval", { kind: "pack" });
    expect(packs.every((entry) => entry.kind === "pack")).toBe(true);
    expect(packs.some((entry) => entry.kind === "pack" && entry.source === "quaternius-medieval-village")).toBe(
      true,
    );
  });

  test("matches the game-icons.net sprite pack by name", () => {
    const packs = findAssets("game icons", { kind: "spritePack" });
    expect(packs.every((entry) => entry.kind === "spritePack")).toBe(true);
    expect(
      packs.some((entry) => entry.kind === "spritePack" && entry.source === "gameicons-icons"),
    ).toBe(true);
  });

  test("returns nothing for gibberish", () => {
    expect(findAssets("zzqx-not-a-thing")).toHaveLength(0);
  });
});

describe("rankAssets", () => {
  test("an exact match scores above a substring match", () => {
    const ranked = rankAssets("sword");
    expect(ranked[0]?.score).toBe(100);
    expect(ranked[0]?.match.kind).toBe("icon");
  });

  test("--kind narrows the result set", () => {
    const ranked = rankAssets("bar", { kind: "component" });
    expect(ranked.every((entry) => entry.match.kind === "component")).toBe(true);
  });
});
