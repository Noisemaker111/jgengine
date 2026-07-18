import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { expect, test } from "bun:test";

import {
  importPromotedAsset,
  isPromotedProject,
  upsertCatalogExtra,
  type PromotedExtra,
} from "./promotedAssetCatalog";

const BASE_SOURCE = `import { buildCatalog } from "@jgengine/assets/catalogs/build";

export const assets = buildCatalog({
  basePath: "/models",
  sources: ["quaternius-stylized-nature"],
});
`;

/** Creates a promoted-project workspace with a typed \`src/game/assets.ts\` catalog. */
function promotedWorkspace(source: string = BASE_SOURCE): string {
  const dir = mkdtempSync(join(tmpdir(), "jg-promoted-"));
  mkdirSync(join(dir, "src", "game"), { recursive: true });
  writeFileSync(join(dir, "src", "game", "assets.ts"), source);
  return dir;
}

function assetsSource(dir: string): string {
  return readFileSync(join(dir, "src", "game", "assets.ts"), "utf8");
}

function countExtras(source: string): number {
  const m = /\bextras\s*:\s*\[/.exec(source);
  if (!m) return 0;
  return (source.slice(m.index).match(/\bid\s*:/g) ?? []).length;
}

test("isPromotedProject detects a typed src/game/assets.ts", () => {
  const dir = promotedWorkspace();
  expect(isPromotedProject(dir)).toBe(true);
  const bare = mkdtempSync(join(tmpdir(), "jg-bare-"));
  expect(isPromotedProject(bare)).toBe(false);
});

test("importPromotedAsset writes bytes, returns the shipped url, and adds a durable extra", () => {
  const dir = promotedWorkspace();
  const bytes = new TextEncoder().encode("glb-bytes");

  const imported = importPromotedAsset(dir, "Spaceship.glb", bytes);
  expect(imported).toEqual({
    id: "spaceship",
    url: "/models/imported/Spaceship.glb",
    label: "Spaceship.glb",
  });
  // Bytes copied under public/, byte-for-byte, at the shipped path.
  expect(readFileSync(join(dir, "public", "models", "imported", "Spaceship.glb"))).toEqual(
    Buffer.from(bytes),
  );
  // Source gained an extras entry carrying the id and url.
  const src = assetsSource(dir);
  expect(src).toContain('id: "spaceship"');
  expect(src).toContain('url: "/models/imported/Spaceship.glb"');

  // Round-trip: the emitted entry, fed to buildCatalog, resolves the id to the same url.
  const catalog = buildCatalog({ extras: [imported as PromotedExtra] });
  expect(catalog.resolve(imported.id)?.url).toBe(imported.url);
});

test("importPromotedAsset is idempotent: same filename twice collapses to one entry, byte-identical", () => {
  const dir = promotedWorkspace();
  const bytes = new TextEncoder().encode("glb");

  importPromotedAsset(dir, "Ship.glb", bytes);
  const afterFirst = assetsSource(dir);
  importPromotedAsset(dir, "Ship.glb", bytes);
  const afterSecond = assetsSource(dir);

  expect(afterSecond).toBe(afterFirst);
  expect(countExtras(afterSecond)).toBe(1);
});

test("upsertCatalogExtra applied twice with the same entry is byte-identical", () => {
  const once = upsertCatalogExtra(BASE_SOURCE, { id: "ship", url: "/models/imported/Ship.glb", label: "Ship.glb" });
  const twice = upsertCatalogExtra(once, { id: "ship", url: "/models/imported/Ship.glb", label: "Ship.glb" });
  expect(twice).toBe(once);
});

test("upsertCatalogExtra replaces an entry sharing an id (last url wins, one entry)", () => {
  const first = upsertCatalogExtra(BASE_SOURCE, { id: "ship", url: "/models/imported/A.glb", label: "A.glb" });
  const second = upsertCatalogExtra(first, { id: "ship", url: "/models/imported/B.glb", label: "B.glb" });
  expect(countExtras(second)).toBe(1);
  expect(second).toContain('url: "/models/imported/B.glb"');
  expect(second).not.toContain('url: "/models/imported/A.glb"');
});

test("upsertCatalogExtra appends distinct ids in order", () => {
  const first = upsertCatalogExtra(BASE_SOURCE, { id: "a", url: "/models/imported/A.glb", label: "A.glb" });
  const second = upsertCatalogExtra(first, { id: "b", url: "/models/imported/B.glb", label: "B.glb" });
  expect(countExtras(second)).toBe(2);
  expect(second.indexOf('id: "a"')).toBeLessThan(second.indexOf('id: "b"'));
});

test("upsertCatalogExtra creates an extras array when absent and appends when present", () => {
  // Absent → created right after the opening brace, before basePath.
  const created = upsertCatalogExtra(BASE_SOURCE, { id: "a", url: "/models/imported/A.glb", label: "A.glb" });
  expect(created).toContain("extras:");
  expect(created.indexOf("extras:")).toBeLessThan(created.indexOf("basePath:"));
  expect(countExtras(created)).toBe(1);

  // Present → appends without disturbing the first entry.
  const appended = upsertCatalogExtra(created, { id: "b", url: "/models/imported/B.glb", label: "B.glb" });
  expect(countExtras(appended)).toBe(2);
});

test("upsertCatalogExtra rewrites a pre-existing extras literal", () => {
  const withExtras = `import { buildCatalog } from "@jgengine/assets/catalogs/build";

export const assets = buildCatalog({
  extras: [
    { id: "old", url: "/models/imported/Old.glb", label: "Old.glb" },
  ],
  basePath: "/models",
});
`;
  const out = upsertCatalogExtra(withExtras, { id: "new", url: "/models/imported/New.glb", label: "New.glb" });
  expect(countExtras(out)).toBe(2);
  expect(out).toContain('id: "old"');
  expect(out).toContain('id: "new"');
});

test("upsertCatalogExtra throws when the source has no single buildCatalog call (route falls back)", () => {
  const none = `export const assets = createAssetCatalog();\n`;
  expect(() => upsertCatalogExtra(none, { id: "a", url: "/a", label: "a" })).toThrow();

  const two = `${BASE_SOURCE}\nexport const more = buildCatalog({ basePath: "/x" });\n`;
  expect(() => upsertCatalogExtra(two, { id: "a", url: "/a", label: "a" })).toThrow();
});

test("importPromotedAsset honors a custom basePath from the source literal", () => {
  const dir = promotedWorkspace(BASE_SOURCE.replace("/models", "/assets/glb"));
  const imported = importPromotedAsset(dir, "Rock.glb", new Uint8Array([1, 2, 3]));
  expect(imported.url).toBe("/assets/glb/imported/Rock.glb");
  expect(readFileSync(join(dir, "public", "assets", "glb", "imported", "Rock.glb"))).toEqual(
    Buffer.from([1, 2, 3]),
  );
});

test("importPromotedAsset rejects a non-model file", () => {
  const dir = promotedWorkspace();
  expect(() => importPromotedAsset(dir, "notes.txt", new Uint8Array([0]))).toThrow();
});
