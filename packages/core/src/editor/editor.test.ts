import { describe, expect, test } from "bun:test";

import {
  applyEditorDocumentOverlay,
  createEditorSession,
  createEmptyEditorDocument,
  editorDocumentBounds,
  editorDocumentSize,
  exportEditorDocumentJson,
  extractEditorFragment,
  importEditorDocumentJson,
  listEditorKinds,
  mergeEditorDocuments,
  normalizeEditorLayers,
  summarizeEditorSession,
} from "./index";
import {
  createTerrainSnapshot,
  editableTerrainFromSnapshot,
} from "../world/terraform";
import { flatField } from "../world/terrain";

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

  test("overlay upserts by id and appends new objects", () => {
    const base = normalizeEditorLayers({
      markers: [
        { id: "boss", kind: "boss", position: { x: 0, y: 0, z: 0 } },
        { id: "spawn", kind: "player_spawn", position: { x: 5, y: 0, z: 5 } },
      ],
    });
    const overlay = normalizeEditorLayers({
      markers: [
        { id: "boss", kind: "boss", position: { x: 40, y: 0, z: -10 } },
        { id: "chest_new", kind: "chest", position: { x: 1, y: 0, z: 1 } },
      ],
    });
    const merged = applyEditorDocumentOverlay(base, overlay);
    expect(merged.markers).toHaveLength(3);
    expect(merged.markers.find((m) => m.id === "boss")?.position.x).toBe(40);
    expect(merged.markers.find((m) => m.id === "spawn")?.position.x).toBe(5);
    expect(merged.markers.find((m) => m.id === "chest_new")).toBeDefined();
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

  test("add path, note, and edit them", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({
      type: "addPath",
      path: { id: "p1", kind: "route", points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] },
    });
    session.dispatch({ type: "addNote", note: { id: "n1", text: "boss here", position: { x: 5, y: 0, z: 5 } } });
    expect(session.getState().selection).toEqual(["n1"]);
    session.dispatch({
      type: "setPath",
      id: "p1",
      patch: { points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 20, y: 0, z: 5 }], width: 6 },
    });
    session.dispatch({ type: "setNote", id: "n1", patch: { text: "boss arena" } });
    const doc = session.getState().document;
    expect(doc.paths[0]?.points).toHaveLength(3);
    expect(doc.paths[0]?.width).toBe(6);
    expect(doc.annotations[0]?.text).toBe("boss arena");
    session.dispatch({ type: "undo" });
    expect(session.getState().document.annotations[0]?.text).toBe("boss here");
  });

  test("translate moves every selected object including path points", () => {
    const session = createEditorSession(
      normalizeEditorLayers({
        markers: [{ id: "m", kind: "mob", position: { x: 1, y: 0, z: 1 } }],
        volumes: [{ id: "v", kind: "zone", shape: "sphere", center: { x: 5, y: 0, z: 5 }, radius: 4 }],
        paths: [{ id: "p", kind: "route", points: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 2 }] }],
      }),
    );
    session.dispatch({ type: "translate", ids: ["m", "v", "p"], delta: { x: 10, y: 1, z: -10 } });
    const doc = session.getState().document;
    expect(doc.markers[0]?.position).toEqual({ x: 11, y: 1, z: -9 });
    expect(doc.volumes[0]?.center).toEqual({ x: 15, y: 1, z: -5 });
    expect(doc.paths[0]?.points[1]).toEqual({ x: 12, y: 1, z: -8 });
    session.dispatch({ type: "undo" });
    expect(session.getState().document.markers[0]?.position.x).toBe(1);
  });

  test("removeMany deletes across types and prunes selection", () => {
    const session = createEditorSession(
      normalizeEditorLayers({
        markers: [{ id: "m", kind: "mob", position: { x: 0, y: 0, z: 0 } }],
        volumes: [{ id: "v", kind: "zone", shape: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 4 }],
      }),
    );
    session.dispatch({ type: "select", ids: ["m", "v"] });
    session.dispatch({ type: "removeMany", ids: ["m", "v"] });
    const doc = session.getState().document;
    expect(doc.markers).toHaveLength(0);
    expect(doc.volumes).toHaveLength(0);
    expect(session.getState().selection).toEqual([]);
  });

  test("duplicate clones with fresh ids, offset, and selects the copies", () => {
    const session = createEditorSession(
      normalizeEditorLayers({
        markers: [{ id: "m", kind: "mob", position: { x: 1, y: 0, z: 1 } }],
      }),
    );
    session.dispatch({ type: "duplicate", ids: ["m"] });
    const doc = session.getState().document;
    expect(doc.markers).toHaveLength(2);
    expect(doc.markers[1]?.id).toBe("m_copy");
    expect(doc.markers[1]?.position).toEqual({ x: 3, y: 0, z: 3 });
    expect(session.getState().selection).toEqual(["m_copy"]);
    session.dispatch({ type: "duplicate", ids: ["m"] });
    expect(session.getState().document.markers[2]?.id).toBe("m_copy2");
  });

  test("setMarker patches label and meta without touching position", () => {
    const session = createEditorSession(
      normalizeEditorLayers({
        markers: [{ id: "m", kind: "mob", position: { x: 1, y: 2, z: 3 } }],
      }),
    );
    session.dispatch({ type: "setMarker", id: "m", patch: { label: "Bandit", color: "#fff" } });
    const marker = session.getState().document.markers[0];
    expect(marker?.label).toBe("Bandit");
    expect(marker?.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  test("coalesced dispatches collapse into one undo step", () => {
    const session = createEditorSession(
      normalizeEditorLayers({
        markers: [{ id: "m", kind: "mob", position: { x: 0, y: 0, z: 0 } }],
      }),
    );
    for (const x of [1, 12, 123]) {
      session.dispatch(
        { type: "setTransform", id: "m", position: { x, y: 0, z: 0 } },
        { coalesce: "pos:x:m" },
      );
    }
    expect(session.getState().document.markers[0]?.position.x).toBe(123);
    session.dispatch({ type: "undo" });
    expect(session.getState().document.markers[0]?.position.x).toBe(0);
    expect(session.canUndo()).toBe(false);
  });

  test("a different coalesce key starts a new undo step", () => {
    const session = createEditorSession(
      normalizeEditorLayers({
        markers: [{ id: "m", kind: "mob", position: { x: 0, y: 0, z: 0 } }],
      }),
    );
    session.dispatch({ type: "setTransform", id: "m", position: { x: 5, y: 0, z: 0 } }, { coalesce: "pos:x:m" });
    session.dispatch({ type: "setTransform", id: "m", position: { x: 5, y: 7, z: 0 } }, { coalesce: "pos:y:m" });
    session.dispatch({ type: "undo" });
    expect(session.getState().document.markers[0]?.position).toEqual({ x: 5, y: 0, z: 0 });
    session.dispatch({ type: "undo" });
    expect(session.getState().document.markers[0]?.position.x).toBe(0);
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

describe("editor clipboard fragments", () => {
  test("extract pulls only the requested ids", () => {
    const doc = normalizeEditorLayers({
      markers: [
        { id: "a", kind: "mob", position: { x: 1, y: 0, z: 1 } },
        { id: "b", kind: "boss", position: { x: 5, y: 0, z: 5 } },
      ],
      volumes: [{ id: "v", kind: "zone", shape: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 4 }],
    });
    const fragment = extractEditorFragment(doc, ["a", "v"]);
    expect(fragment.markers.map((m) => m.id)).toEqual(["a"]);
    expect(fragment.volumes.map((v) => v.id)).toEqual(["v"]);
    expect(editorDocumentSize(fragment)).toBe(2);
  });

  test("addFragment pastes with offset, renames colliding ids, and selects the paste", () => {
    const session = createEditorSession(
      normalizeEditorLayers({
        markers: [{ id: "a", kind: "mob", position: { x: 1, y: 0, z: 1 } }],
      }),
    );
    const fragment = extractEditorFragment(session.getState().document, ["a"]);
    session.dispatch({ type: "addFragment", fragment, offset: { x: 2, y: 0, z: 2 } });
    const state = session.getState();
    expect(state.document.markers).toHaveLength(2);
    const pasted = state.document.markers[1]!;
    expect(pasted.id).toBe("a_copy");
    expect(pasted.position).toEqual({ x: 3, y: 0, z: 3 });
    expect(state.selection).toEqual(["a_copy"]);
    session.dispatch({ type: "undo" });
    expect(session.getState().document.markers).toHaveLength(1);
  });

  test("addFragment keeps non-colliding ids intact", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({
      type: "addFragment",
      fragment: normalizeEditorLayers({
        markers: [{ id: "fresh", kind: "poi", position: { x: 0, y: 0, z: 0 } }],
      }),
    });
    expect(session.getState().document.markers[0]?.id).toBe("fresh");
  });
});

describe("editor terrain sculpting", () => {
  const bounds = { minX: -16, minZ: -16, maxX: 16, maxZ: 16 };

  test("setTerrain then sculptTerrain raises the stored offsets, undo/redo restores", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    const snapshot = createTerrainSnapshot({ bounds, cellSize: 1 });
    session.dispatch({ type: "setTerrain", terrain: snapshot });
    expect(session.getState().document.terrain).toBeDefined();

    const live = editableTerrainFromSnapshot(session.getState().document.terrain!, flatField());
    const delta = live.editDelta({ mode: "raise", center: [0, 0], radius: 4, strength: 3 });
    session.dispatch({ type: "sculptTerrain", delta });
    const raised = session.getState().document.terrain!;
    expect(Math.max(...raised.offsets)).toBeGreaterThan(0);
    expect(session.canUndo()).toBe(true);

    session.dispatch({ type: "undo" });
    expect(Math.max(...session.getState().document.terrain!.offsets)).toBe(0);
    session.dispatch({ type: "redo" });
    expect(Math.max(...session.getState().document.terrain!.offsets)).toBeGreaterThan(0);
  });

  test("sculpt history is compact — undo of a stroke does not touch a snapshot copy", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({ type: "setTerrain", terrain: createTerrainSnapshot({ bounds, cellSize: 1 }) });
    const before = session.getState().document.terrain!;
    const live = editableTerrainFromSnapshot(before, flatField());
    const delta = live.editDelta({ mode: "raise", center: [2, 2], radius: 3, strength: 2 });
    session.dispatch({ type: "sculptTerrain", delta });
    // Copy-on-write: the pre-stroke snapshot object is untouched.
    expect(Math.max(...before.offsets)).toBe(0);
    session.dispatch({ type: "undo" });
    expect(session.getState().document.terrain!.offsets).toEqual(before.offsets);
  });

  test("terrain survives export/import round-trip and non-terrain edits", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({ type: "setTerrain", terrain: createTerrainSnapshot({ bounds, cellSize: 2 }) });
    session.dispatch({ type: "addMarker", marker: { id: "m", kind: "poi", position: { x: 0, y: 0, z: 0 } } });
    expect(session.getState().document.terrain).toBeDefined();
    session.dispatch({ type: "removeMany", ids: ["m"] });
    expect(session.getState().document.terrain).toBeDefined();

    const json = session.exportJson(true);
    const reloaded = importEditorDocumentJson(json);
    expect(reloaded.terrain).toBeDefined();
    expect(reloaded.terrain!.cols).toBe(session.getState().document.terrain!.cols);
  });

  test("clearTerrain drops the overlay", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({ type: "setTerrain", terrain: createTerrainSnapshot({ bounds, cellSize: 1 }) });
    session.dispatch({ type: "clearTerrain" });
    expect(session.getState().document.terrain).toBeUndefined();
  });

  test("paintTerrain paints surfaces with compact undo, interleaved with sculpt strokes", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({ type: "setTerrain", terrain: createTerrainSnapshot({ bounds, cellSize: 1 }) });
    const before = session.getState().document.terrain!;
    const live = editableTerrainFromSnapshot(before, flatField());

    const sculpt = live.editDelta({ mode: "raise", center: [0, 0], radius: 4, strength: 3 });
    session.dispatch({ type: "sculptTerrain", delta: sculpt });
    const paint = live.paintDelta({ mode: "paint", center: [0, 0], radius: 4, surface: "rock" });
    session.dispatch({ type: "paintTerrain", delta: paint });

    const painted = session.getState().document.terrain!;
    expect(painted.surfaces.some((s) => s === "rock")).toBe(true);
    expect(Math.max(...painted.offsets)).toBeGreaterThan(0);
    // Pre-stroke snapshot untouched (copy-on-write).
    expect(before.surfaces.every((s) => s === null)).toBe(true);

    // Undo paint only — heights stay sculpted.
    session.dispatch({ type: "undo" });
    expect(session.getState().document.terrain!.surfaces.every((s) => s === null)).toBe(true);
    expect(Math.max(...session.getState().document.terrain!.offsets)).toBeGreaterThan(0);
    // Redo restores the paint.
    session.dispatch({ type: "redo" });
    expect(session.getState().document.terrain!.surfaces.some((s) => s === "rock")).toBe(true);
  });
});
