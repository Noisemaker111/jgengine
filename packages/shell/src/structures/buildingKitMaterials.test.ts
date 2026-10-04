import { expect, test } from "bun:test";
import * as THREE from "three";
import { defineBuildingKit, resolveBuildingKitPart } from "@jgengine/core/world/buildingKit";
import { createMaterialTemplate, type MaterialAsset } from "@jgengine/core/material/materialAsset";
import { createEditorSession } from "@jgengine/core/editor/commands";
import { createEmptyEditorDocument, importEditorDocumentJson } from "@jgengine/core/editor/document";
import { authoredMaterialAssignments } from "@jgengine/core/editor/materialAuthoring";
import { generateBuilding } from "@jgengine/core/world/buildings";
import { buildScatterModelSources, disposeScatterModelSources } from "../scatter/scatterModels";
import { configureMaterialTexture } from "../render/materialAsset";
import { bucketBuildingParts } from "./buildingKitFit";
import { buildingKitMaterialKey, buildBuildingKitSources, groupBuildingKitInstances } from "./buildingKitMaterials";

function authoredKit(color: string, tiling: [number, number], coating: number) {
  const facade: MaterialAsset = { ...createMaterialTemplate("coated-plastic", "facade"), surface: { color, roughness: 0.6, clearcoat: coating }, textures: { normal: { url: "/shared-normal.png", colorSpace: "linear", normalConvention: "directx", transform: { scale: tiling } } } };
  const roof = { ...createMaterialTemplate("stone", "roof"), surface: { color: "#556655", roughness: 0.9 } };
  const glass = { ...createMaterialTemplate("glass", "glass"), surface: { color: "#91b9ba", transmission: 0.65, roughness: 0.15 } };
  const unused = { ...createMaterialTemplate("stone", "unused"), textures: { color: { url: "/unused.png", colorSpace: "srgb" as const }, height: { url: "/unused-height.png", colorSpace: "linear" as const } } };
  const session = createEditorSession({ ...createEmptyEditorDocument(), materialAssets: [facade, roof, glass, unused], markers: [{ id: "panel", kind: "prop", catalogId: "panel", position: { x: 0, y: 0, z: 0 } }] });
  expect(session.transaction([
    { type: "assignMaterialAsset", ids: ["panel"], materialId: "facade", selector: { mesh: "Facade", slot: "Cladding", slotIndex: 0 } },
    { type: "assignMaterialAsset", ids: ["panel"], materialId: "roof", selector: { mesh: "Roof", slot: "Roofing" } },
    { type: "assignMaterialAsset", ids: ["panel"], materialId: "glass", selector: { mesh: "Window", slotIndex: 0 } },
  ]).ok).toBe(true);
  const document = importEditorDocumentJson(session.exportJson());
  return defineBuildingKit({ id: "caller-kit", materialAssets: document.materialAssets, parts: { wall: [{ model: "/shared-panel.glb", materialAssignments: authoredMaterialAssignments(document.markers[0]!.meta) }] } });
}

function imported() {
  const geometry = new THREE.BoxGeometry(), map = new THREE.Texture();
  const cladding = new THREE.MeshPhysicalMaterial({ color: "#eeeecc", clearcoat: 0.1, iridescence: 0.4, thickness: 0.7, ior: 1.65, map }); cladding.name = "Cladding";
  const trim = new THREE.MeshPhysicalMaterial({ color: "#554433", clearcoat: 0.9, roughness: 0.2, map }); trim.name = "Trim";
  const roofing = new THREE.MeshStandardMaterial({ color: "#999999", map }); roofing.name = "Roofing";
  const glass = new THREE.MeshPhysicalMaterial({ transmission: 0.2, thickness: 0.4 }); glass.name = "Glass";
  cladding.onBeforeCompile = function (this: THREE.Material, shader) { this.userData.compiled = true; shader.uniforms.native = { value: 7 }; };
  cladding.customProgramCacheKey = () => "imported-cladding";
  const root = new THREE.Group();
  for (const [name, material] of [["Facade", [cladding, trim]], ["Roof", roofing], ["Window", glass]] as const) { const mesh = new THREE.Mesh(geometry, material as THREE.Material | THREE.Material[]); mesh.name = name; root.add(mesh); }
  return { root, geometry, map, cladding, trim, roofing, glass };
}

test("editor-authored kit materials isolate two worlds sharing native meshes, maps and material IDs", () => {
  const source = imported(), kitA = authoredKit("#a45732", [2, 3], 0.8), kitB = authoredKit("#325ba4", [5, 7], 0.3);
  const partA = kitA.parts.wall![0]!, partB = kitB.parts.wall![0]!;
  expect(buildingKitMaterialKey(partA, kitA.materialAssets)).not.toBe(buildingKitMaterialKey(partB, kitB.materialAssets));
  const image = new THREE.Texture(), importedHeight = new THREE.Texture();
  source.cladding.displacementMap = importedHeight;
  const viewA = configureMaterialTexture("normal", kitA.materialAssets![0]!.textures!.normal!, image), viewB = configureMaterialTexture("normal", kitB.materialAssets![0]!.textures!.normal!, image);
  const a = buildBuildingKitSources(source.root, partA, kitA.materialAssets, undefined, new Map([["facade", { normal: viewA }]]));
  const b = buildBuildingKitSources(source.root, partB, kitB.materialAssets, undefined, new Map([["facade", { normal: viewB }]]));
  const facadeA = (a.sources[0]!.material as THREE.MeshPhysicalMaterial[])[0]!, facadeB = (b.sources[0]!.material as THREE.MeshPhysicalMaterial[])[0]!;
  const trimA = (a.sources[0]!.material as THREE.MeshPhysicalMaterial[])[1]!;
  try {
    expect(a.sources.length).toBe(3); expect(b.sources.length).toBe(3);
    expect(a.sources.every(entry => entry.geometry === source.geometry)).toBe(true);
    expect(facadeA.color.getHexString()).toBe("a45732"); expect(facadeB.color.getHexString()).toBe("325ba4");
    expect([facadeA.clearcoat, facadeB.clearcoat]).toEqual([0.8, 0.3]);
    expect([facadeA.iridescence, facadeA.thickness, facadeA.ior]).toEqual([0.4, 0.7, 1.65]);
    expect(facadeA.map).toBe(source.map); expect(facadeB.map).toBe(source.map);
    expect(facadeA.displacementMap).toBe(importedHeight); expect(facadeB.displacementMap).toBe(importedHeight);
    expect(facadeA.normalMap).toBe(viewA); expect(facadeB.normalMap).toBe(viewB);
    expect(viewA.repeat.toArray()).toEqual([2, 3]); expect(viewB.repeat.toArray()).toEqual([5, 7]); expect(image.repeat.toArray()).toEqual([1, 1]);
    expect(facadeA.normalScale.y).toBe(-1); expect(facadeB.normalScale.y).toBe(-1);
    expect(trimA.map).toBe(source.map); expect(trimA.color.equals(source.trim.color)).toBe(true); expect(trimA.clearcoat).toBe(0.9);
    expect((a.sources[1]!.material as THREE.MeshStandardMaterial).roughness).toBe(0.9);
    expect((b.sources[2]!.material as THREE.MeshPhysicalMaterial).transmission).toBe(0.65);
    const shader = { uniforms: {}, vertexShader: "", fragmentShader: "" };
    facadeA.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(facadeA.userData.compiled).toBe(true); expect(facadeB.userData.compiled).toBeUndefined(); expect(source.cladding.userData.compiled).toBeUndefined();
    expect(facadeA.customProgramCacheKey()).toBe("imported-cladding");
    expect(source.cladding.clearcoat).toBe(0.1); expect(source.cladding.color.getHexString()).toBe("eeeecc");
    let ownedDisposed = 0, otherDisposed = 0, borrowedDisposed = 0;
    facadeA.addEventListener("dispose", () => ownedDisposed++); facadeB.addEventListener("dispose", () => otherDisposed++);
    for (const borrowed of [source.cladding, source.map, source.geometry, viewA]) borrowed.addEventListener("dispose", () => borrowedDisposed++);
    disposeScatterModelSources(a.root);
    expect([ownedDisposed, otherDisposed, borrowedDisposed]).toEqual([1, 0, 0]);
    expect(facadeB.color.getHexString()).toBe("325ba4"); expect(facadeB.normalMap).toBe(viewB);
  } finally { disposeScatterModelSources(b.root); viewA.dispose(); viewB.dispose(); image.dispose(); importedHeight.dispose(); source.geometry.dispose(); source.map.dispose(); source.cladding.dispose(); source.trim.dispose(); source.roofing.dispose(); source.glass.dispose(); }
});

test("style bucketing excludes unused library edits and distinguishes assignments and sparse overrides", () => {
  const kit = authoredKit("#a45732", [2, 3], 0.8), part = kit.parts.wall![0]!, assets = kit.materialAssets!;
  const key = buildingKitMaterialKey(part, assets);
  expect(buildingKitMaterialKey(part, assets.map(asset => asset.id === "unused" ? { ...asset, surface: { color: "#112233" } } : asset))).toBe(key);
  expect(buildingKitMaterialKey({ ...part, materialAssignments: part.materialAssignments!.map(assignment => ({ ...assignment, overrides: { roughness: 0.25 } })) }, assets)).not.toBe(key);
  expect(buildingKitMaterialKey({ ...part, materialAssignments: [{ materialId: "facade", selector: { mesh: "Facade", slot: "Trim" } }] }, assets)).not.toBe(key);
  const building = generateBuilding({ floors: 10, baysWide: 10, baysDeep: 10, seed: "caller-bays" });
  const buckets = bucketBuildingParts([{ building }], null, kit);
  const instances = buckets.models.get(part.model)!;
  expect(instances.length).toBeGreaterThan(100);
  expect(new Set(instances.map(instance => buildingKitMaterialKey(instance.part, assets))).size).toBe(1);
  expect(resolveBuildingKitPart(kit, "roof").type).toBe("box");
  const first = assets[0]!, name = first.name;
  let serialized = 0;
  Object.defineProperty(first, "name", { enumerable: true, get() { serialized++; return name; } });
  const repeated = Array.from({ length: 10_000 }, (_, index) => instances[index % instances.length]!);
  const groups = groupBuildingKitInstances(repeated, { size: [1, 1, 1], center: [0, 0, 0] }, assets);
  expect(groups.length).toBe(1); expect(groups[0]!.matrices.length).toBe(10_000);
  expect(serialized).toBeLessThan(10);
});

test("scoped kit preparation rejects invalid selectors without changing imports or relaxing scatter safeguards", () => {
  const source = imported(), kit = authoredKit("#a45732", [2, 3], 0.8), part = kit.parts.wall![0]!;
  try {
    expect(() => buildBuildingKitSources(source.root, { ...part, materialAssignments: [{ materialId: "facade", selector: { mesh: "Facade", slot: "Cladding", slotIndex: 1 } }] }, kit.materialAssets)).toThrow(/matched no slots/);
    expect(source.cladding.clearcoat).toBe(0.1); expect((source.root.children[0] as THREE.Mesh).material).toEqual([source.cladding, source.trim]);
    expect(() => buildScatterModelSources(source.root, { url: part.model, materialAssets: kit.materialAssets, materialAssignments: part.materialAssignments })).toThrow(/individual model renderer/);
  } finally { source.geometry.dispose(); source.map.dispose(); source.cladding.dispose(); source.trim.dispose(); source.roofing.dispose(); source.glass.dispose(); }
});


test("unsupported authored displacement and invalid map targets fail before any model material allocation", () => {
  const source = imported(), kit = authoredKit("#a45732", [2, 3], 0.8), part = kit.parts.wall![0]!;
  const clone = source.cladding.clone.bind(source.cladding);
  let cloned = 0;
  source.cladding.clone = () => { cloned++; return clone(); };
  const raised = { ...kit.materialAssets![0]!, textures: { height: { url: "/height.png", colorSpace: "linear" as const } } };
  try {
    expect(() => buildBuildingKitSources(source.root, { ...part, materialAssignments: [{ materialId: "facade", selector: { mesh: "Facade", slot: "Cladding" } }] }, [raised])).toThrow(/height maps unsupported/);
    expect(cloned).toBe(0); expect(source.cladding.clearcoat).toBe(0.1); expect(source.cladding.map).toBe(source.map);
    expect(() => buildBuildingKitSources(source.root, { ...part, materialAssignments: [{ materialId: "facade", selector: {} }] }, kit.materialAssets)).toThrow(/Choose|selector/);
    expect(cloned).toBe(0);
    source.geometry.deleteAttribute("uv");
    expect(() => buildBuildingKitSources(source.root, part, kit.materialAssets)).toThrow(/UV set/);
    expect(cloned).toBe(0); expect((source.root.children[0] as THREE.Mesh).material).toEqual([source.cladding, source.trim]);
  } finally { source.geometry.dispose(); source.map.dispose(); source.cladding.dispose(); source.trim.dispose(); source.roofing.dispose(); source.glass.dispose(); }
});
