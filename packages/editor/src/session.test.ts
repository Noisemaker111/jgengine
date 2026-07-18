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
    // URL-backed catalog models also stamp catalogId so AuthoredObjects places the mesh.
    expect(marker?.catalogId).toBe("rock_01");
    expect(marker?.meta?.url).toBe("/models/rock.glb");
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

    const hud = api.handle({ method: "set_mode", mode: "hud" });
    expect(hud.ok).toBe(true);
    expect(api.getMode()).toBe("hud");
    expect(seen).toBe("hud");

    const junk = api.handle({ method: "set_mode", mode: "flycam" as never });
    expect(junk.ok).toBe(false);
    expect(api.getMode()).toBe("hud");

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

    // Cycle refused: parent stays a root, and the RPC reports the rejection honestly.
    const cyclic = api.handle({ method: "set_parent", ids: ["parent"], parentId: "child" });
    expect(cyclic.ok).toBe(false);
    expect((api.handle({ method: "hierarchy" }).result as { roots: string[] }).roots).toEqual(["parent"]);

    api.handle({ method: "set_transform", id: "parent", x: 5, z: 5 });
    expect((api.handle({ method: "get_marker", id: "child" }).result as { position: { x: number } }).position.x).toBe(15);
    dispose();
  });

  test("create_prefab / insert_prefab / detach_prefab_instance / delete_prefab", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: {
        markers: [
          { id: "tent", kind: "prop", position: { x: 10, y: 0, z: 10 } },
          { id: "fire", kind: "prop", position: { x: 14, y: 0, z: 10 } },
        ],
      },
    });

    const created = api.handle({ method: "create_prefab", id: "camp", name: "Camp", ids: ["tent", "fire"] });
    expect(created.ok).toBe(true);
    expect((created.result as { name: string }).name).toBe("Camp");

    api.setFocusTarget({ x: 100, y: 0, z: 0 });
    const inserted = api.handle({ method: "insert_prefab", prefabId: "camp" });
    expect(inserted.ok).toBe(true);
    expect((inserted.result as { markers: number }).markers).toBe(4);

    const doc = api.getSession().getState().document;
    const instanceId = doc.markers.find((m) => m.meta?.prefabId === "camp")?.meta?.prefabInstanceId as string;
    expect(instanceId).toBeDefined();

    const detached = api.handle({ method: "detach_prefab_instance", instanceId });
    expect(detached.ok).toBe(true);
    expect(api.getSession().getState().document.markers.every((m) => m.meta?.prefabId === undefined)).toBe(true);

    const listed = api.handle({ method: "list_prefabs" });
    expect((listed.result as { prefabs: { id: string }[] }).prefabs).toHaveLength(1);
    const deleted = api.handle({ method: "delete_prefab", prefabId: "camp" });
    expect((deleted.result as { prefabs: unknown[] }).prefabs).toHaveLength(0);
    dispose();
  });

  test("collections: create, membership, flags, select_collection, and locked members", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: {
        markers: [
          { id: "a", kind: "mob", position: { x: 0, y: 0, z: 0 } },
          { id: "b", kind: "mob", position: { x: 1, y: 0, z: 0 } },
        ],
      },
    });

    api.handle({ method: "create_collection", id: "pack", name: "Pack", memberIds: ["a"] });
    api.handle({ method: "add_to_collection", id: "pack", ids: ["b"] });
    const list = api.handle({ method: "list_collections" });
    expect((list.result as { collections: { memberIds: string[] }[] }).collections[0]?.memberIds).toEqual(["a", "b"]);

    const selected = api.handle({ method: "select_collection", id: "pack" });
    expect((selected.result as { selection: string[] }).selection).toEqual(["a", "b"]);

    api.handle({ method: "set_collection_flags", id: "pack", locked: true });
    const moved = api.handle({ method: "set_transform", id: "a", x: 50 });
    expect(moved.ok).toBe(false);
    expect(api.getSession().getState().document.markers.find((m) => m.id === "a")?.position.x).toBe(0);

    api.handle({ method: "set_collection_flags", id: "pack", locked: false });
    api.handle({ method: "delete_collection", id: "pack" });
    expect((api.handle({ method: "list_collections" }).result as { collections: unknown[] }).collections).toHaveLength(0);
    dispose();
  });

  test("batch_set_properties and assign_material", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: {
        markers: [{ id: "m", kind: "mob", position: { x: 0, y: 0, z: 0 } }],
        volumes: [{ id: "v", kind: "zone", shape: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 4 }],
      },
    });

    const batch = api.handle({
      method: "batch_set_properties",
      ids: ["m", "v"],
      color: "#0ff",
      meta: { tier: 3 },
    });
    expect(batch.ok).toBe(true);
    const doc = api.getSession().getState().document;
    expect(doc.markers[0]?.color).toBe("#0ff");
    expect(doc.volumes[0]?.meta?.tier).toBe(3);

    const assigned = api.handle({ method: "assign_material", ids: ["m"], materialId: "granite" });
    expect(assigned.ok).toBe(true);
    expect(api.getSession().getState().document.markers[0]?.meta?.materialId).toBe("granite");
    dispose();
  });

  test("set_object_flags locks and hides placeables via RPC", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: {
        markers: [
          { id: "a", kind: "mob", position: { x: 0, y: 0, z: 0 } },
          { id: "b", kind: "mob", position: { x: 1, y: 0, z: 0 } },
        ],
      },
    });

    const locked = api.handle({ method: "set_object_flags", ids: ["a"], locked: true, hidden: true });
    expect(locked.ok).toBe(true);
    const marker = api.getSession().getState().document.markers.find((m) => m.id === "a");
    expect(marker?.locked).toBe(true);
    expect(marker?.hidden).toBe(true);

    const moved = api.handle({ method: "set_transform", id: "a", x: 50 });
    expect(moved.ok).toBe(false);

    expect(api.handle({ method: "set_object_flags", ids: ["nope"], locked: true }).ok).toBe(false);
    expect(api.handle({ method: "set_object_flags", ids: ["b"] }).ok).toBe(false);

    api.handle({ method: "set_object_flags", ids: ["a"], locked: false, hidden: false });
    const cleared = api.getSession().getState().document.markers.find((m) => m.id === "a");
    expect(cleared?.locked).toBeUndefined();
    expect(cleared?.hidden).toBeUndefined();
    dispose();
  });

  test("rejected mutations return ok:false with a reason (#1016)", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: {
        markers: [{ id: "m", kind: "mob", position: { x: 0, y: 0, z: 0 } }],
      },
    });

    // Collection/prefab verbs targeting a missing object no longer report a phantom success.
    expect(api.handle({ method: "rename_collection", id: "ghost", name: "x" }).ok).toBe(false);
    expect(api.handle({ method: "delete_collection", id: "ghost" }).ok).toBe(false);
    expect(api.handle({ method: "add_to_collection", id: "ghost", ids: ["m"] }).ok).toBe(false);
    expect(api.handle({ method: "set_collection_flags", id: "ghost", locked: true }).ok).toBe(false);
    expect(api.handle({ method: "delete_prefab", prefabId: "ghost" }).ok).toBe(false);
    expect(api.handle({ method: "detach_prefab_instance", instanceId: "ghost" }).ok).toBe(false);

    // Batch verbs that match nothing are honest failures, not silent no-op successes.
    const batch = api.handle({ method: "batch_set_properties", ids: ["nope"], color: "#111" });
    expect(batch.ok).toBe(false);
    expect(api.handle({ method: "assign_material", ids: ["nope"], materialId: "granite" }).ok).toBe(false);
    dispose();
  });

  test("push_document_patch snapshot must clear the decode boundary (#1016)", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: { markers: [{ id: "m", kind: "mob", position: { x: 0, y: 0, z: 0 } }] },
    });
    const before = api.getSession().exportJson(false);
    const rev = (api.handle({ method: "document_revision" }).result as { revision: number }).revision;
    const bad = api.handle({
      method: "push_document_patch",
      patch: { type: "snapshot", baseRevision: rev, document: { markers: "not-an-array" } } as never,
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("invalid snapshot document");
    // The live session is untouched by a rejected snapshot.
    expect(api.getSession().exportJson(false)).toBe(before);
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

  test("live-sync: session edits publish document patches; reverse channel is ephemeral until write-back", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: {
        markers: [{ id: "boss", kind: "boss", position: { x: 0, y: 0, z: 0 } }],
      },
    });

    const revisions: number[] = [];
    const unsub = api.getLiveSync().subscribeDocument((event) => revisions.push(event.revision));

    const moved = api.handle({ method: "set_transform", id: "boss", x: 12, z: -4 });
    expect(moved.ok).toBe(true);
    expect(revisions.length).toBeGreaterThanOrEqual(1);

    const rev = api.handle({ method: "document_revision", includeDocument: true });
    expect(rev.ok).toBe(true);
    const revResult = rev.result as { revision: number; document: { markers: { position: { x: number } }[] } };
    expect(revResult.revision).toBeGreaterThanOrEqual(1);
    expect(revResult.document.markers[0]?.position.x).toBe(12);

    const pulled = api.handle({ method: "pull_document_patches", sinceRevision: 0 });
    expect((pulled.result as { patches: unknown[] }).patches.length).toBeGreaterThanOrEqual(1);

    const commandPatch = api.handle({
      method: "push_document_patch",
      patch: {
        type: "commands",
        baseRevision: revResult.revision,
        commands: [{ type: "setTransform", id: "boss", position: { x: 99, y: 0, z: 0 } }],
      },
    });
    expect(commandPatch.ok).toBe(true);
    expect(api.getSession().getState().document.markers[0]?.position.x).toBe(99);

    const stale = api.handle({
      method: "push_document_patch",
      patch: {
        type: "commands",
        baseRevision: 0,
        commands: [{ type: "setTransform", id: "boss", position: { x: 1, y: 0, z: 0 } }],
      },
    });
    expect(stale.ok).toBe(false);
    expect(api.getSession().getState().document.markers[0]?.position.x).toBe(99);

    const runtime = api.handle({
      method: "push_runtime_delta",
      entities: [{ id: "boss", position: { x: 7, y: 0, z: 7 } }],
      tunables: { paused: true },
    });
    expect(runtime.ok).toBe(true);
    expect(api.getSession().getState().document.markers[0]?.position.x).toBe(99);

    const snap = api.handle({ method: "runtime_snapshot" });
    expect((snap.result as { entities: { boss: { position: { x: number } } } }).entities.boss.position.x).toBe(7);

    api.handle({ method: "set_runtime_override", entity: { id: "boss", position: { x: 3, y: 0, z: 3 } } });
    expect(api.getSession().getState().document.markers[0]?.position.x).toBe(99);
    const written = api.handle({ method: "write_back_override", id: "boss" });
    expect(written.ok).toBe(true);
    expect(api.getSession().getState().document.markers[0]?.position.x).toBe(3);

    const deltas = api.handle({ method: "pull_runtime_deltas", sinceSeq: 0, includeSnapshot: true });
    expect((deltas.result as { deltas: unknown[] }).deltas.length).toBeGreaterThanOrEqual(1);

    unsub();
    dispose();
  });

  test("runtime_summary/get/set write back to the document and pause/step control works", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: {
        markers: [{ id: "spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 }, meta: { team: "red" } }],
      },
    });

    api.handle({
      method: "push_runtime_delta",
      entities: [{ id: "spawn", position: { x: 0, y: 0, z: 0 }, values: { team: "red" } }],
      tunables: { wind: 1 },
    });

    const summary = api.handle({ method: "runtime_summary" });
    expect(summary.ok).toBe(true);
    expect((summary.result as { entityCount: number }).entityCount).toBe(1);
    expect((summary.result as { tunableKeys: string[] }).tunableKeys).toContain("wind");
    expect((summary.result as { play: { paused: boolean } }).play.paused).toBe(false);

    const got = api.handle({ method: "runtime_get", id: "spawn", path: "values.team" });
    expect(got.ok).toBe(true);
    expect((got.result as { value: string }).value).toBe("red");

    const setPos = api.handle({
      method: "runtime_set",
      id: "spawn",
      position: { x: 40, y: 0, z: -10 },
    });
    expect(setPos.ok).toBe(true);
    expect((setPos.result as { writeBack: boolean }).writeBack).toBe(true);
    expect(api.getSession().getState().document.markers[0]?.position.x).toBe(40);

    const setMeta = api.handle({
      method: "runtime_set",
      id: "spawn",
      path: "values.team",
      value: "blue",
    });
    expect(setMeta.ok).toBe(true);
    expect(api.getSession().getState().document.markers[0]?.meta?.team).toBe("blue");

    const undone = api.handle({ method: "undo" });
    expect(undone.ok).toBe(true);

    const pause = api.handle({ method: "runtime_pause" });
    expect(pause.ok).toBe(true);
    expect(api.getPlayControl().paused).toBe(true);

    const step = api.handle({ method: "runtime_step", frames: 3 });
    expect(step.ok).toBe(true);
    expect(api.getPlayControl().pendingSteps).toBe(3);

    const resume = api.handle({ method: "runtime_resume" });
    expect(resume.ok).toBe(true);
    expect(api.getPlayControl().paused).toBe(false);

    const tunable = api.handle({ method: "runtime_set", id: "tunable:wind", value: 4 });
    expect(tunable.ok).toBe(true);
    expect(api.getLiveSync().getRuntimeState().tunables.wind).toBe(4);

    dispose();
  });

  test("bake_minimap needs the live viewport sampler, then stores a deterministic PNG (#1036)", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: {
        markers: [
          { id: "a", kind: "poi", position: { x: -30, y: 0, z: -30 } },
          { id: "b", kind: "poi", position: { x: 30, y: 0, z: 30 } },
        ],
      },
    });

    // No viewport mounted → the sampler is null and the bake fails cleanly.
    const noSampler = api.handle({ method: "bake_minimap" });
    expect(noSampler.ok).toBe(false);
    expect(noSampler.error).toContain("viewport");
    expect(api.getSession().getState().document.minimap).toBeUndefined();

    // A deterministic stub sampler stands in for the mounted world's composed ground field.
    const sampler = {
      sampleHeight: (x: number, z: number) => Math.sin(x * 0.1) + Math.cos(z * 0.1),
      sampleNormal: (_x: number, _z: number) => [0, 1, 0] as const,
    };
    api.setTerrainSampler(sampler);

    const baked = api.handle({ method: "bake_minimap", resolution: 48 });
    expect(baked.ok).toBe(true);
    const stored = api.getSession().getState().document.minimap;
    expect(stored?.background.startsWith("data:image/png")).toBe(true);
    expect((baked.result as { bytes: number }).bytes).toBeGreaterThan(0);

    // Deterministic: same sampler + document bakes byte-identical output.
    const again = api.handle({ method: "bake_minimap", resolution: 48 });
    expect(again.ok).toBe(true);
    expect(api.getSession().getState().document.minimap?.background).toBe(stored?.background);

    dispose();
  });
});
