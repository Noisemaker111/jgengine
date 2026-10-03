import { expect, test } from "bun:test";
import { createEditorSession } from "./commands";
import { applyEditorDocumentOverlay, cloneEditorDocument, createEmptyEditorDocument, createPrefabFragment, importEditorDocumentJson, normalizeEditorLayers } from "./document";
import { modelWithAuthoredMaterials } from "./materialAuthoring";
import { createMaterialTemplate } from "../material/materialAsset";

const asset = createMaterialTemplate("silk", "coat", "Coat");
function document() {
  return { ...createEmptyEditorDocument(), materialAssets: [asset], markers: [{ id: "fitter", kind: "prop", catalogId: "fitter", position: { x: 0, y: 0, z: 0 } }] };
}

test("named assignments survive undo, reopen and runtime without a global override", () => {
  const session = createEditorSession(document());
  const assignment = { type: "assignMaterialAsset" as const, ids: ["fitter"], materialId: "coat", selector: { slot: "Workcoat textile" } };
  expect(session.transaction([assignment]).ok).toBe(true);
  const saved = session.exportJson(true);
  session.dispatch({ type: "undo" });
  expect(session.getState().document.markers[0]!.meta?.materialAssignments).toBeUndefined();
  session.dispatch({ type: "redo" });
  expect(session.exportJson(true)).toBe(saved);
  const reopened = importEditorDocumentJson(saved);
  const model = { url: "/fitter.glb", material: { roughness: 0.7 } };
  const resolved = modelWithAuthoredMaterials(model, reopened, "fitter")!;
  expect(resolved.material).toBe(model.material);
  expect(resolved.materialAssignments).toEqual([{ materialId: "coat", selector: { slot: "Workcoat textile" } }]);
  expect(resolved.materialAssets![0]).toEqual(asset);
  expect(modelWithAuthoredMaterials(model, reopened, "untouched")).toBe(model);
});

test("slot edits are atomic and invalid references cannot enter history", () => {
  const session = createEditorSession(document());
  const before = session.exportJson();
  const result = session.transaction([
    { type: "assignMaterialAsset", ids: ["fitter"], materialId: "coat", selector: { slot: "Workcoat textile" } },
    { type: "assignMaterialAsset", ids: ["fitter"], materialId: "missing", selector: { slot: "Amber visor" } },
  ]);
  expect(result.ok).toBe(false);
  expect(session.exportJson()).toBe(before);
  expect(session.canUndo()).toBe(false);
  expect(session.transaction([{ type: "assignMaterialAsset", ids: ["fitter"], materialId: "coat", selector: {} }]).ok).toBe(false);
});

test("portable prefabs carry referenced assets and reject conflicting identities", () => {
  const session = createEditorSession(document());
  session.dispatch({ type: "assignMaterialAsset", ids: ["fitter"], materialId: "coat", selector: { slot: "Workcoat textile" } });
  const fragment = createPrefabFragment(session.getState().document, ["fitter"]);
  expect(fragment.materialAssets).toEqual([asset]);
  const target = createEditorSession({ ...createEmptyEditorDocument(), prefabs: [{ id: "fitter-prefab", name: "Fitter", fragment }] });
  expect(target.transaction([{ type: "insertPrefab", prefabId: "fitter-prefab", at: { x: 2, y: 0, z: 0 }, instanceId: "one" }]).ok).toBe(true);
  expect(target.getState().document.materialAssets).toEqual([asset]);
  expect(importEditorDocumentJson(target.exportJson()).markers[0]!.meta?.materialAssignments).toEqual([{ materialId: "coat", selector: { slot: "Workcoat textile" } }]);
  const other = createEditorSession({ ...createEmptyEditorDocument(), materialAssets: [{ ...asset, name: "Different art" }], prefabs: [{ id: "fitter-prefab", name: "Fitter", fragment }] });
  expect(other.transaction([{ type: "insertPrefab", prefabId: "fitter-prefab", at: { x: 2, y: 0, z: 0 } }]).ok).toBe(false);
});

test("material asset edits are owned copies and remain through document rebuilds", () => {
  const source = document();
  const session = createEditorSession(source);
  const edited = { ...asset, surface: { ...asset.surface, roughness: 0.4 } };
  session.dispatch({ type: "upsertMaterialAsset", asset: edited });
  edited.surface.roughness = 0.95;
  expect(session.getState().document.materialAssets![0]!.surface.roughness).toBe(0.4);
  session.dispatch({ type: "assignMaterialAsset", ids: ["fitter"], materialId: "coat", selector: { slotIndex: 0 } });
  const clone = cloneEditorDocument(session.getState().document);
  (clone.markers[0]!.meta!.materialAssignments as { materialId: string }[])[0]!.materialId = "other";
  expect((session.getState().document.markers[0]!.meta!.materialAssignments as { materialId: string }[])[0]!.materialId).toBe("coat");
  expect(normalizeEditorLayers(source).materialAssets).toEqual([asset]);
  expect(applyEditorDocumentOverlay(source, createEmptyEditorDocument()).materialAssets).toEqual([asset]);
  expect(session.transaction([{ type: "removeMaterialAsset", id: "coat" }]).ok).toBe(false);
  expect(session.transaction([{ type: "clearMaterialAssets", ids: ["fitter"] }, { type: "removeMaterialAsset", id: "coat" }]).ok).toBe(true);
});

test("prefab decode rejects assignments missing from its portable library", () => {
  const source = document();
  const fragment = {
    markers: [{ ...source.markers[0], meta: { materialAssignments: [{ materialId: "coat", selector: { slotIndex: 0 } }] } }],
    volumes: [], paths: [], annotations: [],
  };
  const input = { ...source, prefabs: [{ id: "portable", name: "Portable", fragment }] };
  expect(() => importEditorDocumentJson(JSON.stringify(input))).toThrow("$.prefabs[0].fragment.markers[0].meta.materialAssignments.0.materialId");
  expect(importEditorDocumentJson(JSON.stringify({ ...input, prefabs: [{ ...input.prefabs[0], fragment: { ...fragment, materialAssets: [asset] } }] })).prefabs[0].fragment.materialAssets).toEqual([asset]);
});

test("reassigning a selector replaces its assignment regardless of JSON key order", () => {
  const glass = createMaterialTemplate("glass", "visor");
  const session = createEditorSession({ ...document(), materialAssets: [asset, glass] });
  session.dispatch({ type: "assignMaterialAsset", ids: ["fitter"], materialId: "coat", selector: { slotIndex: 0, mesh: "Body" } });
  session.dispatch({ type: "assignMaterialAsset", ids: ["fitter"], materialId: "visor", selector: { mesh: "Body", slotIndex: 0 } });
  expect(session.getState().document.markers[0].meta?.materialAssignments).toEqual([{ materialId: "visor", selector: { mesh: "Body", slotIndex: 0 } }]);
  session.dispatch({ type: "undo" });
  expect(session.getState().document.markers[0].meta?.materialAssignments).toEqual([{ materialId: "coat", selector: { slotIndex: 0, mesh: "Body" } }]);
});

test("document edits are authoritative over model assets with the same stable ID", () => {
  const stale = { ...asset, name: "Old coat", surface: { ...asset.surface, roughness: 0.95 } };
  const model = { url: "/fitter.glb", materialAssets: [stale], materialAssignments: [{ materialId: "coat", selector: { slot: "Workcoat textile" } }] };
  const resolved = modelWithAuthoredMaterials(model, document(), "fitter")!;
  expect(resolved.materialAssets).toEqual([asset]);
  expect(resolved.materialAssignments).toEqual(model.materialAssignments);
  expect(model.materialAssets).toEqual([stale]);
  const invalidModel = { ...model, materialAssignments: [{ materialId: "missing", selector: { slotIndex: 0 } }] };
  expect(() => modelWithAuthoredMaterials(invalidModel, document(), "fitter")).toThrow("not in the asset library");
});

test("authored selectors replace matching model defaults and preserve other slots", () => {
  const glass = createMaterialTemplate("glass", "visor");
  const source = {
    ...document(), materialAssets: [asset, glass],
    markers: [{ ...document().markers[0], meta: { materialAssignments: [{ materialId: "visor", selector: { mesh: "Body", slotIndex: 0 } }] } }],
  };
  const model = {
    url: "/fitter.glb", materialAssets: [asset],
    materialAssignments: [
      { materialId: "coat", selector: { slotIndex: 0, mesh: "Body" } },
      { materialId: "coat", selector: { slot: "Collar textile" } },
    ],
  };
  const resolved = modelWithAuthoredMaterials(model, source, "fitter")!;
  expect(resolved.materialAssignments).toEqual([
    { materialId: "coat", selector: { slot: "Collar textile" } },
    { materialId: "visor", selector: { mesh: "Body", slotIndex: 0 } },
  ]);
  expect(model.materialAssignments).toHaveLength(2);
});
