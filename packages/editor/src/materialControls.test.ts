import { describe, expect, test } from "bun:test";

import { createMaterialTemplate, MATERIAL_TEXTURE_SEMANTICS, validateMaterialAsset, type MaterialAsset } from "@jgengine/core/material/materialAsset";

import { advancedMaterialControls, materialAuthoringNotes, materialControlGroups, prepareMaterialAuthoringEdit } from "./materialControls";
import { createEditorHost } from "./session";

describe("material authoring controls", () => {
  test("each family exposes six groups while retaining advanced physical fields", () => {
    for (const family of ["standard", "fabric", "hair", "glass", "metal", "skin", "stone", "plastic"] as const) {
      expect(materialControlGroups(family)).toHaveLength(6);
    }
    expect(advancedMaterialControls.map((field) => field.key)).toEqual(expect.arrayContaining(["sheen", "anisotropy", "ior", "transmission", "thickness", "clearcoat", "iridescence"]));
  });

  test("silk direction and card coverage remain independent of transmission", () => {
    const fabric = materialControlGroups("fabric");
    expect(fabric.find((group) => group.label === "Weave direction")?.controls.map((field) => field.key)).toEqual(["anisotropy", "anisotropyRotation"]);
    const hair = materialControlGroups("hair");
    expect(hair.find((group) => group.label === "Coverage")?.controls.map((field) => field.key)).toEqual(["opacity", "alphaCutoff"]);
    expect(hair.find((group) => group.label === "Backlighting")?.controls).toEqual([]);
    expect(advancedMaterialControls.map((field) => field.key)).toContain("transmission");
  });

  test("hair, directional and transmission prerequisites are honest", () => {
    const asset: MaterialAsset = { schemaVersion: 1, id: "hair", name: "Hair cards", family: "hair", capabilities: [], surface: { anisotropy: 0.8, transmission: 0.3 } };
    const notes = materialAuthoringNotes(asset).join(" ");
    expect(notes).toContain("not a groom");
    expect(notes).toContain("valid mesh UVs");
    expect(notes).toContain("opacity 1");
  });

  test("artist adapter activation saves and reopens without changing sparse surface values", () => {
    const host = createEditorHost({ gameId: "material-controls", layers: {} });
    try {
      const wool = createMaterialTemplate("wool", "upholstery");
      expect(host.api.handle({ method: "upsert_material_asset", asset: wool }).ok).toBe(true);
      const woven = prepareMaterialAuthoringEdit({ ...wool, fabric: { construction: "woven", weaveDirection: 0.8 } });
      expect(host.api.handle({ method: "upsert_material_asset", asset: woven }).ok).toBe(true);
      expect(woven.surface).toEqual(wool.surface);
      expect(wool.capabilities).not.toContain("anisotropy");
      expect(host.api.handle({ method: "undo" }).ok).toBe(true);
      expect(host.session.getState().document.materialAssets![0]!.fabric?.construction).toBe("fuzzy");
      expect(host.api.handle({ method: "redo" }).ok).toBe(true);
      const saved = host.session.exportJson();
      const reopened = createEditorHost({ gameId: "material-controls-reopened", layers: JSON.parse(saved) });
      try { expect(reopened.session.getState().document.materialAssets![0]).toEqual(woven); }
      finally { reopened.dispose(); }
      for (const geometry of ["cards", "strands"] as const) {
        const hair: MaterialAsset = { schemaVersion: 1, id: `hair-${geometry}`, name: "Original hair", family: "hair", capabilities: [], surface: { roughness: 0.42 }, hair: { geometry } };
        const edited = prepareMaterialAuthoringEdit(hair);
        expect(host.api.handle({ method: "upsert_material_asset", asset: edited }).ok).toBe(true);
        expect(edited.surface).toEqual({ roughness: 0.42 });
        expect(validateMaterialAsset(edited).filter((entry) => entry.severity === "error")).toEqual([]);
      }
    } finally { host.dispose(); }
  });

  test("adding physical maps prepares declarations accepted by the real editor host", () => {
    const host = createEditorHost({ gameId: "material-map-controls", layers: {} });
    try {
      const asset = createMaterialTemplate("stone", "surface");
      asset.capabilities = [...asset.capabilities, "iridescence"];
      for (const role of ["sheenColor", "sheenRoughness", "anisotropy", "clearcoat", "clearcoatRoughness", "clearcoatNormal", "specularIntensity", "specularColor", "transmission", "thickness", "iridescence", "iridescenceThickness", "alpha"] as const) {
        const edited = prepareMaterialAuthoringEdit({ ...asset, textures: { [role]: { url: `/maps/${role}.png`, ...MATERIAL_TEXTURE_SEMANTICS[role] } } });
        expect(host.api.handle({ method: "upsert_material_asset", asset: edited }).ok).toBe(true);
        expect(edited.capabilities).toContain("iridescence");
        expect(edited.surface).toEqual(asset.surface);
      }
    } finally { host.dispose(); }
  });
});
