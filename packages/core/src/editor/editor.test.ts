import { describe, expect, test } from "bun:test";

import {
  applyEditorDocumentOverlay,
  createEditorSession,
  createEmptyEditorDocument,
  createPrefabFragment,
  editorDocumentBounds,
  editorDocumentSize,
  exportEditorDocumentJson,
  extractEditorFragment,
  findEditorCatalogEntry,
  findEditorCollection,
  findEditorPrefab,
  importEditorDocumentJson,
  isEditorObjectHidden,
  isEditorObjectLocked,
  listEditorKinds,
  mergeEditorDocuments,
  normalizeEditorLayers,
  seedEditorCatalogs,
  summarizeEditorSession,
  editorParentOf,
  editorChildren,
  editorRoots,
  collectDescendants,
  wouldCreateCycle,
} from "./index";
import { decodeEditorDocument } from "./document";
import {
  createTerrainSnapshot,
  editableTerrainFromSnapshot,
  migrateTerrainSnapshot,
} from "../world/terraform";
import { flatField } from "../world/terrain";
import { resolveScatter, SCATTER_PATH_KIND } from "../world/scatterRegion";

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

  test("merge re-ids a colliding object instead of shadowing it across collections", () => {
    const a = normalizeEditorLayers({
      markers: [{ id: "shared", kind: "boss", position: { x: 0, y: 0, z: 0 } }],
    });
    const b = normalizeEditorLayers({
      volumes: [{ id: "shared", kind: "zone", shape: "sphere", center: { x: 5, y: 0, z: 5 }, radius: 10 }],
    });
    const merged = mergeEditorDocuments(a, b);
    expect(merged.markers).toHaveLength(1);
    expect(merged.volumes).toHaveLength(1);
    expect(merged.markers[0]?.id).toBe("shared");
    expect(merged.volumes[0]?.id).not.toBe("shared");
    expect(merged.volumes[0]?.id).toBe("shared_copy");
  });

  test("decodeEditorDocument reports a precise diagnostic per malformed field", () => {
    const decoded = decodeEditorDocument({
      markers: [{ id: "ok", kind: "boss", position: { x: 0, y: 0, z: 0 } }, { kind: "boss" }],
      volumes: [{ id: "v", kind: "zone", shape: "hexagon", center: { x: 0, y: 0, z: 0 } }],
      paths: "not-an-array",
    });
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error("expected decode failure");
    const paths = decoded.errors.map((e) => e.path);
    expect(paths).toContain("$.markers[1].id");
    expect(paths).toContain("$.markers[1].position");
    expect(paths).toContain("$.volumes[0].shape");
    expect(paths).toContain("$.paths");
  });

  test("decodeEditorDocument rejects a document-global duplicate id with its path", () => {
    // Same id on a marker and a volume: legal per-collection, but selection/parenting/removal treat
    // ids as one global namespace, so a single imported document that reuses one is malformed.
    const decoded = decodeEditorDocument({
      markers: [{ id: "gate", kind: "boss", position: { x: 0, y: 0, z: 0 } }],
      volumes: [{ id: "gate", kind: "zone", shape: "sphere", center: { x: 1, y: 0, z: 1 }, radius: 4 }],
    });
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error("expected decode failure");
    expect(decoded.errors).toContainEqual({ path: "$.volumes[0].id", message: 'duplicate id "gate"' });
  });

  test("importEditorDocumentJson throws on a duplicate id (import can never load a colliding id)", () => {
    const raw = JSON.stringify({
      markers: [
        { id: "dup", kind: "prop", position: { x: 0, y: 0, z: 0 } },
        { id: "dup", kind: "prop", position: { x: 1, y: 0, z: 1 } },
      ],
    });
    expect(() => importEditorDocumentJson(raw)).toThrow(/duplicate id "dup"/);
  });

  test("decodeEditorDocument round-trips a v1 document", () => {
    const original = normalizeEditorLayers({
      markers: [{ id: "boss_warrior", kind: "boss", position: { x: -80, y: 0, z: -660 }, label: "Warrior" }],
      collections: [{ id: "c1", name: "Pack", memberIds: ["boss_warrior"], locked: true }],
      catalogs: [{ id: "weapons", entries: [{ id: "bow", meta: { damage: 8 } }] }],
    });
    const decoded = decodeEditorDocument(JSON.parse(exportEditorDocumentJson(original)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("expected decode success");
    expect(decoded.document).toEqual(original);
  });

  test("decodeEditorDocument round-trips ui panel layout", () => {
    const original = normalizeEditorLayers({
      ui: {
        panels: {
          health: { anchor: "top-left", dx: 16, dy: 16, width: 220, height: 28, type: "health-bar" },
          build: { anchor: "bottom", dx: 0, dy: -12, visible: true },
        },
      },
    });
    const decoded = decodeEditorDocument(JSON.parse(exportEditorDocumentJson(original)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("expected decode success");
    expect(decoded.document.ui).toEqual(original.ui);
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

  test("addMarker re-ids instead of shadowing an existing object in a different collection", () => {
    const session = createEditorSession(
      normalizeEditorLayers({
        volumes: [{ id: "shared", kind: "zone", shape: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 5 }],
      }),
    );
    session.dispatch({ type: "addMarker", marker: { id: "shared", kind: "poi", position: { x: 1, y: 0, z: 1 } } });
    const doc = session.getState().document;
    expect(doc.volumes).toHaveLength(1);
    expect(doc.volumes[0]?.id).toBe("shared");
    expect(doc.markers).toHaveLength(1);
    expect(doc.markers[0]?.id).not.toBe("shared");
    expect(doc.markers[0]?.id).toBe("shared_copy");
  });

  test("addMarker with an existing marker id still upserts in place", () => {
    const session = createEditorSession(
      normalizeEditorLayers({
        markers: [{ id: "m", kind: "poi", position: { x: 0, y: 0, z: 0 } }],
      }),
    );
    session.dispatch({ type: "addMarker", marker: { id: "m", kind: "poi", position: { x: 9, y: 0, z: 9 } } });
    const doc = session.getState().document;
    expect(doc.markers).toHaveLength(1);
    expect(doc.markers[0]?.id).toBe("m");
    expect(doc.markers[0]?.position).toEqual({ x: 9, y: 0, z: 9 });
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

describe("editor hierarchy / parenting", () => {
  function scene() {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({ type: "addMarker", marker: { id: "parent", kind: "poi", position: { x: 0, y: 0, z: 0 } } });
    session.dispatch({ type: "addMarker", marker: { id: "child", kind: "prop", position: { x: 10, y: 0, z: 0 } } });
    session.dispatch({ type: "addMarker", marker: { id: "grandchild", kind: "prop", position: { x: 20, y: 0, z: 0 } } });
    return session;
  }

  test("setParent builds a tree and roots/children/descendants report it", () => {
    const session = scene();
    session.dispatch({ type: "setParent", ids: ["child"], parentId: "parent" });
    session.dispatch({ type: "setParent", ids: ["grandchild"], parentId: "child" });
    const doc = session.getState().document;
    expect(editorParentOf(doc, "child")).toBe("parent");
    expect(editorChildren(doc, "parent")).toEqual(["child"]);
    expect(editorRoots(doc)).toEqual(["parent"]);
    expect([...collectDescendants(doc, ["parent"])].sort()).toEqual(["child", "grandchild"]);
  });

  test("setParent rejects cycles", () => {
    const session = scene();
    session.dispatch({ type: "setParent", ids: ["child"], parentId: "parent" });
    session.dispatch({ type: "setParent", ids: ["parent"], parentId: "child" });
    // parent stays a root — the cycle was refused.
    expect(editorParentOf(session.getState().document, "parent")).toBeUndefined();
    expect(wouldCreateCycle(session.getState().document, "parent", "child")).toBe(true);
  });

  test("moving a parent carries its whole subtree by the same delta", () => {
    const session = scene();
    session.dispatch({ type: "setParent", ids: ["child"], parentId: "parent" });
    session.dispatch({ type: "setParent", ids: ["grandchild"], parentId: "child" });
    session.dispatch({ type: "setTransform", id: "parent", position: { x: 5, y: 0, z: 5 } });
    const doc = session.getState().document;
    expect(doc.markers.find((m) => m.id === "child")!.position).toEqual({ x: 15, y: 0, z: 5 });
    expect(doc.markers.find((m) => m.id === "grandchild")!.position).toEqual({ x: 25, y: 0, z: 5 });
  });

  test("translate also carries descendants, and undo restores the tree", () => {
    const session = scene();
    session.dispatch({ type: "setParent", ids: ["child"], parentId: "parent" });
    session.dispatch({ type: "translate", ids: ["parent"], delta: { x: 0, y: 0, z: 10 } });
    expect(session.getState().document.markers.find((m) => m.id === "child")!.position.z).toBe(10);
    session.dispatch({ type: "undo" });
    expect(session.getState().document.markers.find((m) => m.id === "child")!.position.z).toBe(0);
  });

  test("parentId survives export/import", () => {
    const session = scene();
    session.dispatch({ type: "setParent", ids: ["child"], parentId: "parent" });
    const reloaded = importEditorDocumentJson(session.exportJson(true));
    expect(editorParentOf(reloaded, "child")).toBe("parent");
  });
});

describe("editor prefabs", () => {
  function campScene() {
    return createEditorSession(
      normalizeEditorLayers({
        markers: [
          { id: "tent", kind: "prop", position: { x: 10, y: 0, z: 10 } },
          { id: "fire", kind: "prop", position: { x: 14, y: 0, z: 10 } },
        ],
      }),
    );
  }

  test("createPrefab centers the fragment on its own bounds centroid", () => {
    const session = campScene();
    session.dispatch({ type: "createPrefab", id: "camp", name: "Camp", ids: ["tent", "fire"] });
    const prefab = findEditorPrefab(session.getState().document, "camp");
    expect(prefab).toBeDefined();
    const xs = prefab!.fragment.markers.map((m) => m.position.x).sort((a, b) => a - b);
    expect(xs).toEqual([-2, 2]);
  });

  test("insertPrefab stamps a fresh, tagged instance at the target point", () => {
    const session = campScene();
    session.dispatch({ type: "createPrefab", id: "camp", name: "Camp", ids: ["tent", "fire"] });
    session.dispatch({ type: "insertPrefab", prefabId: "camp", at: { x: 100, y: 0, z: 0 }, instanceId: "camp_1" });
    const doc = session.getState().document;
    expect(doc.markers).toHaveLength(4);
    const instanceMarkers = doc.markers.filter((m) => m.meta?.prefabInstanceId === "camp_1");
    expect(instanceMarkers).toHaveLength(2);
    for (const marker of instanceMarkers) expect(marker.meta?.prefabId).toBe("camp");
    const xs = instanceMarkers.map((m) => m.position.x).sort((a, b) => a - b);
    expect(xs).toEqual([98, 102]);
    expect(session.getState().selection).toHaveLength(2);
  });

  test("insertPrefab twice renames ids and tags each with its own instance id", () => {
    const session = campScene();
    session.dispatch({ type: "createPrefab", id: "camp", name: "Camp", ids: ["tent", "fire"] });
    session.dispatch({ type: "insertPrefab", prefabId: "camp", at: { x: 0, y: 0, z: 0 } });
    session.dispatch({ type: "insertPrefab", prefabId: "camp", at: { x: 50, y: 0, z: 0 } });
    const doc = session.getState().document;
    expect(doc.markers).toHaveLength(6);
    const ids = new Set(doc.markers.map((m) => m.id));
    expect(ids.size).toBe(6);
    const instanceIds = new Set(doc.markers.map((m) => m.meta?.prefabInstanceId).filter((id) => id !== undefined));
    expect(instanceIds.size).toBe(2);
  });

  test("detachPrefabInstance strips the link but keeps the content", () => {
    const session = campScene();
    session.dispatch({ type: "createPrefab", id: "camp", name: "Camp", ids: ["tent", "fire"] });
    session.dispatch({ type: "insertPrefab", prefabId: "camp", at: { x: 0, y: 0, z: 0 }, instanceId: "camp_1" });
    session.dispatch({ type: "detachPrefabInstance", instanceId: "camp_1" });
    const doc = session.getState().document;
    expect(doc.markers).toHaveLength(4);
    for (const marker of doc.markers) {
      expect(marker.meta?.prefabInstanceId).toBeUndefined();
      expect(marker.meta?.prefabId).toBeUndefined();
    }
  });

  test("deletePrefab removes it from the library without touching placed instances", () => {
    const session = campScene();
    session.dispatch({ type: "createPrefab", id: "camp", name: "Camp", ids: ["tent", "fire"] });
    session.dispatch({ type: "insertPrefab", prefabId: "camp", at: { x: 0, y: 0, z: 0 } });
    session.dispatch({ type: "deletePrefab", prefabId: "camp" });
    expect(findEditorPrefab(session.getState().document, "camp")).toBeUndefined();
    expect(session.getState().document.markers).toHaveLength(4);
  });

  test("prefab library survives export/import", () => {
    const session = campScene();
    session.dispatch({ type: "createPrefab", id: "camp", name: "Camp", ids: ["tent", "fire"] });
    const reloaded = importEditorDocumentJson(session.exportJson(true));
    expect(findEditorPrefab(reloaded, "camp")?.fragment.markers).toHaveLength(2);
  });
});

describe("editor collections / selection sets", () => {
  function threeMobs() {
    return createEditorSession(
      normalizeEditorLayers({
        markers: [
          { id: "a", kind: "mob", position: { x: 0, y: 0, z: 0 } },
          { id: "b", kind: "mob", position: { x: 1, y: 0, z: 0 } },
          { id: "c", kind: "mob", position: { x: 2, y: 0, z: 0 } },
        ],
      }),
    );
  }

  test("createCollection, add/remove members, and selectCollection restores the set", () => {
    const session = threeMobs();
    session.dispatch({ type: "createCollection", id: "pack", name: "Wolf pack", memberIds: ["a", "b"] });
    session.dispatch({ type: "addToCollection", id: "pack", ids: ["c"] });
    expect(findEditorCollection(session.getState().document, "pack")?.memberIds).toEqual(["a", "b", "c"]);
    session.dispatch({ type: "removeFromCollection", id: "pack", ids: ["b"] });
    expect(findEditorCollection(session.getState().document, "pack")?.memberIds).toEqual(["a", "c"]);

    session.dispatch({ type: "select", ids: [] });
    session.dispatch({ type: "selectCollection", id: "pack" });
    expect(session.getState().selection).toEqual(["a", "c"]);
  });

  test("renameCollection and setCollectionFlags patch color/locked/visible", () => {
    const session = threeMobs();
    session.dispatch({ type: "createCollection", id: "pack", name: "Pack", memberIds: ["a"] });
    session.dispatch({ type: "renameCollection", id: "pack", name: "Wolf pack" });
    session.dispatch({ type: "setCollectionFlags", id: "pack", patch: { color: "#f00", locked: true, visible: false } });
    const collection = findEditorCollection(session.getState().document, "pack")!;
    expect(collection.name).toBe("Wolf pack");
    expect(collection.color).toBe("#f00");
    expect(collection.locked).toBe(true);
    expect(collection.visible).toBe(false);
  });

  test("a locked collection blocks translate/setTransform/remove on its members", () => {
    const session = threeMobs();
    session.dispatch({ type: "createCollection", id: "pack", name: "Pack", memberIds: ["a", "b"] });
    session.dispatch({ type: "setCollectionFlags", id: "pack", patch: { locked: true } });
    expect(isEditorObjectLocked(session.getState().document, "a")).toBe(true);

    session.dispatch({ type: "setTransform", id: "a", position: { x: 99, y: 0, z: 0 } });
    expect(session.getState().document.markers.find((m) => m.id === "a")!.position.x).toBe(0);

    session.dispatch({ type: "translate", ids: ["a", "b", "c"], delta: { x: 5, y: 0, z: 0 } });
    const doc = session.getState().document;
    expect(doc.markers.find((m) => m.id === "a")!.position.x).toBe(0);
    expect(doc.markers.find((m) => m.id === "b")!.position.x).toBe(1);
    expect(doc.markers.find((m) => m.id === "c")!.position.x).toBe(7);

    session.dispatch({ type: "remove", id: "a" });
    expect(session.getState().document.markers.some((m) => m.id === "a")).toBe(true);

    session.dispatch({ type: "removeMany", ids: ["a", "c"] });
    const remaining = session.getState().document.markers.map((m) => m.id);
    expect(remaining).toContain("a");
    expect(remaining).not.toContain("c");
  });

  test("setObjectFlags locks and hides a placeable; lock blocks move/delete; flags round-trip", () => {
    const session = threeMobs();
    session.dispatch({ type: "setObjectFlags", ids: ["a"], patch: { locked: true, hidden: true } });
    const lockedDoc = session.getState().document;
    expect(lockedDoc.markers.find((m) => m.id === "a")!.locked).toBe(true);
    expect(lockedDoc.markers.find((m) => m.id === "a")!.hidden).toBe(true);
    expect(isEditorObjectLocked(lockedDoc, "a")).toBe(true);
    expect(isEditorObjectHidden(lockedDoc, "a")).toBe(true);
    expect(isEditorObjectLocked(lockedDoc, "b")).toBe(false);

    session.dispatch({ type: "setTransform", id: "a", position: { x: 99, y: 0, z: 0 } });
    expect(session.getState().document.markers.find((m) => m.id === "a")!.position.x).toBe(0);
    session.dispatch({ type: "remove", id: "a" });
    expect(session.getState().document.markers.some((m) => m.id === "a")).toBe(true);

    // Clearing flags removes the keys so export stays compact.
    session.dispatch({ type: "setObjectFlags", ids: ["a"], patch: { locked: false, hidden: false } });
    const cleared = session.getState().document.markers.find((m) => m.id === "a")!;
    expect(cleared.locked).toBeUndefined();
    expect(cleared.hidden).toBeUndefined();
    expect(isEditorObjectLocked(session.getState().document, "a")).toBe(false);

    session.dispatch({ type: "setObjectFlags", ids: ["b", "c"], patch: { hidden: true } });
    const reloaded = importEditorDocumentJson(session.exportJson(true));
    expect(reloaded.markers.find((m) => m.id === "b")!.hidden).toBe(true);
    expect(reloaded.markers.find((m) => m.id === "c")!.hidden).toBe(true);
    expect(reloaded.markers.find((m) => m.id === "a")!.hidden).toBeUndefined();
  });

  test("object lock and collection lock both count; clearing object lock leaves collection lock", () => {
    const session = threeMobs();
    session.dispatch({ type: "createCollection", id: "pack", name: "Pack", memberIds: ["a"] });
    session.dispatch({ type: "setCollectionFlags", id: "pack", patch: { locked: true } });
    session.dispatch({ type: "setObjectFlags", ids: ["a"], patch: { locked: true } });
    expect(isEditorObjectLocked(session.getState().document, "a")).toBe(true);
    session.dispatch({ type: "setObjectFlags", ids: ["a"], patch: { locked: false } });
    expect(session.getState().document.markers.find((m) => m.id === "a")!.locked).toBeUndefined();
    expect(isEditorObjectLocked(session.getState().document, "a")).toBe(true);
  });

  test("deleteCollection drops it and removing a member prunes stale collection references", () => {
    const session = threeMobs();
    session.dispatch({ type: "createCollection", id: "pack", name: "Pack", memberIds: ["a", "b"] });
    session.dispatch({ type: "removeMany", ids: ["b"] });
    expect(findEditorCollection(session.getState().document, "pack")?.memberIds).toEqual(["a"]);
    session.dispatch({ type: "deleteCollection", id: "pack" });
    expect(findEditorCollection(session.getState().document, "pack")).toBeUndefined();
  });

  test("collections survive export/import", () => {
    const session = threeMobs();
    session.dispatch({ type: "createCollection", id: "pack", name: "Pack", memberIds: ["a", "b"] });
    const reloaded = importEditorDocumentJson(session.exportJson(true));
    expect(findEditorCollection(reloaded, "pack")?.memberIds).toEqual(["a", "b"]);
  });
});

describe("editor batch property edit and material assignment", () => {
  test("batchSetProperties patches color/label/meta across kinds in one dispatch", () => {
    const session = createEditorSession(
      normalizeEditorLayers({
        markers: [{ id: "m", kind: "mob", position: { x: 0, y: 0, z: 0 } }],
        volumes: [{ id: "v", kind: "zone", shape: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 4 }],
      }),
    );
    session.dispatch({
      type: "batchSetProperties",
      ids: ["m", "v"],
      patch: { color: "#0ff", meta: { tier: 2 } },
    });
    const doc = session.getState().document;
    expect(doc.markers[0]?.color).toBe("#0ff");
    expect(doc.markers[0]?.meta?.tier).toBe(2);
    expect(doc.volumes[0]?.color).toBe("#0ff");
    expect(doc.volumes[0]?.meta?.tier).toBe(2);
  });

  test("assignMaterial stamps meta.materialId on every targeted object", () => {
    const session = createEditorSession(
      normalizeEditorLayers({
        markers: [{ id: "rock", kind: "prop", position: { x: 0, y: 0, z: 0 } }],
      }),
    );
    session.dispatch({ type: "assignMaterial", ids: ["rock"], materialId: "granite" });
    expect(session.getState().document.markers[0]?.meta?.materialId).toBe("granite");
    session.dispatch({ type: "assignMaterial", ids: ["rock"], materialId: "sandstone" });
    expect(session.getState().document.markers[0]?.meta?.materialId).toBe("sandstone");
  });
});

describe("editor prefab/fragment helper", () => {
  test("createPrefabFragment centers a single object at the origin", () => {
    const doc = normalizeEditorLayers({
      markers: [{ id: "solo", kind: "prop", position: { x: 40, y: 2, z: -8 } }],
    });
    const fragment = createPrefabFragment(doc, ["solo"]);
    expect(fragment.markers[0]?.position).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("terrain material layers + blend commands", () => {
  const bounds = { minX: -16, minZ: -16, maxX: 16, maxZ: 16 };

  test("setTerrainLayers stores the stack; a params-only edit keeps blend weights", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({ type: "setTerrain", terrain: createTerrainSnapshot({ bounds, cellSize: 2 }) });
    session.dispatch({
      type: "setTerrainLayers",
      layers: [
        { id: "grass", surface: "grass" },
        { id: "dirt", surface: "dirt" },
      ],
    });
    const live = editableTerrainFromSnapshot(session.getState().document.terrain!);
    const delta = live.blendPaintDelta({ mode: "paint", center: [0, 0], radius: 6, surface: "dirt", strength: 1 });
    session.dispatch({ type: "blendTerrain", delta });
    expect(session.getState().document.terrain!.weights).toBeDefined();

    // Params-only edit (same ids/order) preserves weights.
    session.dispatch({
      type: "setTerrainLayers",
      layers: [
        { id: "grass", surface: "grass", roughness: 0.5 },
        { id: "dirt", surface: "dirt", tint: "#ff0000" },
      ],
    });
    expect(session.getState().document.terrain!.weights).toBeDefined();
    expect(session.getState().document.terrain!.layers?.[1]?.tint).toBe("#ff0000");
  });

  test("blendTerrain undo/redo round-trips the dominant surface", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({ type: "setTerrain", terrain: createTerrainSnapshot({ bounds, cellSize: 2 }) });
    session.dispatch({
      type: "setTerrainLayers",
      layers: [
        { id: "grass", surface: "grass" },
        { id: "dirt", surface: "dirt" },
      ],
    });
    // Seed all-grass so a dominant exists before blending.
    const seed = editableTerrainFromSnapshot(session.getState().document.terrain!);
    session.dispatch({ type: "paintTerrain", delta: seed.fillSurfaceDelta("grass") });

    const live = editableTerrainFromSnapshot(session.getState().document.terrain!);
    const delta = live.blendPaintDelta({ mode: "paint", center: [0, 0], radius: 6, surface: "dirt", strength: 1 });
    session.dispatch({ type: "blendTerrain", delta });
    const blended = editableTerrainFromSnapshot(session.getState().document.terrain!);
    expect(blended.surfaceAt(0, 0)).toBe("dirt");

    session.dispatch({ type: "undo" });
    const undone = editableTerrainFromSnapshot(session.getState().document.terrain!);
    expect(undone.surfaceAt(0, 0)).toBe("grass");
  });

  test("layers survive export/import via migration", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    const painted = editableTerrainFromSnapshot(createTerrainSnapshot({ bounds, cellSize: 2 }));
    painted.applySurfaceDelta(painted.fillSurfaceDelta("sand"));
    session.dispatch({ type: "setTerrain", terrain: migrateTerrainSnapshot(painted.snapshot()) });
    const reloaded = importEditorDocumentJson(session.exportJson(true));
    expect(reloaded.terrain?.layers?.map((l) => l.surface)).toEqual(["sand"]);
  });
});

describe("convertScatterToObjects command", () => {
  test("detaches a scatter region into individual markers and removes the path", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({
      type: "addPath",
      path: {
        id: "grove",
        kind: SCATTER_PATH_KIND,
        points: [
          { x: -8, y: 0, z: -8 },
          { x: 8, y: 0, z: -8 },
          { x: 8, y: 0, z: 8 },
          { x: -8, y: 0, z: 8 },
        ],
        meta: { density: 0.3, item: "tree" },
      },
    });
    const instances = resolveScatter(session.getState().document, flatField());
    expect(instances.length).toBeGreaterThan(0);
    const markers = instances.map((instance) => ({
      id: instance.id.replace(/[^a-zA-Z0-9_]/g, "_"),
      kind: "prop",
      position: { x: instance.x, y: instance.y, z: instance.z },
      rotationY: instance.rotationY,
      meta: { item: instance.item, scale: instance.scale },
    }));
    session.dispatch({ type: "convertScatterToObjects", pathId: "grove", markers });
    const doc = session.getState().document;
    expect(doc.paths.find((p) => p.id === "grove")).toBeUndefined();
    expect(doc.markers.length).toBe(instances.length);
    expect(doc.markers.every((m) => m.meta?.item === "tree")).toBe(true);
    // Undo restores the region.
    session.dispatch({ type: "undo" });
    expect(session.getState().document.paths.find((p) => p.id === "grove")).toBeDefined();
    expect(session.getState().document.markers.length).toBe(0);
  });
});

describe("minimap bake persistence (#1036)", () => {
  const bake = () => ({
    background: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    bounds: { minX: -10, minZ: -20, maxX: 30, maxZ: 40 },
  });

  test("minimap survives decode/clone/normalize/overlay and a delete pass", () => {
    const doc = { ...createEmptyEditorDocument(), minimap: bake() };

    // Decode round-trip through JSON keeps the PNG + bounds.
    const decoded = decodeEditorDocument(JSON.parse(exportEditorDocumentJson(doc)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("expected ok");
    expect(decoded.document.minimap).toEqual(bake());

    // normalizeEditorLayers (the game load path) carries it.
    expect(normalizeEditorLayers(doc).minimap).toEqual(bake());

    // Overlay: base bake shows through when the overlay has none.
    const overlaid = applyEditorDocumentOverlay(doc, createEmptyEditorDocument());
    expect(overlaid.minimap).toEqual(bake());

    // The removeMany strip trap: unrelated deletes must not wipe the stored bake.
    const session = createEditorSession({
      ...createEmptyEditorDocument(),
      markers: [{ id: "m", kind: "prop", position: { x: 0, y: 0, z: 0 } }],
      minimap: bake(),
    });
    session.dispatch({ type: "removeMany", ids: ["m"] });
    expect(session.getState().document.markers.length).toBe(0);
    expect(session.getState().document.minimap).toEqual(bake());
  });

  test("malformed background/bounds surface a diagnostic", () => {
    const badBackground = decodeEditorDocument({
      ...createEmptyEditorDocument(),
      minimap: { background: "not-a-data-uri", bounds: { minX: 0, minZ: 0, maxX: 1, maxZ: 1 } },
    });
    expect(badBackground.ok).toBe(false);
    if (badBackground.ok) throw new Error("expected failure");
    expect(badBackground.errors.some((e) => e.path === "$.minimap.background")).toBe(true);

    const badBounds = decodeEditorDocument({
      ...createEmptyEditorDocument(),
      minimap: { background: "data:image/png;base64,AAAA", bounds: { minX: 0, minZ: 0, maxX: Infinity } },
    });
    expect(badBounds.ok).toBe(false);
    if (badBounds.ok) throw new Error("expected failure");
    expect(badBounds.errors.some((e) => e.path === "$.minimap.bounds")).toBe(true);
  });

  test("setMinimapBake is undoable and restores the prior minimap", () => {
    const first = bake();
    const second = { background: "data:image/png;base64,AAAA", bounds: { minX: 1, minZ: 2, maxX: 3, maxZ: 4 } };
    const session = createEditorSession({ ...createEmptyEditorDocument(), minimap: first });
    session.dispatch({ type: "setMinimapBake", minimap: second });
    expect(session.getState().document.minimap).toEqual(second);
    session.dispatch({ type: "undo" });
    expect(session.getState().document.minimap).toEqual(first);
    session.dispatch({ type: "redo" });
    expect(session.getState().document.minimap).toEqual(second);
  });
});
