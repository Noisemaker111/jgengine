import { expect, test } from "bun:test";
import { createMaterialTemplate } from "@jgengine/core/material/materialAsset";
import { createEditorHost } from "./session";
import { decodeEditorBridgeRequest } from "./mcp/rpcRequest";

test("material RPC validates slot selection, errors and reopen through the real host", () => {
  const host = createEditorHost({ gameId: "material-test", layers: { markers: [{ id: "chair", kind: "prop", position: { x: 0, y: 0, z: 0 } }] } });
  try {
    const asset = createMaterialTemplate("wool", "linen");
    expect(host.api.handle({ method: "upsert_material_asset", asset }).ok).toBe(true);
    expect(host.api.handle({ method: "assign_material_asset", ids: ["chair"], materialId: "linen", selector: { slot: "Upholstery" } }).ok).toBe(true);
    const saved = host.session.exportJson();
    expect(host.api.handle({ method: "remove_material_asset", id: "linen" }).ok).toBe(false);
    expect(host.api.handle({ method: "assign_material_asset", ids: ["chair"], materialId: "linen", selector: {} }).ok).toBe(false);
    expect(host.session.exportJson()).toBe(saved);
    expect(host.api.handle({ method: "undo" }).ok).toBe(true);
    expect(host.api.handle({ method: "redo" }).ok).toBe(true);
    expect(host.session.exportJson()).toBe(saved);
    const reopened = createEditorHost({ gameId: "reopened", layers: JSON.parse(saved) });
    try { expect(reopened.api.handle({ method: "list_material_assets" }).result).toEqual(host.api.handle({ method: "list_material_assets" }).result); }
    finally { reopened.dispose(); }
    expect(host.api.handle({ method: "upsert_material_asset", asset: { ...asset, surface: { roughness: 2 } } }).ok).toBe(false);
    expect(decodeEditorBridgeRequest({ method: "assign_material_asset", ids: ["chair"], materialId: "linen", selector: { slot: "Upholstery" } }).ok).toBe(true);
    expect(host.api.handle({ method: "clear_material_assets", ids: ["chair"] }).ok).toBe(true);
    expect(host.api.handle({ method: "remove_material_asset", id: "linen" }).ok).toBe(true);
  } finally { host.dispose(); }
});
