import { expect, test } from "bun:test";
import { createEditorSession } from "./commands";
import { createEmptyEditorDocument, importEditorDocumentJson } from "./document";
import { authoredHiddenNodes, modelWithAuthoredNodeVisibility } from "./modelNodeVisibility";

test("saved placement visibility composes with model defaults and clears without mutating source data", () => {
  const session = createEditorSession({ ...createEmptyEditorDocument(), markers: [
    { id: "unarmed", kind: "prop", catalogId: "rig", position: { x: 0, y: 0, z: 0 } },
    { id: "equipped", kind: "prop", catalogId: "rig", position: { x: 1, y: 0, z: 0 } },
  ] });
  const names = ["Knife", " Authored Name "];
  expect(session.transaction([{ type: "setMarker", id: "unarmed", patch: { meta: { hiddenNodes: names } } }]).ok).toBe(true);
  names.push("External mutation");
  const model = { url: "/rig.glb", hiddenNodes: ["Crossbow"] as readonly string[], animation: "auto" as const };
  const reopened = importEditorDocumentJson(session.exportJson());
  const unarmed = modelWithAuthoredNodeVisibility(model, reopened.markers[0])!;
  expect(unarmed.hiddenNodes).toEqual(["Knife", " Authored Name "]);
  expect(unarmed.animation).toBe("auto");
  expect(model.hiddenNodes).toEqual(["Crossbow"]);
  expect(modelWithAuthoredNodeVisibility(model, reopened.markers[1])).toBe(model);
  (unarmed.hiddenNodes as string[]).push("Clone-only edit");
  expect(reopened.markers[0]!.meta?.hiddenNodes).toEqual(["Knife", " Authored Name "]);
  expect(session.transaction([{ type: "setMarker", id: "unarmed", patch: { meta: { hiddenNodes: [] } } }]).ok).toBe(true);
  expect(modelWithAuthoredNodeVisibility(model, importEditorDocumentJson(session.exportJson()).markers[0])!.hiddenNodes).toEqual([]);
  session.dispatch({ type: "undo" });
  expect(authoredHiddenNodes(session.getState().document.markers[0]!.meta)).toEqual(["Knife", " Authored Name "]);
  session.dispatch({ type: "redo" });
  expect(authoredHiddenNodes(session.getState().document.markers[0]!.meta)).toEqual([]);
  expect(modelWithAuthoredNodeVisibility(model, undefined)).toBe(model);
  expect(modelWithAuthoredNodeVisibility(model, { meta: { hiddenNodes: ["Crossbow"] } })).toBe(model);
});

test("malformed authored visibility is rejected atomically and at JSON import", () => {
  const initial = { ...createEmptyEditorDocument(), markers: [{ id: "prop", kind: "prop", position: { x: 0, y: 0, z: 0 } }] };
  const session = createEditorSession(initial);
  const before = session.exportJson();
  for (const hiddenNodes of [null, "Knife", {}, [1], [""], [" \t"]]) {
    const result = session.transaction([{ type: "setMarker", id: "prop", patch: { meta: { hiddenNodes } } }]);
    expect(result.ok).toBe(false);
    expect(session.exportJson()).toBe(before);
    expect(session.canUndo()).toBe(false);
    expect(() => importEditorDocumentJson(JSON.stringify({ ...initial, markers: [{ ...initial.markers[0], meta: { hiddenNodes } }] }))).toThrow(/meta.hiddenNodes/);
    expect(() => modelWithAuthoredNodeVisibility({ url: "/rig.glb" }, { meta: { hiddenNodes } })).toThrow(/array of nonblank node names/);
  }
  expect(() => authoredHiddenNodes({ hiddenNodes: new Array(1) })).toThrow(/array of nonblank node names/);
});
