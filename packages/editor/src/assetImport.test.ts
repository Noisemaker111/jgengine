import { afterEach, expect, test } from "bun:test";

import { editorAssetFromImport, mergeEditorAssets } from "./AssetBrowser";
import {
  loadDroppedAssets,
  mergeStandaloneAssets,
  type AssetImporter,
  type StandaloneAsset,
} from "./assetImport";

function modelFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "model/gltf-binary" });
}

test("loadDroppedAssets persists models through the host importer, keeping its durable id/url", async () => {
  const durable: AssetImporter = (file) =>
    Promise.resolve({ id: "tree", url: `/__jgengine/assets/${file.name}`, label: file.name });

  const assets = await loadDroppedAssets([modelFile("Tree.glb")], durable);

  expect(assets).toEqual([{ id: "tree", url: "/__jgengine/assets/Tree.glb", label: "Tree.glb" }]);
  // A durable (non-blob) url means the placement survives reload.
  expect(assets[0]?.url.startsWith("blob:")).toBe(false);
});

test("loadDroppedAssets skips non-model files", async () => {
  const importer: AssetImporter = (file) =>
    Promise.resolve({ id: file.name, url: `/x/${file.name}`, label: file.name });
  const assets = await loadDroppedAssets([modelFile("ok.glb"), modelFile("readme.txt")], importer);
  expect(assets.map((asset) => asset.label)).toEqual(["ok.glb"]);
});

const originalCreateObjectURL = (URL as { createObjectURL?: (blob: unknown) => string }).createObjectURL;

afterEach(() => {
  (URL as { createObjectURL?: (blob: unknown) => string }).createObjectURL = originalCreateObjectURL;
});

test("loadDroppedAssets falls back to an ephemeral blob url when no host answers", async () => {
  (URL as { createObjectURL?: (blob: unknown) => string }).createObjectURL = () => "blob:ephemeral";
  const noHost: AssetImporter = () => Promise.resolve(null);

  const assets: StandaloneAsset[] = await loadDroppedAssets([modelFile("Rock.glb")], noHost);

  expect(assets).toEqual([{ id: "rock", url: "blob:ephemeral", label: "Rock.glb" }]);
});

test("mergeStandaloneAssets replaces same-id reimports and appends new ones", () => {
  const current: StandaloneAsset[] = [
    { id: "tree", url: "blob:old", label: "Tree.glb" },
    { id: "rock", url: "blob:rock", label: "Rock.glb" },
  ];
  const next: StandaloneAsset[] = [
    { id: "tree", url: "/durable/Tree.glb", label: "Tree.glb" },
    { id: "crate", url: "blob:crate", label: "Crate.glb" },
  ];
  expect(mergeStandaloneAssets(current, next)).toEqual([
    { id: "tree", url: "/durable/Tree.glb", label: "Tree.glb" },
    { id: "rock", url: "blob:rock", label: "Rock.glb" },
    { id: "crate", url: "blob:crate", label: "Crate.glb" },
  ]);
});

test("editorAssetFromImport and mergeEditorAssets feed Content Browser entries", () => {
  const entry = editorAssetFromImport({ id: "ship", url: "/models/imported/Ship.glb", label: "Ship.glb" });
  expect(entry).toEqual({
    id: "ship",
    label: "Ship.glb",
    kind: "model",
    url: "/models/imported/Ship.glb",
  });
  const merged = mergeEditorAssets(
    [{ id: "rock", label: "rock", kind: "model", url: "/models/rock.glb" }],
    [entry],
  );
  expect(merged.map((asset) => asset.id)).toEqual(["rock", "ship"]);
});
