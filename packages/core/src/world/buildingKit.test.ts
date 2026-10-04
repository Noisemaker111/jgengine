import { describe, expect, it, test } from "bun:test";

import {
  buildingKitVariantCounts,
  defineBuildingKit,
  resolveBuildingKitPart,
} from "./buildingKit";
import { generateBuilding } from "./buildings";
import { createMaterialTemplate } from "../material/materialAsset";
import { createEmptyEditorDocument, exportEditorDocumentJson, importEditorDocumentJson } from "../editor/document";

describe("defineBuildingKit", () => {
  it("accepts bare model strings as single-field variants", () => {
    const kit = defineBuildingKit({ parts: { wall: ["Wall_A.glb", "Wall_B.glb"] } });
    expect(kit.parts.wall).toEqual([{ model: "Wall_A.glb" }, { model: "Wall_B.glb" }]);
  });

  it("rejects an empty variant list rather than silently falling back to blocks", () => {
    expect(() => defineBuildingKit({ id: "k", parts: { wall: [] } })).toThrow(/empty variant list/);
  });

  it("rejects a variant with no model reference", () => {
    expect(() => defineBuildingKit({ parts: { wall: [{ model: "" }] } })).toThrow(/no model reference/);
  });
});

describe("resolveBuildingKitPart", () => {
  const kit = defineBuildingKit({
    id: "village",
    parts: {
      wall: ["Wall_A.glb", "Wall_B.glb", "Wall_C.glb"],
      airConditioner: [{ model: "AC.glb", fit: "contain" }],
    },
    slots: { "front.wall": ["Shopfront.glb"] },
    omit: ["clothesline"],
    fit: "cover",
  });

  it("falls back to a block for an unbound kind", () => {
    expect(resolveBuildingKitPart(kit, "roofProp", { key: "roof.roofProp", variant: 0 })).toEqual({
      type: "box",
    });
  });

  it("returns a block for every kind when there is no kit at all", () => {
    expect(resolveBuildingKitPart(undefined, "wall", { key: "back.wall", variant: 2 })).toEqual({
      type: "box",
    });
  });

  it("drops an omitted kind entirely", () => {
    expect(resolveBuildingKitPart(kit, "clothesline", { key: "back.clothesline", variant: 1 })).toEqual({
      type: "omit",
    });
  });

  it("indexes variants by the slot's variant, wrapping past the bound count", () => {
    const pick = (variant: number) =>
      resolveBuildingKitPart(kit, "wall", { key: "back.wall", variant });
    expect(pick(0)).toMatchObject({ part: { model: "Wall_A.glb" } });
    expect(pick(4)).toMatchObject({ part: { model: "Wall_B.glb" } });
    expect(pick(-1)).toMatchObject({ part: { model: "Wall_B.glb" } });
  });

  it("lets a facade slot override the kind binding", () => {
    expect(resolveBuildingKitPart(kit, "wall", { key: "front.wall", variant: 7 })).toMatchObject({
      part: { model: "Shopfront.glb" },
    });
  });

  it("resolves fit from the part, then the kit, then stretch", () => {
    expect(resolveBuildingKitPart(kit, "airConditioner", { key: "back.airConditioner", variant: 0 })).toMatchObject(
      { fit: "contain" },
    );
    expect(resolveBuildingKitPart(kit, "wall", { key: "back.wall", variant: 0 })).toMatchObject({ fit: "cover" });
    const plain = defineBuildingKit({ parts: { wall: ["W.glb"] } });
    expect(resolveBuildingKitPart(plain, "wall", { key: "back.wall", variant: 0 })).toMatchObject({
      fit: "stretch",
    });
  });
});

describe("buildingKitVariantCounts", () => {
  it("reports the bound model count per kind, skipping kinds with no variant knob", () => {
    const kit = defineBuildingKit({
      parts: { wall: ["a", "b", "c"], window: ["w"], roof: ["r1", "r2"], corner: ["c1"] },
    });
    expect(buildingKitVariantCounts(kit)).toEqual({ wall: 3, window: 1 });
  });

  it("keeps every generated wall pick inside the kit's bound range", () => {
    const kit = defineBuildingKit({ parts: { wall: ["a", "b", "c"] } });
    const building = generateBuilding({
      seed: "kit-range",
      floors: 5,
      baysWide: 4,
      baysDeep: 3,
      variants: buildingKitVariantCounts(kit),
    });
    const wallVariants = building.parts
      .filter((part) => part.kind === "wall")
      .map((part) => part.kit.variant);
    expect(wallVariants.length).toBeGreaterThan(0);
    expect(Math.max(...wallVariants)).toBeLessThan(3);
    expect(new Set(wallVariants).size).toBe(3);
  });
});


describe("authored kit slot materials", () => {
  it("retains the editor asset library and named selectors through a serialized kit", () => {
    const asset = { ...createMaterialTemplate("coated-plastic", "facade"), surface: { color: "#a45c39", clearcoat: 0.6 } };
    const document = importEditorDocumentJson(exportEditorDocumentJson({ ...createEmptyEditorDocument(), materialAssets: [asset] }));
    const assignments = [{ materialId: "facade", selector: { mesh: "Facade", slot: "Cladding", slotIndex: 0 }, overrides: { roughness: 0.7 } }];
    const kit = defineBuildingKit({ id: "authored", materialAssets: document.materialAssets, parts: { wall: [{ model: "/panel.glb", materialAssignments: assignments }] } });
    const restored = defineBuildingKit(JSON.parse(JSON.stringify(kit)));
    expect(restored.materialAssets).toEqual(document.materialAssets);
    expect(resolveBuildingKitPart(restored, "wall", { key: "front.wall", variant: 0 })).toMatchObject({ type: "model", part: { materialAssignments: assignments } });
  });

  it("rejects missing material references and accidental whole-model selectors", () => {
    expect(() => defineBuildingKit({ parts: { wall: [{ model: "/panel.glb", materialAssignments: [{ materialId: "missing", selector: { slot: "Cladding" } }] }] } })).toThrow(/missing/);
    expect(() => defineBuildingKit({ materialAssets: [createMaterialTemplate("stone", "facade")], parts: { wall: [{ model: "/panel.glb", materialAssignments: [{ materialId: "facade", selector: {} }] }] } })).toThrow(/selector|Choose/);
  });
});


test("kit height-map limits reject assigned displacement while allowing unused document assets", () => {
  const raised = { ...createMaterialTemplate("stone", "raised"), textures: { height: { url: "/height.png", colorSpace: "linear" as const } } };
  const flat = createMaterialTemplate("stone", "flat");
  expect(() => defineBuildingKit({ materialAssets: [raised], parts: { wall: [{ model: "/panel.glb", materialAssignments: [{ materialId: "raised", selector: { slot: "Facade" } }] }] } })).toThrow(/height maps unsupported/);
  expect(defineBuildingKit({ materialAssets: [raised, flat], parts: { wall: [{ model: "/panel.glb", materialAssignments: [{ materialId: "flat", selector: { slot: "Facade" } }] }] } }).materialAssets).toEqual([raised, flat]);
});
