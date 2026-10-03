import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { PaintStroke } from "@jgengine/core/scene/paintLayer";
import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { measureLocalBounds, type MeasuredLocalBounds } from "./measureBounds";
import { copyModelBindPose } from "./modelBindPose";

export const PAINT_TEXTURE_SIZE = 512;

/** Shadow participation applied to every mesh of a cloned model; mirrors `ModelConfig.shadows`. */
export type ModelShadowMode = "cast" | "receive" | "both" | "none";

const modelResources = new WeakMap<THREE.Object3D, { materials: Set<THREE.Material>; skeletons: Set<THREE.Skeleton> }>();

/** Resolve placement from bind bounds in the frame containing the imported root, shared by rendering and collider measurement. @internal */
export function modelPlacementTransform(root: THREE.Object3D, model: ModelConfig, bindBounds?: MeasuredLocalBounds | null): { scale: number; position: [number, number, number] } {
  let scale = model.scale ?? 1;
  let minY = 0;
  let centerX = 0;
  let centerZ = 0;
  const bounds = model.targetHeight === undefined ? null : bindBounds === undefined ? measureLocalBounds(root) : bindBounds;
  const height = bounds === null ? 0 : bounds.max[1] - bounds.min[1];
  if (bounds !== null && Number.isFinite(height) && height > 0) {
    scale *= model.targetHeight! / height;
    minY = bounds.min[1];
    centerX = (bounds.min[0] + bounds.max[0]) / 2;
    centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  } else if ((model.anchor ?? "center") === "center" && model.dims !== undefined) {
    minY = model.dims.minY;
    centerX = model.dims.center.x;
    centerZ = model.dims.center.z;
  }
  return { scale, position: [-scale * centerX, (model.y ?? 0) - scale * minY, -scale * centerZ] };
}

/**
 * Clone a model with independent pose and materials, retaining shared geometry and textures.
 * @capability model-instance clone a loaded model for independent styling and animation
 */
export function cloneModelScene(
  source: THREE.Object3D,
  options?: { cloneMaterials?: boolean; shadows?: ModelShadowMode },
): THREE.Object3D {
  const clone = cloneSkinned(source) as THREE.Object3D;
  copyModelBindPose(source, clone);
  const shadows = options?.shadows ?? "both";
  const cloneMaterials = options?.cloneMaterials !== false;
  const materials = new Map<THREE.Material, THREE.Material>();
  const sourceSkeletons: THREE.Skeleton[] = [];
  source.traverse((node) => {
    if ((node as THREE.SkinnedMesh).isSkinnedMesh === true) sourceSkeletons.push((node as THREE.SkinnedMesh).skeleton);
  });
  const skeletons = new Map<THREE.Skeleton, THREE.Skeleton>();
  let skinnedIndex = 0;
  const cloneMaterial = (source: THREE.Material): THREE.Material => {
    let material = materials.get(source);
    if (material === undefined) {
      material = source.clone();
      materials.set(source, material);
    }
    return material;
  };
  clone.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh === true) {
      const skinned = mesh as THREE.SkinnedMesh;
      const sourceSkeleton = sourceSkeletons[skinnedIndex++]!;
      const shared = skeletons.get(sourceSkeleton);
      if (shared === undefined) skeletons.set(sourceSkeleton, skinned.skeleton);
      else skinned.skeleton = shared;
    }
    mesh.castShadow = shadows === "cast" || shadows === "both";
    mesh.receiveShadow = shadows === "receive" || shadows === "both";
    if (!cloneMaterials) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(cloneMaterial)
      : cloneMaterial(mesh.material);
  });
  modelResources.set(clone, { materials: new Set(materials.values()), skeletons: new Set(skeletons.values()) });
  return clone;
}

/**
 * Release materials and bone textures owned by `cloneModelScene`; shared assets and attached models remain owned by their callers.
 * @capability model-instance release a cloned model without disposing cached geometry or textures
 */
export function disposeModelScene(root: THREE.Object3D): void {
  const resources = modelResources.get(root);
  if (resources === undefined) return;
  for (const material of resources.materials) material.dispose();
  // Effect replay can recreate a bone texture on this same scene, so retain its ownership record.
  for (const skeleton of resources.skeletons) skeleton.dispose();
}

/** @internal */
export function disposeClonedMaterials(root: THREE.Object3D): void {
  const seen = new Set<THREE.Material>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (seen.has(material)) continue;
      seen.add(material);
      material.dispose();
    }
  });
}

function isMeshStandardMaterial(material: THREE.Material): material is THREE.MeshStandardMaterial {
  return (material as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
}

/** @internal */
export function standardMaterialsOf(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) if (isMeshStandardMaterial(material)) materials.push(material);
  });
  return materials;
}

export interface MaterialCache {
  materials: THREE.MeshStandardMaterial[];
  seedColor: THREE.Color;
}

/** @internal */
export function cacheStandardMaterials(root: THREE.Object3D, into?: MaterialCache | null): MaterialCache {
  if (into !== null && into !== undefined) return into;
  const materials = standardMaterialsOf(root);
  const seedColor = materials[0]?.color.clone() ?? new THREE.Color("#ffffff");
  return { materials, seedColor };
}

/** @internal */
export function applyPaintTextureToMaterials(
  materials: readonly THREE.MeshStandardMaterial[],
  paint: PaintCanvas,
): void {
  for (const material of materials) {
    material.map = paint.texture;
    material.needsUpdate = true;
  }
}

export interface PaintCanvas {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
}

/** @internal */
export function createPaintCanvas(seed: THREE.MeshStandardMaterial, size = PAINT_TEXTURE_SIZE): PaintCanvas {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  const seedImage = seed.map?.image as CanvasImageSource | undefined;
  if (seedImage !== undefined && (seedImage as { width?: number }).width) {
    context.drawImage(seedImage, 0, 0, size, size);
  } else {
    context.fillStyle = `#${seed.color.getHexString()}`;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = seed.map?.colorSpace ?? THREE.SRGBColorSpace;
  return { canvas, context, texture };
}

/** @internal */
export function disposePaintCanvas(paint: PaintCanvas): void {
  paint.texture.dispose();
  paint.canvas.width = 0;
  paint.canvas.height = 0;
}

/** @internal */
export function drawPaintStrokes(paint: PaintCanvas, strokes: readonly PaintStroke[]): void {
  const { canvas, context, texture } = paint;
  for (const stroke of strokes) {
    context.fillStyle = stroke.color;
    context.beginPath();
    context.arc(
      stroke.u * canvas.width,
      (1 - stroke.v) * canvas.height,
      stroke.radius * canvas.width,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  texture.needsUpdate = true;
}

/** @internal */
export function applyPaintTexture(root: THREE.Object3D, paint: PaintCanvas): void {
  applyPaintTextureToMaterials(standardMaterialsOf(root), paint);
}

/** @internal */
export function syncPaintCanvas(
  paint: PaintCanvas,
  seedColor: THREE.Color,
  strokes: readonly PaintStroke[],
  drawnCount: number,
): number {
  if (strokes.length < drawnCount) {
    const { canvas, context } = paint;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = `#${seedColor.getHexString()}`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawPaintStrokes(paint, strokes);
    return strokes.length;
  }
  if (strokes.length > drawnCount) {
    drawPaintStrokes(paint, strokes.slice(drawnCount));
    return strokes.length;
  }
  return drawnCount;
}
