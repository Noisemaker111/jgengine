import { expect, test } from "bun:test";
import { getDocumentLiveSync } from "@jgengine/core/editor/liveSync";
import { normalizeEditorLayers } from "@jgengine/core/editor/document";
import { createEditorHost, getEditorHost } from "./session";
import { validateCreatorDocument, type CreatorPolicy } from "@jgengine/core/editor/creatorStorage";

test("isolated playtests capture current unsaved edits, discard runtime changes and restore the editor", () => {
  const host = createEditorHost({ gameId: "creator", layers: normalizeEditorLayers({ markers: [{ id: "spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } }] }), isolatedPlaytest: true, publishGlobal: false });
  try {
    expect(getEditorHost()).toBeNull();
    host.session.dispatch({ type: "setMarker", id: "spawn", patch: { position: { x: 7, y: 2, z: 1 } } });
    const authored = host.session.exportJson();
    const editorBus = host.api.getLiveSync();
    for (let iteration = 0; iteration < 3; iteration += 1) {
      host.api.setMode("play");
      expect(host.api.getPlayDocument()?.markers[0]!.position.x).toBe(7);
      expect(host.api.getLiveSync()).not.toBe(editorBus);
      expect(getDocumentLiveSync()).toBe(host.api.getLiveSync());
      host.api.getLiveSync().pushRuntimeDelta({ entities: [{ id: "player", position: { x: 99, y: 99, z: 99 } }], at: 1 });
      expect(host.api.handle({ method: "set_transform", id: "spawn", x: 99 }).ok).toBe(false);
      expect(host.api.handle({ method: "undo" }).ok).toBe(false);
      expect(host.session.exportJson()).toBe(authored);
      host.api.setMode("edit");
      expect(host.api.getPlayDocument()).toBeNull();
      expect(host.api.getLiveSync()).toBe(editorBus);
      expect(host.api.getLiveSync().getRuntimeState().entities).toEqual({});
      expect(host.session.exportJson()).toBe(authored);
    }
  } finally { host.dispose(); }
  expect(getDocumentLiveSync()).toBeNull();
});

test("creator approved catalog placement resolves by ids while external URLs remain rejected", () => {
  const policy: CreatorPolicy = { maxDocuments: 2, maxBytes: 10000, maxObjects: 4, maxPathPoints: 16, maxGridCells: 0, maxTerrainVertices: 0, allowedKinds: ["prop"], allowedAssets: ["pad"], allowedCatalogIds: ["pad"] };
  const host = createEditorHost({ gameId: "creator-assets", layers: normalizeEditorLayers({}), assets: [{ id: "pad", label: "Course pad", kind: "model", url: "https://approved.test/pad.glb" }], validateDocument: (document) => { validateCreatorDocument(document, policy); }, persistAssetUrls: false, publishGlobal: false });
  try {
    expect(host.api.handle({ method: "place_asset", id: "pad", kind: "prop", x: 1, y: 2, z: 3 }).ok).toBe(true);
    const marker = host.session.getState().document.markers[0]!;
    expect(marker.catalogId).toBe("pad");
    expect(marker.meta?.assetId).toBe("pad");
    expect(marker.meta?.url).toBeUndefined();
    expect(host.api.handle({ method: "set_meta", id: marker.id, patch: { url: "https://unapproved.test/evil.glb" } }).ok).toBe(false);
    expect(host.session.getState().document.markers[0]!.meta?.url).toBeUndefined();
  } finally { host.dispose(); }
});
