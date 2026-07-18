import { describe, expect, test } from "bun:test";

import { createEditorSession, createEmptyEditorDocument, findEditorMarker } from "@jgengine/core/editor/index";

import { renameEditorObject } from "./renameObject";

describe("renameEditorObject", () => {
  test("patches a marker label through the session", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({
      type: "addMarker",
      marker: { id: "a", kind: "prop", position: { x: 0, y: 0, z: 0 }, label: "Old" },
    });
    expect(renameEditorObject(session, "a", "New name")).toBe(true);
    expect(findEditorMarker(session.getState().document, "a")?.label).toBe("New name");
  });

  test("rejects empty labels and unknown ids", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    expect(renameEditorObject(session, "missing", "x")).toBe(false);
    session.dispatch({
      type: "addMarker",
      marker: { id: "a", kind: "prop", position: { x: 0, y: 0, z: 0 } },
    });
    expect(renameEditorObject(session, "a", "   ")).toBe(false);
  });
});
