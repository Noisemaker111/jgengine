import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { PaintStroke } from "@jgengine/core/scene/paintLayer";

export const PAINT_TEXTURE_SIZE = 512;

/** @internal */
export function cloneModelScene(source: THREE.Object3D, options?: { cloneMaterials?: boolean }): THREE.Object3D {
  const clone = cloneSkinned(source) as THREE.Object3D;
  if (options?.cloneMaterials === false) return clone;
  clone.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => material.clone())
      : mesh.material.clone();
  });
  return clone;
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
