import { describe, expect, test } from "bun:test";
import { editableTerrainFromSnapshot } from "@jgengine/core/world/terraform";
import { createEditorHost } from "../session";

function host() {
  const editor = createEditorHost({ gameId: "terrain-authoring", layers: {} });
  editor.api.handle({ method: "create_terrain", width: 32, depth: 32, cellSize: 2 });
  editor.api.handle({ method: "fill_terrain", surface: "grass" });
  editor.api.handle({ method: "set_terrain_layers", layers: [{ id: "grass", surface: "grass" }] });
  return editor;
}

describe("terrain RPC authoring recovery", () => {
  test("new-layer blend emits once and undo/redo restores the entire authored action", () => {
    const { api, dispose } = host();
    const session = api.getSession();
    const before = session.exportJson();
    let notifications = 0;
    const unsubscribe = session.subscribe(() => notifications++);
    expect(api.handle({ method: "blend_terrain", x: 0, z: 0, radius: 6, surface: "dirt", strength: 0.5 }).ok).toBe(true);
    expect(notifications).toBe(1);
    const after = session.exportJson();
    expect(session.getState().document.terrain!.layers).toHaveLength(2);
    expect(api.handle({ method: "undo" }).ok).toBe(true);
    expect(session.exportJson()).toBe(before);
    expect(api.handle({ method: "redo" }).ok).toBe(true);
    expect(session.exportJson()).toBe(after);
    unsubscribe();
    dispose();
  });

  test("off-map and invalid brushes preserve document, notifications and redo", () => {
    const { api, dispose } = host();
    api.handle({ method: "add_marker", id: "pad", kind: "spawn", x: 0, z: 0 });
    api.handle({ method: "undo" });
    const session = api.getSession();
    const before = session.exportJson();
    let notifications = 0;
    session.subscribe(() => notifications++);
    for (const brush of [{ x: 1000, z: 1000 }, { x: NaN, z: 0 }, { x: 0, z: 0, radius: -1 }, { x: 0, z: 0, strength: 2 }]) {
      expect(api.handle({ method: "blend_terrain", surface: "dirt", ...brush }).ok).toBe(false);
      expect(session.exportJson()).toBe(before);
      expect(session.canRedo()).toBe(true);
    }
    expect(notifications).toBe(0);
    dispose();
  });

  test("adding and reordering materials keeps existing authored blends", () => {
    const { api, dispose } = host();
    api.handle({ method: "blend_terrain", x: 0, z: 0, surface: "dirt", strength: 0.5 });
    const session = api.getSession();
    const terrain = session.getState().document.terrain!;
    const before = editableTerrainFromSnapshot(terrain).weightsAt(0, 0);
    expect(api.handle({ method: "set_terrain_layers", layers: [{ id: "dirt", surface: "dirt" }, { id: "grass", surface: "grass" }, { id: "rock", surface: "rock" }] }).ok).toBe(true);
    const after = editableTerrainFromSnapshot(session.getState().document.terrain!).weightsAt(0, 0);
    expect(after[0]).toBeCloseTo(before[1]!);
    expect(after[1]).toBeCloseTo(before[0]!);
    expect(after[2]).toBe(0);
    api.handle({ method: "undo" });
    expect(session.getState().document.terrain).toEqual(terrain);
    dispose();
  });

  test("camera_frame fits a terrain-first authored scene without adding a dummy marker", () => {
    const { api, dispose } = host();
    const response = api.handle({ method: "camera_frame", pitch: 60 });
    expect(response.ok).toBe(true);
    expect((response.result as { bounds: { min: { x: number }; max: { x: number } } }).bounds).toMatchObject({ min: { x: -16 }, max: { x: 16 } });
    dispose();
  });

  test("terrain allocation and ramp diagnostics reject before mutation", () => {
    const { api, dispose } = host();
    const before = api.getSession().exportJson();
    for (const args of [{ width: -1 }, { cellSize: 0 }, { width: 100000, depth: 100000, cellSize: 1 }]) {
      expect(api.handle({ method: "create_terrain", ...args }).ok).toBe(false);
    }
    expect(api.handle({ method: "sculpt_terrain", mode: "ramp", x: 0, z: 0 }).ok).toBe(false);
    expect(api.getSession().exportJson()).toBe(before);
    dispose();
  });
});
