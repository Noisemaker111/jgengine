import { describe, expect, test } from "bun:test";

import type { EditorCatalogDefinition } from "@jgengine/core/editor/index";
import type { ParamSchema } from "@jgengine/core/scene/sceneKinds";

import { createEditorHost } from "./session";

const WEAPON_SCHEMA: ParamSchema = {
  fields: [
    { key: "damage", type: "number", default: 10, min: 1, max: 100, step: 1 },
    { key: "rate", type: "range", default: 1, min: 0.1, max: 5, step: 0.1 },
  ],
};

const CATALOGS: readonly EditorCatalogDefinition[] = [
  {
    id: "weapons",
    label: "Weapons",
    schema: WEAPON_SCHEMA,
    entries: [
      { id: "bow", label: "Bow", meta: { damage: 8, rate: 2 } },
      { id: "cannon", label: "Cannon", meta: { damage: 26, rate: 0.7 } },
    ],
  },
];

describe("catalog RPC tools", () => {
  const host = () =>
    createEditorHost({
      gameId: "test",
      layers: {},
      catalogs: CATALOGS,
    });

  test("list_catalogs returns game-exported definitions with seeded entries", () => {
    const { api, dispose } = host();
    const result = api.handle({ method: "list_catalogs" });
    expect(result.ok).toBe(true);
    const catalogs = (result.result as { catalogs: { id: string; label: string; entryCount: number }[] }).catalogs;
    expect(catalogs).toHaveLength(1);
    expect(catalogs[0]).toMatchObject({ id: "weapons", label: "Weapons", entryCount: 2 });
    dispose();
  });

  test("get_catalog_entry returns schema + meta for a seeded entry", () => {
    const { api, dispose } = host();
    const result = api.handle({ method: "get_catalog_entry", catalogId: "weapons", entryId: "bow" });
    expect(result.ok).toBe(true);
    const body = result.result as {
      catalogId: string;
      schema: ParamSchema;
      entry: { id: string; meta?: Record<string, unknown> };
    };
    expect(body.catalogId).toBe("weapons");
    expect(body.entry.meta).toEqual({ damage: 8, rate: 2 });
    expect(body.schema.fields.map((field) => field.key)).toEqual(["damage", "rate"]);
    dispose();
  });

  test("set_catalog_entry merge-patches meta and persists on the document", () => {
    const { api, dispose } = host();
    const result = api.handle({
      method: "set_catalog_entry",
      catalogId: "weapons",
      entryId: "bow",
      patch: { damage: 12 },
    });
    expect(result.ok).toBe(true);
    const got = api.handle({ method: "get_catalog_entry", catalogId: "weapons", entryId: "bow" });
    const entry = (got.result as { entry: { meta: Record<string, unknown> } }).entry;
    expect(entry.meta).toEqual({ damage: 12, rate: 2 });
    const layers = api.handle({ method: "list_layers" });
    const catalogs = (layers.result as { document: { catalogs: { id: string; entries: { id: string; meta?: Record<string, unknown> }[] }[] } })
      .document.catalogs;
    const weapons = catalogs.find((catalog) => catalog.id === "weapons");
    expect(weapons?.entries.find((entry) => entry.id === "bow")?.meta).toEqual({ damage: 12, rate: 2 });
    dispose();
  });

  test("set_catalog_entry validates against the catalog schema", () => {
    const { api, dispose } = host();
    const bad = api.handle({
      method: "set_catalog_entry",
      catalogId: "weapons",
      entryId: "bow",
      patch: { damage: 999 },
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("damage");
    dispose();
  });

  test("set_catalog_entry coalesces consecutive same-key patches into one undo step", () => {
    const { api, session, dispose } = host();
    expect(
      api.handle({ method: "set_catalog_entry", catalogId: "weapons", entryId: "bow", patch: { damage: 11 } }).ok,
    ).toBe(true);
    expect(
      api.handle({ method: "set_catalog_entry", catalogId: "weapons", entryId: "bow", patch: { damage: 14 } }).ok,
    ).toBe(true);
    expect(session.canUndo()).toBe(true);
    api.handle({ method: "undo" });
    const got = api.handle({ method: "get_catalog_entry", catalogId: "weapons", entryId: "bow" });
    const entry = (got.result as { entry: { meta: Record<string, unknown> } }).entry;
    expect(entry.meta).toEqual({ damage: 8, rate: 2 });
    expect(session.canUndo()).toBe(false);
    dispose();
  });

  test("export_document includes catalogs for round-trip persistence", () => {
    const { api, dispose } = host();
    api.handle({ method: "set_catalog_entry", catalogId: "weapons", entryId: "cannon", patch: { rate: 1.1 } });
    const exported = api.handle({ method: "export_document" });
    expect(exported.ok).toBe(true);
    const json = (exported.result as { json: string }).json;
    const parsed = JSON.parse(json) as { catalogs: { id: string; entries: { id: string; meta?: Record<string, unknown> }[] }[] };
    expect(parsed.catalogs[0]?.entries.find((entry) => entry.id === "cannon")?.meta?.rate).toBe(1.1);
    dispose();
  });
});
