import { describe, expect, test } from "bun:test";

import { decodeGameCatalogs, loadGameCatalogs } from "./loadGameCatalogs";

describe("decodeGameCatalogs", () => {
  test("undefined export decodes to an empty list", () => {
    const decoded = decodeGameCatalogs(undefined);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("expected decode success");
    expect(decoded.catalogs).toEqual([]);
  });

  test("valid catalogs pass through typed", () => {
    const decoded = decodeGameCatalogs([
      {
        id: "weapons",
        label: "Weapons",
        schema: { fields: [{ key: "damage", type: "number", default: 1 }] },
        entries: [{ id: "bow", label: "Bow", meta: { damage: 8 } }],
      },
    ]);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("expected decode success");
    expect(decoded.catalogs).toHaveLength(1);
    expect(decoded.catalogs[0]?.id).toBe("weapons");
    expect(decoded.catalogs[0]?.entries[0]?.meta).toEqual({ damage: 8 });
  });

  test("malformed catalogs are rejected with a path-specific diagnostic", () => {
    const decoded = decodeGameCatalogs([{ label: "Weapons" }]);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error("expected decode failure");
    const paths = decoded.errors.map((error) => error.path);
    expect(paths).toContain("$[0].id");
  });
});

describe("loadGameCatalogs", () => {
  test("a game with no editorCatalogs.ts loads an empty list", async () => {
    const loaded = await loadGameCatalogs("__no-such-game__");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error("expected load success");
    expect(loaded.catalogs).toEqual([]);
  });

  test("tower-guard editorCatalogs export decodes with tower schema entries", async () => {
    const loaded = await loadGameCatalogs("tower-guard");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error(`expected load success: ${loaded.errors.map((e) => e.message).join("; ")}`);
    expect(loaded.catalogs.some((catalog) => catalog.id === "towers")).toBe(true);
    const towers = loaded.catalogs.find((catalog) => catalog.id === "towers")!;
    expect(towers.entries.length).toBeGreaterThan(0);
    expect(towers.schema.fields.some((field) => field.key === "damage")).toBe(true);
  });
});
