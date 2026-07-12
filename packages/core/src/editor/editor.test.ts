import { describe, expect, test } from "bun:test";

import {
  createEditorSession,
  createEmptyEditorDocument,
  editorDocumentBounds,
  exportEditorDocumentJson,
  importEditorDocumentJson,
  listEditorKinds,
  mergeEditorDocuments,
  normalizeEditorLayers,
  summarizeEditorSession,
} from "./index";

describe("editor document", () => {
  test("normalize fills empty arrays", () => {
    const doc = normalizeEditorLayers({ markers: [{ id: "a", kind: "boss", position: { x: 1, y: 0, z: 2 } }] });
    expect(doc.version).toBe(1);
    expect(doc.markers).toHaveLength(1);
    expect(doc.volumes).toEqual([]);
    expect(doc.paths).toEqual([]);
  });

  test("merge concatenates layers", () => {
    const a = normalizeEditorLayers({
      markers: [{ id: "m1", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } }],
    });
    const b = normalizeEditorLayers({
      volumes: [{ id: "v1", kind: "zone", shape: "cylinder", center: { x: 0, y: 0, z: 0 }, radius: 10 }],
    });
    const merged = mergeEditorDocuments(a, b);
    expect(merged.markers).toHaveLength(1);
    expect(merged.volumes).toHaveLength(1);
  });

  test("json round-trip", () => {
    const doc = normalizeEditorLayers({
      markers: [{ id: "boss_warrior", kind: "boss", position: { x: -80, y: 0, z: -660 }, label: "Warrior" }],
      volumes: [
        {
          id: "zone_arid",
          kind: "zone",
          shape: "cylinder",
          center: { x: 0, y: 0, z: 0 },
          radius: 120,
          height: 40,
        },
      ],
    });
    const raw = exportEditorDocumentJson(doc);
    const back = importEditorDocumentJson(raw);
    expect(back.markers[0]?.id).toBe("boss_warrior");
    expect(back.volumes[0]?.radius).toBe(120);
  });

  test("bounds cover markers and volumes", () => {
    const doc = normalizeEditorLayers({
      markers: [{ id: "a", kind: "poi", position: { x: -10, y: 0, z: 5 } }],
      volumes: [{ id: "b", kind: "zone", shape: "sphere", center: { x: 20, y: 1, z: -5 }, radius: 3 }],
    });
    const bounds = editorDocumentBounds(doc);
    expect(bounds).not.toBeNull();
    expect(bounds!.min.x).toBe(-10);
    expect(bounds!.max.x).toBe(20);
  });

  test("list kinds is sorted unique", () => {
    const doc = normalizeEditorLayers({
      markers: [
        { id: "1", kind: "boss", position: { x: 0, y: 0, z: 0 } },
        { id: "2", kind: "boss", position: { x: 1, y: 0, z: 0 } },
        { id: "3", kind: "player_spawn", position: { x: 2, y: 0, z: 0 } },
      ],
    });
    expect(listEditorKinds(doc).markers).toEqual(["boss", "player_spawn"]);
  });
});

describe("editor session", () => {
  test("move marker and undo", () => {
    const session = createEditorSession(
      normalizeEditorLayers({
        markers: [{ id: "boss_warrior", kind: "boss", position: { x: -80, y: 0, z: -660 } }],
      }),
    );
    session.dispatch({ type: "select", ids: ["boss_warrior"] });
    session.dispatch({
      type: "setTransform",
      id: "boss_warrior",
      position: { x: -100, y: 0, z: -700 },
    });
    expect(session.getState().document.markers[0]?.position.x).toBe(-100);
    session.dispatch({ type: "undo" });
    expect(session.getState().document.markers[0]?.position.x).toBe(-80);
    session.dispatch({ type: "redo" });
    expect(session.getState().document.markers[0]?.position.x).toBe(-100);
  });

  test("set volume radius", () => {
    const session = createEditorSession(
      normalizeEditorLayers({
        volumes: [
          {
            id: "zone_a",
            kind: "zone",
            shape: "cylinder",
            center: { x: 0, y: 0, z: 0 },
            radius: 50,
            height: 20,
          },
        ],
      }),
    );
    session.dispatch({ type: "setVolume", id: "zone_a", patch: { radius: 75 } });
    expect(session.getState().document.volumes[0]?.radius).toBe(75);
  });

  test("summarize reports selection", () => {
    const empty = createEmptyEditorDocument();
    const session = createEditorSession({
      ...empty,
      markers: [{ id: "m", kind: "mob", position: { x: 1, y: 2, z: 3 } }],
    });
    session.dispatch({ type: "select", ids: ["m"] });
    const summary = summarizeEditorSession(session.getState());
    expect(summary.markers).toBe(1);
    expect(summary.selectedMarker?.kind).toBe("mob");
  });
});
