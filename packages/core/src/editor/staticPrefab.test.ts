import { expect, test } from "bun:test";
import { createEditorSession } from "./commands";
import { cloneEditorDocument, createEmptyEditorDocument, decodeEditorDocument } from "./document";
import { parseStaticPrefabBake } from "./staticPrefab";

test("legacy prefabs reopen and invalid static bake settings report their document path", () => {
  const document = createEmptyEditorDocument();
  document.prefabs.push({ id: "parts", name: "Parts", fragment: { markers: [], volumes: [], paths: [], annotations: [] } });
  expect(decodeEditorDocument(document).ok).toBe(true);
  const invalid = decodeEditorDocument({ ...document, prefabs: [{ ...document.prefabs[0], staticBake: { assetId: "mesh", collisionBoxes: [{ min: [1, 0, 0], max: [0, 1, 1] }] } }] });
  expect(invalid.ok).toBe(false);
  if (invalid.ok) throw new Error("invalid bake accepted");
  expect(invalid.errors[0]!.path).toBe("$.prefabs[0].staticBake");
});

test("static export settings participate in atomic command rollback and source snapshots are isolated", () => {
  const document = createEmptyEditorDocument();
  document.prefabs.push({ id: "parts", name: "Parts", fragment: { markers: [{ id: "part", kind: "prop", position: { x: 0, y: 2, z: 0 }, catalogId: "own:part", meta: { provenance: { source: "original" } } }], volumes: [], paths: [], annotations: [] } });
  const snapshot = cloneEditorDocument(document);
  const meta = document.prefabs[0]!.fragment.markers[0]!.meta!;
  (meta.provenance as { source: string }).source = "changed";
  expect(snapshot.prefabs[0]!.fragment.markers[0]!.meta!.provenance).toEqual({ source: "original" });
  const session = createEditorSession(snapshot);
  const before = session.getState();
  const result = session.transaction([
    { type: "setPrefabStaticBake", prefabId: "parts", bake: { assetId: "own:assembled" } },
    { type: "setPrefabStaticBake", prefabId: "missing", bake: { assetId: "own:bad" } },
  ]);
  expect(result.ok).toBe(false);
  expect(session.getState()).toBe(before);
  expect(session.canUndo()).toBe(false);
});

test("clearance ids are unique and touching solids are allowed while overlapping solids fail", () => {
  const settings = { assetId: "own:arch", collisionBoxes: [{ min: [-2, 0, -1], max: [-1, 3, 1] }], clearances: [{ id: "door", min: [-1, 0, -1], max: [1, 2, 1] }] };
  expect(parseStaticPrefabBake(settings)).toEqual(settings);
  expect(() => parseStaticPrefabBake({ ...settings, clearances: [...settings.clearances, ...settings.clearances] })).toThrow("unique");
  expect(() => parseStaticPrefabBake({ ...settings, clearances: [{ id: "door", min: [-1.5, 0, -1], max: [1, 2, 1] }] })).toThrow("intersects");
});

test("direct dispatch rejects missing prefab without an undo entry", () => {
  const session = createEditorSession(createEmptyEditorDocument());
  const before = session.getState();
  expect(session.dispatch({ type: "setPrefabStaticBake", prefabId: "missing", bake: { assetId: "own:model" } })).toBe(before);
  expect(session.canUndo()).toBe(false);
});
