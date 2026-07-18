import { describe, expect, test } from "bun:test";

import type { ParamSchema } from "../scene/sceneKinds";
import { createEditorSession, createEmptyEditorDocument, exportEditorDocumentJson } from "./index";
import { decodeEditorDocument } from "./document";
import { resolveCatalogDefinitions } from "./entityCatalog";
import type { EditorCatalogDefinition, EditorDocument } from "./types";

const SCHEMA: ParamSchema = {
  fields: [
    { key: "damage", type: "number", default: 5, min: 1, max: 100 },
    { key: "rate", type: "range", default: 1, min: 0, max: 10 },
  ],
};

describe("addCatalog / removeCatalog commands", () => {
  test("addCatalog creates a document catalog carrying schema + label", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({ type: "addCatalog", id: "towers", label: "Towers", schema: SCHEMA });
    const catalog = session.getState().document.catalogs.find((c) => c.id === "towers");
    expect(catalog).toBeDefined();
    expect(catalog?.label).toBe("Towers");
    expect(catalog?.schema).toEqual(SCHEMA);
    expect(catalog?.entries).toEqual([]);
  });

  test("addCatalog dedupes an existing id (no-op)", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({ type: "addCatalog", id: "towers", schema: SCHEMA });
    const before = session.getState();
    const after = session.dispatch({ type: "addCatalog", id: "towers", schema: SCHEMA });
    expect(after).toBe(before);
    expect(session.getState().document.catalogs).toHaveLength(1);
  });

  test("addCatalog rejects an empty/whitespace id (no-op)", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    const before = session.getState();
    const after = session.dispatch({ type: "addCatalog", id: "   ", schema: SCHEMA });
    expect(after).toBe(before);
    expect(session.getState().document.catalogs).toHaveLength(0);
  });

  test("removeCatalog on an absent id is a no-op", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    const before = session.getState();
    const after = session.dispatch({ type: "removeCatalog", id: "ghost" });
    expect(after).toBe(before);
  });
});

describe("setCatalogSchema reclamp", () => {
  const seeded = (): EditorDocument => {
    const doc = createEmptyEditorDocument();
    doc.catalogs = [
      { id: "towers", label: "Towers", schema: SCHEMA, entries: [{ id: "archer", meta: { damage: 50, rate: 3 } }] },
    ];
    return doc;
  };

  test("renaming a field drops the old value and defaults the new key", () => {
    const session = createEditorSession(seeded());
    const nextSchema: ParamSchema = {
      fields: [
        { key: "power", type: "number", default: 7, min: 1, max: 100 },
        { key: "rate", type: "range", default: 1, min: 0, max: 10 },
      ],
    };
    session.dispatch({ type: "setCatalogSchema", id: "towers", schema: nextSchema });
    const meta = session.getState().document.catalogs[0]?.entries[0]?.meta;
    expect(meta).toEqual({ power: 7, rate: 3 });
    expect(meta).not.toHaveProperty("damage");
  });

  test("removing a field drops its key from every row", () => {
    const session = createEditorSession(seeded());
    session.dispatch({ type: "setCatalogSchema", id: "towers", schema: { fields: [SCHEMA.fields[0]!] } });
    const meta = session.getState().document.catalogs[0]?.entries[0]?.meta;
    expect(meta).toEqual({ damage: 50 });
    expect(meta).not.toHaveProperty("rate");
  });

  test("tightening min/max clamps out-of-range row values", () => {
    const session = createEditorSession(seeded());
    const tighter: ParamSchema = {
      fields: [
        { key: "damage", type: "number", default: 5, min: 1, max: 20 },
        { key: "rate", type: "range", default: 1, min: 0, max: 2 },
      ],
    };
    session.dispatch({ type: "setCatalogSchema", id: "towers", schema: tighter });
    const meta = session.getState().document.catalogs[0]?.entries[0]?.meta;
    expect(meta).toEqual({ damage: 20, rate: 2 });
  });

  test("setCatalogSchema is one undoable step and restores prior schema + rows", () => {
    const session = createEditorSession(seeded());
    session.dispatch({ type: "setCatalogSchema", id: "towers", schema: { fields: [SCHEMA.fields[0]!] } });
    expect(session.canUndo()).toBe(true);
    session.dispatch({ type: "undo" });
    const catalog = session.getState().document.catalogs[0];
    expect(catalog?.schema).toEqual(SCHEMA);
    expect(catalog?.entries[0]?.meta).toEqual({ damage: 50, rate: 3 });
    expect(session.canUndo()).toBe(false);
  });

  test("setCatalogSchema on an absent catalog is a no-op", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    const before = session.getState();
    const after = session.dispatch({ type: "setCatalogSchema", id: "ghost", schema: SCHEMA });
    expect(after).toBe(before);
  });
});

describe("document round-trip with catalog schema", () => {
  test("catalogs[].schema and label survive encode → decode", () => {
    const doc: EditorDocument = createEmptyEditorDocument();
    doc.catalogs = [
      { id: "towers", label: "Towers", schema: SCHEMA, entries: [{ id: "archer", meta: { damage: 8, rate: 2 } }] },
    ];
    const decoded = decodeEditorDocument(JSON.parse(exportEditorDocumentJson(doc)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("expected decode success");
    const catalog = decoded.document.catalogs[0];
    expect(catalog?.label).toBe("Towers");
    expect(catalog?.schema).toEqual(SCHEMA);
  });

  test("a malformed schema is rejected with a diagnostic", () => {
    const raw = {
      markers: [],
      volumes: [],
      paths: [],
      annotations: [],
      catalogs: [{ id: "towers", schema: { fields: "nope" }, entries: [] }],
    };
    const decoded = decodeEditorDocument(raw);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error("expected decode failure");
    expect(decoded.errors.some((e) => e.path.includes("catalogs[0].schema"))).toBe(true);
  });

  test("a malformed field is dropped with a diagnostic but the schema survives", () => {
    const raw = {
      markers: [],
      volumes: [],
      paths: [],
      annotations: [],
      catalogs: [
        {
          id: "towers",
          schema: { fields: [{ key: "damage", type: "number", default: 5 }, { nope: true }] },
          entries: [],
        },
      ],
    };
    const decoded = decodeEditorDocument(raw);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error("expected decode failure");
    expect(decoded.errors.some((e) => e.path.includes("catalogs[0].schema.fields[1]"))).toBe(true);
  });
});

describe("resolveCatalogDefinitions", () => {
  const gameDefs: readonly EditorCatalogDefinition[] = [
    { id: "weapons", label: "Weapons", schema: SCHEMA, entries: [{ id: "bow" }] },
  ];

  test("a game definition wins on id collision", () => {
    const doc = createEmptyEditorDocument();
    doc.catalogs = [{ id: "weapons", label: "Doc Weapons", schema: { fields: [] }, entries: [] }];
    const merged = resolveCatalogDefinitions(doc, gameDefs);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.label).toBe("Weapons");
    expect(merged[0]?.schema).toBe(SCHEMA);
  });

  test("a document-only catalog with a schema is synthesized (label falls back to id)", () => {
    const doc = createEmptyEditorDocument();
    doc.catalogs = [{ id: "towers", schema: SCHEMA, entries: [{ id: "archer" }] }];
    const merged = resolveCatalogDefinitions(doc, gameDefs);
    expect(merged.map((d) => d.id).sort()).toEqual(["towers", "weapons"]);
    const towers = merged.find((d) => d.id === "towers");
    expect(towers?.label).toBe("towers");
    expect(towers?.entries).toHaveLength(1);
  });

  test("a document catalog with no schema is ignored", () => {
    const doc = createEmptyEditorDocument();
    doc.catalogs = [{ id: "loose", entries: [{ id: "x" }] }];
    const merged = resolveCatalogDefinitions(doc, gameDefs);
    expect(merged.map((d) => d.id)).toEqual(["weapons"]);
  });
});
