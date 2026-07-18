import { describe, expect, test } from "bun:test";

import { createEmptyEditorDocument } from "./document";
import { ENTITY_CATALOG_ID, entityDefinitionSchema, entityEntryFromCatalog } from "./entityCatalog";
import type { EditorCatalogDefinition } from "./types";

const DEFINITIONS: readonly EditorCatalogDefinition[] = [
  {
    id: ENTITY_CATALOG_ID,
    label: "Entities",
    schema: entityDefinitionSchema,
    entries: [{ id: "grunt", label: "Grunt", meta: { role: "enemy", maxHealth: 20, walkSpeed: 2.5, scale: 1 } }],
  },
];

describe("entityEntryFromCatalog", () => {
  test("returns null for an id no catalog defines", () => {
    expect(entityEntryFromCatalog(createEmptyEditorDocument(), "ghost", DEFINITIONS)).toBeNull();
    expect(entityEntryFromCatalog(createEmptyEditorDocument(), "grunt")).toBeNull();
  });

  test("maps a definition default row onto the runtime entity contract", () => {
    const entry = entityEntryFromCatalog(createEmptyEditorDocument(), "grunt", DEFINITIONS);
    expect(entry).not.toBeNull();
    expect(entry?.role).toBe("enemy");
    expect(entry?.stats?.health).toEqual({ max: 20, min: 0 });
    expect(entry?.receive?.damage?.order).toEqual(["health"]);
    expect(entry?.movement?.walkSpeed).toBe(2.5);
    // Scale is only emitted when authored away from 1 (keeps the entry lean for default figures).
    expect(entry?.scale).toBeUndefined();
  });

  test("document-authored values override the game-exported defaults", () => {
    const document = createEmptyEditorDocument();
    document.catalogs = [
      { id: ENTITY_CATALOG_ID, entries: [{ id: "grunt", meta: { maxHealth: 99, walkSpeed: 7, scale: 2 } }] },
    ];
    const entry = entityEntryFromCatalog(document, "grunt", DEFINITIONS);
    expect(entry?.stats?.health?.max).toBe(99);
    expect(entry?.movement?.walkSpeed).toBe(7);
    expect(entry?.scale).toBe(2);
    // Unset fields fall back to the definition default (role stays "enemy").
    expect(entry?.role).toBe("enemy");
  });

  test("clamps out-of-range authored values to the schema", () => {
    const document = createEmptyEditorDocument();
    document.catalogs = [{ id: ENTITY_CATALOG_ID, entries: [{ id: "grunt", meta: { walkSpeed: 999 } }] }];
    const entry = entityEntryFromCatalog(document, "grunt", DEFINITIONS);
    expect(entry?.movement?.walkSpeed).toBe(20);
  });

  test("resolves a document-only row with no game definitions", () => {
    const document = createEmptyEditorDocument();
    document.catalogs = [
      { id: ENTITY_CATALOG_ID, entries: [{ id: "wraith", meta: { role: "hostile", maxHealth: 12, walkSpeed: 4 } }] },
    ];
    const entry = entityEntryFromCatalog(document, "wraith");
    expect(entry?.role).toBe("hostile");
    expect(entry?.stats?.health?.max).toBe(12);
  });

  test("prefers a document-carried entities schema over the default entityDefinitionSchema", () => {
    const document = createEmptyEditorDocument();
    // A document schema that widens walkSpeed's ceiling from the default (max 20) to 999.
    document.catalogs = [
      {
        id: ENTITY_CATALOG_ID,
        schema: {
          fields: [
            { key: "role", type: "select", default: "enemy", options: [{ value: "enemy" }, { value: "hostile" }] },
            { key: "maxHealth", type: "number", default: 20, min: 1, max: 100000 },
            { key: "walkSpeed", type: "range", default: 3, min: 0, max: 999 },
            { key: "scale", type: "range", default: 1, min: 0.1, max: 10 },
          ],
        },
        entries: [{ id: "sprinter", meta: { role: "hostile", maxHealth: 30, walkSpeed: 120, scale: 1 } }],
      },
    ];
    const entry = entityEntryFromCatalog(document, "sprinter");
    // Under the default schema this would clamp to 20; the document schema keeps it.
    expect(entry?.movement?.walkSpeed).toBe(120);
    expect(entry?.role).toBe("hostile");
  });
});
