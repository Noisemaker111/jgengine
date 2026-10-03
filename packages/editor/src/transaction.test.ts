import { describe, expect, test } from "bun:test";
import { decodeEditorDocument, type EditorCommand } from "@jgengine/core/editor/index";
import { createEditorHost } from "./session";

const commands: EditorCommand[] = [
  { type: "addMarker", marker: { id: "placed", kind: "prop", catalogId: "custom-model", position: { x: 1, y: 2, z: 3 } } },
  { type: "addPath", path: { id: "path", kind: "route", points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 3 }] } },
  { type: "createCollection", id: "region", name: "Region", memberIds: ["placed", "path"] },
  { type: "assignMaterial", ids: ["placed"], materialId: "custom-material" },
];

describe("atomic document patch RPC", () => {
  test("one request, undo, redo, and publication for a heterogeneous batch", () => {
    const { api, dispose } = createEditorHost({ gameId: "test", layers: {} });
    try {
      let notifications = 0;
      let publications = 0;
      api.getSession().subscribe(() => { notifications += 1; });
      api.getLiveSync().subscribeDocument(() => { publications += 1; });
      const response = api.handle({ method: "push_document_patch", patch: { type: "commands", baseRevision: 0, commands } });
      expect(response).toMatchObject({ ok: true, result: { revision: 1, changed: true, markers: 1, paths: 1 } });
      expect(notifications).toBe(1);
      expect(publications).toBe(1);
      const authored = api.getSession().exportJson();
      expect(decodeEditorDocument(JSON.parse(authored)).ok).toBe(true);
      expect(api.getLiveSync().getDocument().markers[0]?.catalogId).toBe("custom-model");
      expect(api.handle({ method: "undo" }).ok).toBe(true);
      expect(api.getSession().getState().document.markers).toHaveLength(0);
      expect(api.getSession().canUndo()).toBe(false);
      expect(api.handle({ method: "redo" }).ok).toBe(true);
      expect(api.getSession().exportJson()).toBe(authored);
    } finally {
      dispose();
    }
  });

  test("a rejected later command publishes nothing and preserves existing undo/selection", () => {
    const { api, dispose } = createEditorHost({ gameId: "test", layers: {} });
    try {
      api.handle({ method: "add_marker", id: "previous", kind: "prop", x: 0, z: 0 });
      const before = api.getSession().getState();
      let publications = 0;
      api.getLiveSync().subscribeDocument(() => { publications += 1; });
      const response = api.handle({ method: "push_document_patch", patch: {
        type: "commands", baseRevision: 1,
        commands: [...commands, { type: "remove", id: "missing" }],
      } });
      expect(response).toMatchObject({ ok: false, result: { commandIndex: 4, revision: 1 } });
      expect(response.error).toContain("commands[4]");
      expect(api.getSession().getState()).toBe(before);
      expect(api.getLiveSync().getRevision()).toBe(1);
      expect(publications).toBe(0);
      api.handle({ method: "undo" });
      expect(api.getSession().getState().document.markers).toHaveLength(0);
    } finally {
      dispose();
    }
  });

  test("revision conflict precedes staging, force keeps atomic validation, and retries preserve ids", () => {
    const { api, dispose } = createEditorHost({ gameId: "test", layers: {} });
    try {
      const patch = { type: "commands" as const, baseRevision: 10, commands };
      expect(api.handle({ method: "push_document_patch", patch })).toMatchObject({ ok: false });
      expect(api.getSession().canUndo()).toBe(false);
      expect(api.getSession().getState().document.markers).toHaveLength(0);
      expect(api.handle({ method: "push_document_patch", patch, force: true })).toMatchObject({ ok: true, result: { revision: 1 } });
      expect(api.handle({ method: "push_document_patch", patch: { ...patch, baseRevision: 1 } })).toMatchObject({ ok: true, result: { revision: 1 } });
      expect(api.getSession().getState().document.markers.map((item) => item.id)).toEqual(["placed"]);
      expect(api.handle({ method: "push_document_patch", patch: { ...patch, baseRevision: NaN }, force: true }).ok).toBe(false);
      expect(api.getLiveSync().getRevision()).toBe(1);
    } finally {
      dispose();
    }
  });
});
