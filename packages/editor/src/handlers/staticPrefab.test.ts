import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importEditorDocumentJson } from "@jgengine/core/editor/document";
import type { StaticPrefabBake } from "@jgengine/core/editor/staticPrefab";
import { createEditorHost } from "../session";
import { saveSceneDocument } from "../mcp/cli";
import { decodeEditorBridgeRequest } from "../mcp/rpcRequest";

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

test("RPC authors a prefab export, saves/reopens, and undo/redo preserves source parts and settings", () => {
  const host = createEditorHost({ gameId: "prefab", layers: { markers: [
    { id: "wall", kind: "prop", catalogId: "custom:wall", position: { x: 12, y: 2, z: 20 }, rotationY: Math.PI / 2, meta: { verticalOffset: 0.5, provenance: { source: "game-owned" } } },
  ] } });
  cleanup.push(host.dispose);
  expect(host.api.handle({ method: "create_prefab", id: "house", name: "House", ids: ["wall"] }).ok).toBe(true);
  const source = structuredClone(host.api.getSession().getState().document.prefabs[0]!.fragment);
  const bake: StaticPrefabBake = { assetId: "custom:house", collisionBoxes: [{ min: [-3, 0, -1], max: [-1, 4, 1] }], clearances: [{ id: "door", min: [-1, 0, -1], max: [1, 3, 1] }] };
  const decoded = decodeEditorBridgeRequest({ method: "set_prefab_static_bake", prefabId: "house", bake });
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error("request rejected");
  expect(host.api.handle(decoded.request).ok).toBe(true);
  const session = host.api.getSession();
  const expected = structuredClone(session.getState().document);
  (bake.collisionBoxes![0]!.min as number[])[0] = -99;
  expect(session.getState().document).toEqual(expected);
  expect(host.api.handle({ method: "undo" }).ok).toBe(true);
  expect(session.getState().document.prefabs[0]!.staticBake).toBeUndefined();
  expect(session.getState().document.prefabs[0]!.fragment).toEqual(source);
  expect(host.api.handle({ method: "redo" }).ok).toBe(true);
  expect(session.getState().document).toEqual(expected);
  const root = mkdtempSync(join(tmpdir(), "prefab-authoring-"));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "prefab", "src"), { recursive: true });
  expect(saveSceneDocument("prefab", session.getState().document, root).ok).toBe(true);
  const reopened = importEditorDocumentJson(readFileSync(join(root, "prefab/src/editor.scene.json"), "utf8"));
  const next = createEditorHost({ gameId: "prefab", layers: reopened });
  cleanup.push(next.dispose);
  expect(next.api.getSession().getState().document).toEqual(expected);
  expect(next.api.handle({ method: "set_prefab_static_bake", prefabId: "house", bake: null }).ok).toBe(true);
  expect(next.api.getSession().getState().document.prefabs[0]!.staticBake).toBeUndefined();
  next.api.handle({ method: "undo" });
  expect(next.api.getSession().getState().document).toEqual(expected);
});

test("invalid solids, blocked clearance and missing prefabs leave document revision and history untouched", () => {
  const host = createEditorHost({ gameId: "prefab", layers: { prefabs: [{ id: "p", name: "P", fragment: { markers: [], volumes: [], paths: [], annotations: [] } }] } });
  cleanup.push(host.dispose);
  const session = host.api.getSession();
  const before = session.getState();
  const invalid = [
    { assetId: "" },
    { assetId: "asset", collisionBoxes: [] },
    { assetId: "asset", collisionBoxes: [{ min: [0, 0, 0], max: [1, 1, Infinity] }] },
    { assetId: "asset", collisionBoxes: [{ min: [0, 0, 0], max: [1, 0, 1] }] },
    { assetId: "asset", clearances: [{ id: "door", min: [0, 0, 0], max: [1, 1, 1] }] },
    { assetId: "asset", collisionBoxes: [{ min: [0, 0, 0], max: [2, 2, 2] }], clearances: [{ id: "door", min: [1, 0, 0], max: [3, 1, 1] }] },
    { assetId: "asset", surprise: 2 },
  ];
  for (const bake of invalid) {
    expect(host.api.handle({ method: "set_prefab_static_bake", prefabId: "p", bake: bake as StaticPrefabBake }).ok).toBe(false);
    expect(session.getState()).toBe(before);
    expect(session.canUndo()).toBe(false);
  }
  expect(host.api.handle({ method: "set_prefab_static_bake", prefabId: "missing", bake: { assetId: "asset" } }).ok).toBe(false);
  expect(session.getState()).toBe(before);
});
