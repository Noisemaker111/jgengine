import { describe, expect, test } from "bun:test";

import { createEditorHost } from "./session";

describe("editor host RPC", () => {
  test("scene_summary and set_transform", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: {
        markers: [{ id: "boss_warrior", kind: "boss", position: { x: -80, y: 0, z: -660 } }],
        volumes: [
          {
            id: "zone_a",
            kind: "zone",
            shape: "cylinder",
            center: { x: 0, y: 0, z: 0 },
            radius: 100,
            height: 20,
          },
        ],
      },
    });

    const summary = api.handle({ method: "scene_summary" });
    expect(summary.ok).toBe(true);
    expect((summary.result as { markers: number }).markers).toBe(1);

    const moved = api.handle({ method: "set_transform", id: "boss_warrior", x: -100, z: -700 });
    expect(moved.ok).toBe(true);

    const marker = api.handle({ method: "get_marker", id: "boss_warrior" });
    expect(marker.ok).toBe(true);
    expect((marker.result as { position: { x: number } }).position.x).toBe(-100);

    const exported = api.handle({ method: "export_document" });
    expect(exported.ok).toBe(true);
    expect((exported.result as { json: string }).json).toContain("boss_warrior");

    dispose();
  });

  test("place_asset and list_assets", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: {},
      assets: [{ id: "rock_01", label: "Rock", kind: "model", url: "/models/rock.glb" }],
    });
    api.setFocusTarget({ x: 10, y: 0, z: 20 });
    const listed = api.handle({ method: "list_assets" });
    expect(listed.ok).toBe(true);
    expect((listed.result as { assets: { id: string }[] }).assets[0]?.id).toBe("rock_01");

    const placed = api.handle({ method: "place_asset", id: "rock_01" });
    expect(placed.ok).toBe(true);
    const id = (placed.result as { id: string }).id;
    const marker = api.getSession().getState().document.markers.find((item) => item.id === id);
    expect(marker?.position.x).toBe(10);
    expect(marker?.position.z).toBe(20);
    expect(marker?.meta?.assetId).toBe("rock_01");
    dispose();
  });

  test("set_mode switches modes, notifies subscribers, and rejects junk", () => {
    const { api, dispose } = createEditorHost({ gameId: "test", layers: {} });
    expect(api.getMode()).toBe("edit");

    let seen: string | null = null;
    const unsub = api.subscribeMode((mode) => {
      seen = mode;
    });

    const played = api.handle({ method: "set_mode", mode: "play" });
    expect(played.ok).toBe(true);
    expect(api.getMode()).toBe("play");
    expect(seen).toBe("play");

    const status = api.handle({ method: "editor_status" });
    expect((status.result as { mode: string }).mode).toBe("play");

    const junk = api.handle({ method: "set_mode", mode: "flycam" as never });
    expect(junk.ok).toBe(false);
    expect(api.getMode()).toBe("play");

    unsub();
    dispose();
  });

  test("create_terrain, sculpt_terrain, and terrain_summary drive an undoable heightfield", () => {
    const { api, dispose } = createEditorHost({ gameId: "test", layers: {} });

    const empty = api.handle({ method: "terrain_summary" });
    expect((empty.result as { terrain: null }).terrain).toBeNull();

    const created = api.handle({ method: "create_terrain", width: 64, depth: 64, cellSize: 2 });
    expect(created.ok).toBe(true);

    const sculpted = api.handle({ method: "sculpt_terrain", mode: "raise", x: 0, z: 0, radius: 10, strength: 4 });
    expect(sculpted.ok).toBe(true);
    expect((sculpted.result as { changed: number }).changed).toBeGreaterThan(0);

    const summary = api.handle({ method: "terrain_summary" });
    expect((summary.result as { maxOffset: number }).maxOffset).toBeGreaterThan(0);
    expect((summary.result as { editedVertices: number }).editedVertices).toBeGreaterThan(0);

    const undone = api.handle({ method: "undo" });
    expect(undone.ok).toBe(true);
    expect((api.handle({ method: "terrain_summary" }).result as { maxOffset: number }).maxOffset).toBe(0);

    // Sculpting before creating terrain fails cleanly.
    const { api: bare, dispose: disposeBare } = createEditorHost({ gameId: "test2", layers: {} });
    const noTerrain = bare.handle({ method: "sculpt_terrain", mode: "raise", x: 0, z: 0 });
    expect(noTerrain.ok).toBe(false);
    disposeBare();
    dispose();
  });

  test("paint_terrain, fill_terrain, auto_paint, and terrain_materials drive undoable surface paint", () => {
    const { api, dispose } = createEditorHost({ gameId: "test", layers: {} });
    api.handle({ method: "create_terrain", width: 64, depth: 64, cellSize: 2 });

    const materials = api.handle({ method: "terrain_materials" });
    expect((materials.result as { materials: { id: string }[] }).materials.length).toBeGreaterThan(0);

    const painted = api.handle({ method: "paint_terrain", surface: "rock", x: 0, z: 0, radius: 12 });
    expect(painted.ok).toBe(true);
    expect((painted.result as { changed: number }).changed).toBeGreaterThan(0);
    expect((api.handle({ method: "terrain_summary" }).result as { paintedCells: number }).paintedCells).toBeGreaterThan(0);

    api.handle({ method: "undo" });
    expect((api.handle({ method: "terrain_summary" }).result as { paintedCells: number }).paintedCells).toBe(0);

    const filled = api.handle({ method: "fill_terrain", surface: "grass" });
    expect((filled.result as { changed: number }).changed).toBeGreaterThan(0);
    const cleared = api.handle({ method: "fill_terrain", surface: null });
    expect((cleared.result as { changed: number }).changed).toBeGreaterThan(0);

    const auto = api.handle({ method: "auto_paint", surface: "sand", maxHeight: 100 });
    expect((auto.result as { changed: number }).changed).toBeGreaterThan(0);
    dispose();
  });

  test("add_foliage creates a scatter region and scatter_summary counts placements", () => {
    const { api, dispose } = createEditorHost({ gameId: "test", layers: {} });
    expect((api.handle({ method: "scatter_summary" }).result as { regions: number }).regions).toBe(0);

    const added = api.handle({
      method: "add_foliage",
      points: [
        { x: -20, z: -20 },
        { x: 20, z: -20 },
        { x: 20, z: 20 },
        { x: -20, z: 20 },
      ],
      density: 0.3,
      item: "tree",
    });
    expect(added.ok).toBe(true);
    expect((added.result as { estimate: { count: number } }).estimate.count).toBeGreaterThan(0);

    const summary = api.handle({ method: "scatter_summary" });
    expect((summary.result as { regions: number }).regions).toBe(1);
    expect((summary.result as { instances: number }).instances).toBeGreaterThan(0);

    const tooFew = api.handle({ method: "add_foliage", points: [{ x: 0, z: 0 }, { x: 1, z: 1 }] });
    expect(tooFew.ok).toBe(false);
    dispose();
  });

  test("set_parent builds a hierarchy, refuses cycles, and carries the subtree on move", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: {
        markers: [
          { id: "parent", kind: "poi", position: { x: 0, y: 0, z: 0 } },
          { id: "child", kind: "prop", position: { x: 10, y: 0, z: 0 } },
        ],
      },
    });
    const parented = api.handle({ method: "set_parent", ids: ["child"], parentId: "parent" });
    expect(parented.ok).toBe(true);
    expect((api.handle({ method: "hierarchy" }).result as { roots: string[] }).roots).toEqual(["parent"]);

    // Cycle refused: parent stays a root.
    api.handle({ method: "set_parent", ids: ["parent"], parentId: "child" });
    expect((api.handle({ method: "hierarchy" }).result as { roots: string[] }).roots).toEqual(["parent"]);

    api.handle({ method: "set_transform", id: "parent", x: 5, z: 5 });
    expect((api.handle({ method: "get_marker", id: "child" }).result as { position: { x: number } }).position.x).toBe(15);
    dispose();
  });

  test("subscribeFocus fires on camera_goto", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: {
        markers: [{ id: "a", kind: "poi", position: { x: 5, y: 1, z: 7 } }],
      },
    });
    let seen: { x: number; y: number; z: number } | null = null;
    const unsub = api.subscribeFocus((target) => {
      seen = target;
    });
    api.handle({ method: "camera_goto", id: "a" });
    expect(seen).toEqual({ x: 5, y: 1, z: 7 });
    unsub();
    dispose();
  });
});
