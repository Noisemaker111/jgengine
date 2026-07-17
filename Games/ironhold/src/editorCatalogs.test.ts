import { describe, expect, test } from "bun:test";
import { ENTITY_CATALOG_ID } from "@jgengine/core/editor/index";

import { editorCatalogs } from "./editorCatalogs";
import { content } from "./game/content";

describe("editorCatalogs", () => {
  test("surfaces the roster so the Data tab is never empty", () => {
    const roster = editorCatalogs.find((catalog) => catalog.id === ENTITY_CATALOG_ID);
    expect(roster).toBeDefined();
    expect(roster?.entries.length ?? 0).toBeGreaterThan(0);
  });
});

describe("content.entityById", () => {
  test("combatants carry a health pool that accepts damage", () => {
    const footman = content.entityById!("footman");
    expect(footman?.stats?.health?.max).toBeGreaterThan(0);
    expect(footman?.receive?.damage?.order).toContain("health");
  });

  test("units move and buildings do not", () => {
    expect(content.entityById!("footman")?.movement?.walkSpeed).toBeGreaterThan(0);
    expect(content.entityById!("keep_player")?.movement).toBeUndefined();
  });

  test("decor resolves to an inert mesh with no health", () => {
    const mine = content.entityById!("goldmine");
    expect(mine).not.toBeNull();
    expect(mine?.stats).toBeUndefined();
  });

  test("unknown ids resolve to null", () => {
    expect(content.entityById!("dragon")).toBeNull();
  });
});
