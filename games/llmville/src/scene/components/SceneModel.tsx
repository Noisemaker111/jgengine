import { Mesh, type Object3D } from "three";

import { resolveAssetTransform, type AssetTransformInput } from "@llmville/game/world/assetFrame";
import { measureObjectBounds } from "../meshBounds";
import { registerModelBounds } from "../modelBoundsCache";
import type { WorldModelAsset } from "@llmville/game/world/worldModelCatalog";
import type { GridFootprint } from "@llmville/game/world/grid";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { loadDraw } from "@jgengine/core/frame/loadDraw.draw";
import { sharedGltfLoader } from "@jgengine/core/model/modelLoad.draw";
import { MeshStandardMaterial } from "three";

// Dev-only: prevent spammy per-frame asset scale logs
const _loggedAssets = new Set<string>();

interface SceneModelProps {
  asset: WorldModelAsset;
  position?: [number, number, number] | undefined;
  rotation?: [number, number, number] | undefined;
  scale?: [number, number, number] | number | undefined;
  placementDirection?: 0 | 1 | 2 | 3 | undefined;
  castShadow?: boolean | undefined;
  receiveShadow?: boolean | undefined;
  /** Optional footprint override from the placement spec (e.g. in map decor).
   *  If provided, used for fitFootprint instead of asset.footprint.
   *  This allows per-placement sizing.
   */
  footprint?: GridFootprint | undefined;
}

function applyShadowFlags(root: Object3D, castShadow: boolean, receiveShadow: boolean) {
  root.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = castShadow;
      child.receiveShadow = receiveShadow;
    }
  });
}

function buildTransformInput(
  asset: WorldModelAsset,
  position: [number, number, number],
  rotation: [number, number, number],
  scale: [number, number, number] | number | undefined,
  placementDirection: 0 | 1 | 2 | 3 | undefined,
  footprintOverride?: GridFootprint,
): AssetTransformInput {
  return {
    frame: asset.frame,
    footprint: footprintOverride ?? asset.footprint,
    placementDirection,
    instancePosition: position,
    instanceRotation: rotation,
    instanceScale: scale,
    baseRotation: asset.baseRotation,
    basePosition: asset.basePosition,
    baseScale: asset.baseScale,
    defaultScale: asset.defaultScale,
  };
}

export function SceneModel(props: SceneModelProps) {
  if (!props.asset.modelPath) {
    return null;
  }
  const asset = { ...props.asset, modelPath: props.asset.modelPath };
  return <SceneModelResolved {...props} asset={asset} />;
}

function SceneModelResolved(props: SceneModelProps & { asset: WorldModelAsset & { modelPath: string } }) {
  const { asset, position = [0, 0, 0], rotation = [0, 0, 0], scale, placementDirection, castShadow = true, receiveShadow = true, footprint } = props;
  const depKey = JSON.stringify([asset, position, rotation, scale, placementDirection, castShadow, receiveShadow, footprint]);
  return (
    <EngineDrawMount
      create={sceneModelDrawFactory({
        asset, position, rotation, scale, placementDirection, castShadow, receiveShadow, footprint,
      })}
      deps={[asset.modelPath, depKey]}
    />
  );
}

function sceneModelDrawFactory(input: {
  asset: WorldModelAsset & { modelPath: string };
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number] | number | undefined;
  placementDirection: 0 | 1 | 2 | 3 | undefined;
  castShadow: boolean;
  receiveShadow: boolean;
  footprint: GridFootprint | undefined;
}) {
  const { asset, position, rotation, scale, placementDirection, castShadow, receiveShadow, footprint } = input;
  return () =>
    loadDraw({
      load: () => sharedGltfLoader.loadAsync(asset.modelPath),
      key: `llmville-scene-model:${asset.modelPath}`,
      build: (gltf, parent) => {
        const object = cloneAndRepairModel(gltf.scene, asset.modelPath);
        const measuredExtents = measureObjectBounds(object);
        registerModelBounds(asset.modelPath, measuredExtents);
        const transform = resolveAssetTransform({
          ...buildTransformInput(asset, position, rotation, scale, placementDirection, footprint),
          measuredExtents,
        });
        object.position.set(transform.position[0], transform.position[1], transform.position[2]);
        object.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
        object.scale.set(transform.scale[0], transform.scale[1], transform.scale[2]);
        applyShadowFlags(object, castShadow, receiveShadow);
        parent.add(object);
        logAssetScaleOnce(asset, measuredExtents, transform.scale[0]);
      },
    });
}

function cloneAndRepairModel(scene: Object3D, modelPath: string): Object3D {
  const cloned = scene.clone(true);
  cloned.traverse((child) => {
    if (child instanceof Mesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((entry) => {
        const mat = entry as MeshStandardMaterial;
        if (mat?.map) {
          const tex = mat.map;
          const isBroken =
            !tex.image ||
            (tex.image as { width?: number }).width === 0 ||
            ((tex as { isDataTexture?: boolean }).isDataTexture === false &&
              (tex.image as { complete?: boolean }).complete === false);
          if (isBroken) {
            if (import.meta.env.DEV) {
              console.warn(
                `[LLMville] Dropped missing texture from model "${modelPath}". ` +
                  `The model will use its base material color.`
              );
            }
            mat.map = null;
            mat.needsUpdate = true;
          }
        }
      });
    }
  });
  return cloned;
}

function logAssetScaleOnce(asset: WorldModelAsset, measuredExtents: ReturnType<typeof measureObjectBounds>, fit: number): void {
  if (!import.meta.env.DEV) return;
  const key = asset.modelPath || asset.label || "unknown";
  if (_loggedAssets.has(key)) return;
  _loggedAssets.add(key);
  const hFeet = (measuredExtents.height || 0) * 3.28084;
  const finalH = (measuredExtents.height || 0) * fit;
  const finalHFeet = finalH * 3.28084;
  console.log(
    `[ASSET SCALE] ${asset.label || asset.modelPath} ` +
      `measured: ${measuredExtents.width.toFixed(2)}w x ${measuredExtents.height.toFixed(2)}h x ${measuredExtents.depth.toFixed(2)}d m ` +
      `≈ ${(measuredExtents.width || 0) * 3.28} x ${hFeet.toFixed(1)}ft tall ` +
      `(human 6ft ref = ${(hFeet / 6).toFixed(2)}x human)  ` +
      `→ fit×${fit.toFixed(3)}  final≈${finalH.toFixed(2)}m / ${finalHFeet.toFixed(1)}ft`
  );
}

export function preloadSceneModel(modelPath: string): void {
  void sharedGltfLoader.loadAsync(modelPath).catch(() => {});
}
