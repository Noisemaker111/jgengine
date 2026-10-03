import { describe, expect, test } from "bun:test";

import { decodeEditorBridgeRequest } from "./mcp/rpcRequest";
import { EDITOR_MCP_TOOLS } from "./mcp/tools";
import { createEditorHost, type EditorMaterialSlotInfo } from "./session";

const slots: EditorMaterialSlotInfo[] = [{ mesh: "Cushion_1", slot: "Upholstery", slotIndex: 1, materialType: "MeshPhysicalMaterial", uvSets: [0, 1], tangents: true, physical: true }];

function host() {
  return createEditorHost({ gameId: "material-slot-rpc", layers: { markers: [
    { id: "chair", kind: "prop", catalogId: "chair-model", position: { x: 0, y: 0, z: 0 } },
    { id: "marker-only", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } },
  ] }, assets: [{ id: "chair-model", label: "Chair", kind: "model", url: "/chair.glb" }] });
}

describe("canonical material slot RPC", () => {
  test("headless, unknown and non-model markers have explicit unavailable results", () => {
    const editor = host();
    try {
      for (const id of ["chair", "missing", "marker-only"]) {
        const response = editor.api.handle({ method: "list_material_slots", id });
        expect(response.ok).toBe(false);
        expect(response.result).toMatchObject({ id, status: "unavailable" });
        expect(response.result).not.toHaveProperty("slots");
        expect(response.error).toBeDefined();
      }
    } finally { editor.dispose(); }
  });

  test("loaded observations expose canonical slots without authoring or borrowed mutable state", () => {
    const editor = host();
    try {
      const before = editor.session.exportJson();
      expect(editor.api.reportMaterialSlots("chair", "/chair.glb", { status: "loading" })).toBe(true);
      const loading = editor.api.handle({ method: "list_material_slots", id: "chair" });
      expect(loading.ok).toBe(false);
      expect(loading.result).toEqual({ id: "chair", sourceUrl: "/chair.glb", status: "loading" });
      const supplied = structuredClone(slots);
      expect(editor.api.reportMaterialSlots("chair", "/chair.glb", { status: "ready", slots: supplied })).toBe(true);
      (supplied[0]!.uvSets as number[]).push(3);
      const response = editor.api.handle({ method: "list_material_slots", id: "chair" });
      expect(response.ok).toBe(true);
      expect(response.result).toEqual({ id: "chair", sourceUrl: "/chair.glb", status: "ready", slots });
      const snapshot = editor.api.getMaterialSlots("chair");
      if (snapshot.status !== "ready") throw new Error("Expected ready inventory");
      (snapshot.slots[0]!.uvSets as number[]).push(2);
      expect(editor.api.getMaterialSlots("chair")).toEqual(response.result);
      expect(editor.session.exportJson()).toBe(before);
      expect(editor.session.canUndo()).toBe(false);
      expect(editor.api.reportMaterialSlots("chair", "/chair.glb", { status: "loading" })).toBe(true);
      expect(editor.api.getMaterialSlots("chair").status).toBe("ready");
    } finally { editor.dispose(); }
  });

  test("catalog and marker source changes discard old inventory and reject stale completions", () => {
    const editor = host();
    try {
      editor.api.reportMaterialSlots("chair", "/chair.glb", { status: "ready", slots });
      editor.api.setAssets([{ id: "chair-model", label: "New chair", kind: "model", url: "/chair-v2.glb" }, { id: "other-model", label: "Other", kind: "model", url: "/other.glb" }]);
      expect(editor.api.getMaterialSlots("chair")).toMatchObject({ status: "unavailable", sourceUrl: "/chair-v2.glb" });
      expect(editor.api.reportMaterialSlots("chair", "/chair.glb", { status: "ready", slots })).toBe(false);
      expect(editor.api.reportMaterialSlots("chair", "/chair-v2.glb", { status: "ready", slots })).toBe(true);
      expect(editor.api.handle({ method: "set_marker", id: "chair", catalogId: "other-model" }).ok).toBe(true);
      expect(editor.api.getMaterialSlots("chair")).toMatchObject({ status: "unavailable", sourceUrl: "/other.glb" });
      expect(editor.api.reportMaterialSlots("chair", "/chair-v2.glb", { status: "ready", slots })).toBe(false);
      expect(editor.api.handle({ method: "dispatch", command: { type: "removeMany", ids: ["chair"] } }).ok).toBe(true);
      expect(editor.api.reportMaterialSlots("chair", "/other.glb", { status: "ready", slots })).toBe(false);
    } finally { editor.dispose(); }
  });

  test("failed or cancelled loads remain actionable rather than becoming empty ready inventories", () => {
    const editor = host();
    try {
      editor.api.reportMaterialSlots("chair", "/chair.glb", { status: "unavailable", reason: "Failed to load /chair.glb" });
      editor.api.reportMaterialSlots("chair", "/chair.glb", { status: "loading" });
      expect(editor.api.handle({ method: "list_material_slots", id: "chair" })).toEqual({ ok: false, result: { id: "chair", sourceUrl: "/chair.glb", status: "unavailable", reason: "Failed to load /chair.glb" }, error: "Failed to load /chair.glb" });
      editor.api.reportMaterialSlots("chair", "/chair.glb", { status: "ready", slots: [] });
      expect(editor.api.handle({ method: "list_material_slots", id: "chair" }).result).toMatchObject({ status: "ready", slots: [] });
    } finally { editor.dispose(); }
  });

  test("MCP declares the typed marker query and rejects invented source arguments", () => {
    expect(decodeEditorBridgeRequest({ method: "list_material_slots", id: "chair" }).ok).toBe(true);
    expect(decodeEditorBridgeRequest({ method: "list_material_slots", id: 4 }).ok).toBe(false);
    expect(decodeEditorBridgeRequest({ method: "list_material_slots", id: "chair", sourceUrl: "/invented.glb" }).ok).toBe(false);
    expect(EDITOR_MCP_TOOLS.find((tool) => tool.name === "list_material_slots")).toBeDefined();
  });
});
