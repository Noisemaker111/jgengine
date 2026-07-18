import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { buildEditorManifest, importEditorAsset } from "./editorHostPlugin";
import { isPromotedProject } from "./promotedAssetCatalog";

function workspace(): string {
  return mkdtempSync(join(tmpdir(), "jg-editor-"));
}

test("buildEditorManifest reads the scene document and scans models", () => {
  const dir = workspace();
  writeFileSync(join(dir, "editor.scene.json"), JSON.stringify({ markers: [{ id: "spawn" }] }));
  mkdirSync(join(dir, "assets", "props"), { recursive: true });
  writeFileSync(join(dir, "assets", "Tree.glb"), "glb");
  writeFileSync(join(dir, "assets", "props", "rock.gltf"), "{}");
  writeFileSync(join(dir, "assets", "notes.txt"), "ignore me");

  const manifest = buildEditorManifest(dir, join(dir, "assets"));
  expect(manifest.scene).toEqual({ markers: [{ id: "spawn" }] });
  expect(manifest.assets.map((a) => a.id)).toEqual(["tree", "props-rock"]);
  expect(manifest.assets.map((a) => a.url)).toEqual([
    "/__jgengine/assets/Tree.glb",
    "/__jgengine/assets/props/rock.gltf",
  ]);
});

test("buildEditorManifest returns a null scene when none on disk", () => {
  const dir = workspace();
  const manifest = buildEditorManifest(dir, dir);
  expect(manifest.scene).toBeNull();
  expect(manifest.assets).toEqual([]);
});

test("importEditorAsset persists a dropped model the manifest scan re-lists under the same id", () => {
  const dir = workspace();
  const assetsDir = join(dir, "assets");
  const bytes = new TextEncoder().encode("glb-bytes");

  const imported = importEditorAsset(assetsDir, "Spaceship.glb", bytes);
  expect(imported).toEqual({
    id: "spaceship",
    url: "/__jgengine/assets/Spaceship.glb",
    label: "Spaceship.glb",
  });
  // Written to disk under the folder the manifest scans, byte-for-byte.
  expect(readFileSync(join(assetsDir, "Spaceship.glb"))).toEqual(Buffer.from(bytes));

  // Reload: the scan produces the same id/url the import returned — so a placement referencing it resolves.
  const rescanned = buildEditorManifest(dir, assetsDir);
  expect(rescanned.assets).toContainEqual(imported);
});

test("importEditorAsset creates the asset folder when missing", () => {
  const dir = workspace();
  const assetsDir = join(dir, "public", "models");
  expect(existsSync(assetsDir)).toBe(false);
  const imported = importEditorAsset(assetsDir, "tree.glb", new Uint8Array([1, 2, 3]));
  expect(existsSync(join(assetsDir, "tree.glb"))).toBe(true);
  expect(imported.id).toBe("tree");
});

test("importEditorAsset strips path components and unsafe characters from the filename", () => {
  const dir = workspace();
  const imported = importEditorAsset(dir, "../../etc/My Cool Model!.glb", new Uint8Array([0]));
  expect(imported.label).toBe("My-Cool-Model.glb");
  expect(imported.url).toBe("/__jgengine/assets/My-Cool-Model.glb");
  // Written safely inside the asset folder — the `../../etc` prefix in the name never escaped it.
  expect(existsSync(join(dir, "My-Cool-Model.glb"))).toBe(true);
});

test("importEditorAsset rejects a non-model file", () => {
  const dir = workspace();
  expect(() => importEditorAsset(dir, "notes.txt", new Uint8Array([0]))).toThrow();
});

test("a workspace without src/game/assets.ts is not promoted and imports via the folder scan (no #1030 regression)", () => {
  const dir = workspace();
  const assetsDir = join(dir, "assets");
  expect(isPromotedProject(dir)).toBe(false);
  // The route branch would call importEditorAsset for a non-promoted dir — its contract is unchanged.
  const imported = importEditorAsset(assetsDir, "Crate.glb", new Uint8Array([9, 9, 9]));
  expect(imported).toEqual({
    id: "crate",
    url: "/__jgengine/assets/Crate.glb",
    label: "Crate.glb",
  });
  expect(readFileSync(join(assetsDir, "Crate.glb"))).toEqual(Buffer.from([9, 9, 9]));
});
