import * as THREE from "three";
import type { BuildingKitPart } from "@jgengine/core/world/buildingKit";
import { validateMaterialAssignments, type MaterialAsset } from "@jgengine/core/material/materialAsset";
import type { MaterialOverrideTextures } from "../materialOverride";
import { applyMaterialAssignments, validateMaterialAssignmentTargets } from "../render/materialAsset";
import { buildScatterModelSources, disposeScatterModelSources } from "../scatter/scatterModels";
import { composeBuildingKitMatrix, type BuildingKitInstance, type BuildingKitModelBounds } from "./buildingKitFit";
import { applyBuildingSurface, surfaceKey } from "./buildingSurface";

/** The material values used by one kit variant, excluding unrelated document library entries. @internal */
export function buildingKitMaterialKey(part: BuildingKitPart, assets: readonly MaterialAsset[] = []): string {
  const ids = new Set(part.materialAssignments?.map(assignment => assignment.materialId));
  return JSON.stringify([part.tint ?? "", surfaceKey(part.material), part.materialAssignments ?? [], assets.filter(asset => ids.has(asset.id))]);
}

/** One material style shared by every fitted instance using it. @internal */
export interface BuildingKitStyleGroup {
  key: string;
  part: BuildingKitPart;
  matrices: THREE.Matrix4[];
}

/** Group fitted instances while resolving each repeated variant's material identity only once. @internal */
export function groupBuildingKitInstances(instances: readonly BuildingKitInstance[], bounds: BuildingKitModelBounds, assets: readonly MaterialAsset[] = []): BuildingKitStyleGroup[] {
  const byKey = new Map<string, BuildingKitStyleGroup>();
  const styleKeys = new Map<BuildingKitPart, string>();
  for (const instance of instances) {
    const matrix = composeBuildingKitMatrix(instance, bounds, new THREE.Matrix4());
    let key = styleKeys.get(instance.part);
    if (key === undefined) { key = buildingKitMaterialKey(instance.part, assets); styleKeys.set(instance.part, key); }
    const bucket = byKey.get(key);
    if (bucket === undefined) byKey.set(key, { key, part: instance.part, matrices: [matrix] });
    else bucket.matrices.push(matrix);
  }
  return [...byKey.values()];
}

/** Validate named kit materials and native targets before any owned model or texture allocation. @internal */
export function validateBuildingKitSource(scene: THREE.Object3D, part: BuildingKitPart, assets: readonly MaterialAsset[] = []): void {
  const assignments = part.materialAssignments ?? [];
  const errors = validateMaterialAssignments(assignments, assets, { disallowedTextureRoles: ["height"] }).filter(item => item.severity === "error");
  if (errors.length > 0) throw new Error(`Building kit ${part.model}: ${errors.map(item => `${item.path}: ${item.message}`).join("; ")}`);
  validateMaterialAssignmentTargets(scene, assets, assignments);
}

/** Prepare one style's owned model materials before harvesting shared geometry for bounded instanced chunks. @internal */
export function buildBuildingKitSources(
  scene: THREE.Object3D,
  part: BuildingKitPart,
  assets: readonly MaterialAsset[] = [],
  surfaceTextures?: MaterialOverrideTextures,
  assetTextures: ReadonlyMap<string, MaterialOverrideTextures> = new Map(),
): ReturnType<typeof buildScatterModelSources> {
  validateBuildingKitSource(scene, part, assets);
  const prepared = buildScatterModelSources(scene, { url: part.model });
  try {
    const tint = part.tint === undefined || part.tint === "" ? undefined : new THREE.Color(part.tint);
    prepared.root.traverseVisible(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (tint !== undefined && "color" in material) (material as THREE.MeshStandardMaterial).color.copy(tint);
        if (part.material !== undefined && (material as THREE.MeshStandardMaterial).isMeshStandardMaterial) applyBuildingSurface(material as THREE.MeshStandardMaterial, part.material, surfaceTextures);
      }
    });
    if (part.materialAssignments?.length) applyMaterialAssignments(prepared.root, assets, part.materialAssignments, assetTextures);
    let index = 0;
    prepared.root.traverseVisible(node => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) prepared.sources[index++]!.material = mesh.material;
    });
    return prepared;
  } catch (error) {
    disposeScatterModelSources(prepared.root);
    throw error;
  }
}
