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
    const soldier = content.entityById!("soldier");
    expect(soldier?.stats?.health?.max).toBeGreaterThan(0);
    expect(soldier?.receive?.damage?.order).toContain("health");
  });

  test("units move and buildings do not", () => {
    expect(content.entityById!("soldier")?.movement?.walkSpeed).toBeGreaterThan(0);
    expect(content.entityById!("keep_player")?.movement).toBeUndefined();
  });

  test("decor resolves to an inert mesh with no health", () => {
    const mine = content.entityById!("crumbs");
    expect(mine).not.toBeNull();
    expect(mine?.stats).toBeUndefined();
  });

  test("unknown ids resolve to null", () => {
    expect(content.entityById!("dragon")).toBeNull();
  });
});
