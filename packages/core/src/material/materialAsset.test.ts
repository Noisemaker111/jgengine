import { describe, expect, test } from "bun:test";
import { createMaterialTemplate, MATERIAL_TEXTURE_SEMANTICS, materialCapabilitiesForAsset, materialCapabilitiesForSurface, matchesMaterialSelector, parseMaterialAssignments, validateMaterialAsset, validateMaterialAssignments, validateMaterialSurface } from "./materialAsset";
import type { MaterialAsset, MaterialTemplate } from "./materialAsset";

const material = (): MaterialAsset => ({ schemaVersion: 1, id: "game/fabric", name: "Custom upholstery", family: "fabric", capabilities: ["pbr"], surface: { roughness: 0.8 } });

describe("material asset contracts", () => {
  test("sparse authored data survives JSON without filling imported fields", () => {
    const asset = material();
    const reopened = JSON.parse(JSON.stringify(asset));
    expect(validateMaterialAsset(reopened)).toEqual([]);
    expect(reopened.surface).toEqual({ roughness: 0.8 });
    expect(reopened.surface.color).toBeUndefined();
  });

  test("selectors independently constrain mesh, named slot and stable index", () => {
    expect(matchesMaterialSelector({ slot: "Skin" }, "Body", "Skin", 0)).toBe(true);
    expect(matchesMaterialSelector({ slot: "Skin" }, "Body", "Clothes", 1)).toBe(false);
    expect(matchesMaterialSelector({ mesh: "Eyes", slotIndex: 0 }, "Body", "", 0)).toBe(false);
    expect(matchesMaterialSelector({ mesh: "Eyes", slotIndex: 0 }, "Eyes", "", 0)).toBe(true);
  });

  test("packed maps use numeric color space and their renderer channels", () => {
    const asset = material();
    asset.textures = {
      roughness: { url: "/textures/orm.ktx2", colorSpace: "linear", channel: "g", compression: "ktx2" },
      metalness: { url: "/textures/orm.ktx2", colorSpace: "linear", channel: "b" },
      ao: { url: "/textures/orm.ktx2", colorSpace: "linear", channel: "r" },
    };
    expect(validateMaterialAsset(asset)).toEqual([]);
    asset.textures.roughness!.channel = "r";
    asset.textures.metalness!.colorSpace = "srgb";
    expect(validateMaterialAsset(asset).map((diagnostic) => diagnostic.code)).toEqual(["texture-channel", "texture-color-space"]);
  });

  test("explicit feature declarations include intentional disabled features", () => {
    expect(materialCapabilitiesForSurface({ sheen: 0, clearcoat: 0.8 })).toEqual(["pbr", "sheen", "clearcoat"]);
    const asset = material();
    asset.surface.sheen = 1;
    expect(validateMaterialAsset(asset).some((diagnostic) => diagnostic.code === "missing-capability")).toBe(true);
  });

  test("asset requirements cover appearance adapters and every supported physical map", () => {
    const original = material();
    const woven = { ...original, fabric: { construction: "woven" as const } };
    expect(materialCapabilitiesForAsset(woven)).toEqual(["pbr", "sheen", "anisotropy"]);
    expect(materialCapabilitiesForAsset({ ...original, hair: { geometry: "cards" } })).toEqual(["pbr", "anisotropy", "alpha"]);
    expect(materialCapabilitiesForAsset({ ...original, hair: { geometry: "strands" } })).toEqual(["pbr", "anisotropy"]);
    for (const role of ["sheenColor", "sheenRoughness", "anisotropy", "clearcoat", "clearcoatRoughness", "clearcoatNormal", "specularIntensity", "specularColor", "transmission", "thickness", "iridescence", "iridescenceThickness", "alpha"] as const) {
      const edited = { ...original, textures: { [role]: { url: `/maps/${role}.png`, ...MATERIAL_TEXTURE_SEMANTICS[role] } } };
      expect(validateMaterialAsset(edited).some((entry) => entry.code === "missing-capability")).toBe(true);
      expect(validateMaterialAsset({ ...edited, capabilities: materialCapabilitiesForAsset(edited) })).toEqual([]);
    }
    expect(original).toEqual(material());
  });

  test("invalid authored combinations cannot silently change rendering", () => {
    const asset = createMaterialTemplate("glass", "glass");
    asset.surface.alphaMode = "blend";
    asset.capabilities = [...asset.capabilities, "alpha"];
    expect(validateMaterialAsset(asset).some((diagnostic) => diagnostic.code === "unsupported-combination")).toBe(true);
    expect(validateMaterialSurface({ attenuationDistance: Infinity, roughness: -1, inventedScattering: 1 })).toHaveLength(3);
  });

  test("construction metadata exposes only implemented response paths", () => {
    const wool = createMaterialTemplate("wool", "wool");
    wool.fabric!.threadScale = 80;
    expect(validateMaterialAsset(wool).some((diagnostic) => diagnostic.path === "fabric.threadScale")).toBe(true);
    const hair = createMaterialTemplate("hair-cards", "hair");
    expect(hair.hair?.strandDirection).toBe(Math.PI / 2);
    hair.hair!.backlightStrength = 2;
    expect(validateMaterialAsset(hair).some((diagnostic) => diagnostic.path === "hair.backlightStrength")).toBe(true);
    hair.hair!.backlightStrength = 0.2;
    hair.hair!.geometry = "strands";
    expect(validateMaterialAsset(hair).some((diagnostic) => diagnostic.message.includes("cards only"))).toBe(true);
    expect(validateMaterialAsset({ ...material(), groomDensity: 12 }).some((diagnostic) => diagnostic.path === "groomDensity")).toBe(true);
  });

  test("UV and sampler data are validated rather than normalized away", () => {
    const asset = material();
    asset.textures = { normal: { url: "/textures/cloth.png", colorSpace: "linear", uvSet: 1, transform: { offset: [0.2, 0.4], scale: [2, 3], rotation: Math.PI / 2 }, normalConvention: "directx", physicalSize: [0.5, 0.5], sampler: { wrapS: "repeat", minFilter: "linear-mipmap-linear", anisotropy: 4 } } };
    expect(validateMaterialAsset(asset)).toEqual([]);
    expect(validateMaterialAsset({ ...asset, textures: { normal: { ...asset.textures.normal, uvSet: 4, transform: { scale: [2] }, sampler: { magFilter: "unknown" } } } }).filter((diagnostic) => diagnostic.severity === "error")).toHaveLength(3);
  });

  test("untrusted RPC assignments fail empty, misspelled and malformed selectors", () => {
    expect(() => parseMaterialAssignments([{ materialId: "x", selector: {} }])).toThrow("choose a mesh");
    expect(() => parseMaterialAssignments([{ materialId: "x", selector: { slotIndex: -1 } }])).toThrow("invalid index");
    expect(() => parseMaterialAssignments([{ materialId: "x", selector: { material: "Skin" } }])).toThrow("unsupported selector");
    const assignments = parseMaterialAssignments([{ materialId: "x", selector: { slotIndex: 3 }, overrides: { roughness: 0.5 } }]);
    expect(assignments[0]).toEqual({ materialId: "x", selector: { slotIndex: 3 }, overrides: { roughness: 0.5 } });
    expect(validateMaterialAssignments(assignments, [material()])[0].code).toBe("missing-material");
    expect(validateMaterialAssignments([], [material(), material()])[0].code).toBe("duplicate-material");
  });

  test("all editable templates round trip and remain independent", () => {
    const templates: MaterialTemplate[] = ["wool", "cotton", "silk", "brushed-metal", "glass", "coated-plastic", "stone", "hair-cards"];
    for (const template of templates) {
      const first = createMaterialTemplate(template, `art/${template}`);
      const reopened = JSON.parse(JSON.stringify(first));
      expect(validateMaterialAsset(reopened).filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
      expect(first.provenance?.author).toBe("JGengine contributors");
      first.surface.roughness = 0;
      expect(createMaterialTemplate(template, "fresh").surface.roughness).not.toBe(0);
    }
    expect(createMaterialTemplate("wool", "w").fabric?.construction).toBe("fuzzy");
    expect(createMaterialTemplate("silk", "s").surface.anisotropy).toBeGreaterThan(0.5);
    expect(validateMaterialAsset(createMaterialTemplate("hair-cards", "h")).some((diagnostic) => diagnostic.code === "hair-approximation")).toBe(true);
  });
});

test("render-path map restrictions apply only to referenced assets and remain opt-in", () => {
  const raised: MaterialAsset = { ...material(), id: "raised", textures: { height: { url: "/height.png", colorSpace: "linear", channel: "r" } } };
  const flat: MaterialAsset = { ...material(), id: "flat" };
  const assignment = [{ materialId: "raised", selector: { slot: "Facade" } }];
  expect(validateMaterialAssignments(assignment, [raised])).toEqual([]);
  expect(validateMaterialAssignments(assignment, [raised], { disallowedTextureRoles: ["height"] })).toMatchObject([{ severity: "error", code: "unsupported-texture-role", path: "materialAssignments.0.materialId" }]);
  expect(validateMaterialAssignments([{ materialId: "flat", selector: { slot: "Facade" } }], [flat, raised], { disallowedTextureRoles: ["height"] })).toEqual([]);
  expect(raised.textures!.height!.url).toBe("/height.png");
});
