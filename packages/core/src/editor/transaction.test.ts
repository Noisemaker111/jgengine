import { describe, expect, test } from "bun:test";
import { createEditorSession, type EditorCommand } from "./commands";
import { decodeEditorDocument, normalizeEditorLayers } from "./document";
import { applyDocumentPatch, createDocumentLiveSync } from "./liveSync";
import { createTerrainSnapshot, editableTerrainFromSnapshot } from "../world/terraform";
import { flatField } from "../world/terrain";

const marker = (id: string) => ({ id, kind: "prop", position: { x: 0, y: 0, z: 0 } });
const seed = () => normalizeEditorLayers({ markers: [marker("root"), { ...marker("locked"), locked: true }] });

describe("atomic editor transactions", () => {
  test("heterogeneous commands use earlier stable ids and one undo/redo and notification", () => {
    const session = createEditorSession(seed());
    const before = session.exportJson();
    let notifications = 0;
    session.subscribe(() => { notifications += 1; });
    const commands: EditorCommand[] = [
      { type: "addMarker", marker: { ...marker("placed"), catalogId: "game-owned-model", meta: { assetId: "game-owned-model" } } },
      { type: "addPath", path: { id: "route", kind: "route", points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] } },
      { type: "setParent", ids: ["placed"], parentId: "root" },
      { type: "setTransform", id: "root", position: { x: 5, y: 2, z: -3 } },
      { type: "createCollection", id: "region", name: "Region", memberIds: ["placed", "route"] },
      { type: "batchSetProperties", ids: ["placed", "route"], patch: { color: "#ff8800", meta: { region: "region" } } },
    ];
    expect(session.transaction(commands).ok).toBe(true);
    expect(notifications).toBe(1);
    const after = session.exportJson();
    expect(session.getState().document.markers.find((item) => item.id === "placed")?.position).toEqual({ x: 5, y: 2, z: -3 });
    expect(decodeEditorDocument(JSON.parse(after)).ok).toBe(true);
    session.dispatch({ type: "undo" });
    expect(session.exportJson()).toBe(before);
    expect(session.canUndo()).toBe(false);
    session.dispatch({ type: "redo" });
    expect(session.exportJson()).toBe(after);
  });

  const rejected: [string, unknown][] = [
    ["missing target", { type: "setTransform", id: "missing", position: { x: 4, y: 0, z: 0 } }],
    ["locked target", { type: "setMarker", id: "locked", patch: { label: "Changed" } }],
    ["mixed locked targets", { type: "translate", ids: ["root", "locked"], delta: { x: 1, y: 0, z: 0 } }],
    ["cycle", { type: "setParent", ids: ["root"], parentId: "root" }],
    ["missing parent", { type: "setParent", ids: ["root"], parentId: "missing" }],
    ["cross-kind collision", { type: "addNote", note: { id: "root", text: "Collision", position: { x: 0, y: 0, z: 0 } } }],
    ["history", { type: "undo" }],
    ["unknown command", { type: "unsupported" }],
    ["unknown command field", { type: "setTransform", id: "root", rotation: 2 }],
    ["missing command field", { type: "setMarker", id: "root" }],
    ["malformed payload", { type: "addMarker", marker: { id: "bad", kind: "prop", position: "oops" } }],
    ["malformed optional field", { type: "setMarker", id: "root", patch: { rotationY: "oops" } }],
    ["unknown payload field", { type: "setMarker", id: "root", patch: { lable: "Oops" } }],
    ["renamed stable id", { type: "setMarker", id: "root", patch: { id: "changed" } }],
    ["nonfinite value", { type: "setTransform", id: "root", position: { x: Infinity, y: 0, z: 0 } }],
    ["schema-invalid document", { type: "addMarker", marker: { id: "bad", position: { x: 0, y: 0, z: 0 } } }],
  ];
  for (const [name, badCommand] of rejected) {
    test(`${name} at index 1 rolls back document, selection, history, and notifications`, () => {
      const session = createEditorSession(seed());
      session.dispatch({ type: "setMarker", id: "root", patch: { label: "Previous" } });
      session.dispatch({ type: "undo" });
      const before = session.getState();
      let notifications = 0;
      session.subscribe(() => { notifications += 1; });
      const result = session.transaction([
        { type: "addMarker", marker: marker("first") },
        badCommand as EditorCommand,
      ]);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected rejection");
      expect(result.commandIndex).toBe(1);
      expect(result.error).toContain("commands[1]");
      expect(session.getState()).toBe(before);
      expect(session.canUndo()).toBe(false);
      expect(session.canRedo()).toBe(true);
      expect(notifications).toBe(0);
    });
  }

  test("idempotent updates succeed without consuming history or publishing", () => {
    const session = createEditorSession(seed());
    let notifications = 0;
    session.subscribe(() => { notifications += 1; });
    expect(session.transaction([{ type: "setTransform", id: "root", position: { x: 0, y: 0, z: 0 } }])).toMatchObject({ ok: true, changed: false });
    expect(session.transaction([{ type: "setParent", ids: ["root"], parentId: null }])).toMatchObject({ ok: true, changed: false });
    expect(session.transaction([{ type: "addMarker", marker: { position: { z: 0, x: 0, y: 0 }, kind: "prop", id: "root" } }])).toMatchObject({ ok: true, changed: false });
    expect(session.getState().document.markers.map((item) => item.id)).toEqual(["root", "locked"]);
    expect(session.canUndo()).toBe(false);
    expect(notifications).toBe(0);
  });

  test("same-kind stable-id upsert retries neither duplicate nor republish", () => {
    const sync = createDocumentLiveSync(seed());
    const commands: EditorCommand[] = [{ type: "addMarker", marker: marker("stable") }];
    let publications = 0;
    sync.subscribeDocument(() => { publications += 1; });
    expect(sync.applyPatch({ type: "commands", baseRevision: 0, commands }).ok).toBe(true);
    expect(sync.applyPatch({ type: "commands", baseRevision: 1, commands }).ok).toBe(true);
    expect(sync.getDocument().markers.filter((item) => item.id === "stable")).toHaveLength(1);
    expect(sync.getRevision()).toBe(1);
    expect(publications).toBe(1);
    expect(sync.pullPatches(0)).toHaveLength(1);
  });

  test("core patch application rejects a bad command and a stale revision before publishing", () => {
    const document = seed();
    const commands: EditorCommand[] = [{ type: "addMarker", marker: marker("first") }, { type: "remove", id: "missing" }];
    const invalid = applyDocumentPatch(document, 3, { type: "commands", baseRevision: 3, commands });
    expect(invalid).toMatchObject({ ok: false });
    expect(document.markers).toHaveLength(2);
    const stale = applyDocumentPatch(document, 3, { type: "commands", baseRevision: 0, commands });
    expect(stale).toMatchObject({ ok: false, error: "baseRevision mismatch: patch=0 current=3" });
    const sync = createDocumentLiveSync(document);
    let publications = 0;
    sync.subscribeDocument(() => { publications += 1; });
    expect(sync.applyPatch({ type: "commands", baseRevision: 0, commands }).ok).toBe(false);
    expect(sync.getRevision()).toBe(0);
    expect(publications).toBe(0);
  });

  test("staged commands do not retain caller-owned nested metadata", () => {
    const session = createEditorSession(seed());
    const placed = { ...marker("stable"), meta: { properties: { custom: "original" } } };
    expect(session.transaction([{ type: "addMarker", marker: placed }]).ok).toBe(true);
    placed.meta.properties.custom = "changed externally";
    expect(session.getState().document.markers.find((item) => item.id === "stable")?.meta).toEqual({ properties: { custom: "original" } });
  });

  test("terrain strokes mixed with placements roll back and undo together", () => {
    const terrain = createTerrainSnapshot({ bounds: { minX: -4, minZ: -4, maxX: 4, maxZ: 4 }, cellSize: 1 });
    const live = editableTerrainFromSnapshot(terrain, flatField());
    const delta = live.editDelta({ mode: "raise", center: [0, 0], radius: 2, strength: 3 });
    const session = createEditorSession({ ...seed(), terrain });
    const before = session.exportJson();
    const edits: EditorCommand[] = [{ type: "sculptTerrain", delta }, { type: "addMarker", marker: marker("placed") }];
    expect(session.transaction([...edits, { type: "remove", id: "missing" }]).ok).toBe(false);
    expect(session.exportJson()).toBe(before);
    expect(session.transaction(edits).ok).toBe(true);
    expect(Math.max(...session.getState().document.terrain!.offsets)).toBeGreaterThan(0);
    session.dispatch({ type: "undo" });
    expect(session.exportJson()).toBe(before);
    session.dispatch({ type: "redo" });
    expect(session.getState().document.markers.find((item) => item.id === "placed")).toBeDefined();
    expect(Math.max(...session.getState().document.terrain!.offsets)).toBeGreaterThan(0);
  });

  test("selection-only transaction does not publish or consume document history", () => {
    const session = createEditorSession(seed());
    const document = session.getState().document;
    expect(session.transaction([{ type: "select", ids: ["locked"] }])).toMatchObject({ ok: true, changed: true });
    expect(session.getState().document).toBe(document);
    expect(session.getState().selection).toEqual(["locked"]);
    expect(session.canUndo()).toBe(false);
    const sync = createDocumentLiveSync(seed());
    expect(sync.applyPatch({ type: "commands", baseRevision: 0, commands: [{ type: "select", ids: ["root"] }] })).toMatchObject({ ok: true, revision: 0 });
    expect(sync.pullPatches(0)).toHaveLength(0);
  });
});
