import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { buildEditorManifest } from "./editorHostPlugin";

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
