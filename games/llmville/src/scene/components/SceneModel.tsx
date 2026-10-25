import { useGLTF } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { Mesh, type Object3D } from "three";

import { resolveAssetTransform, type AssetTransformInput } from "@llmville/game/world/assetFrame";
import { measureObjectBounds } from "@/scene/meshBounds";
import { registerModelBounds } from "@/scene/modelBoundsCache";
import type { WorldModelAsset } from "@llmville/game/world/worldModelCatalog";
import type { GridFootprint } from "@llmville/game/world/grid";

// Dev-only: prevent spammy per-frame asset scale logs
const _loggedAssets = new Set<string>();

interface SceneModelProps {
  asset: WorldModelAsset;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  placementDirection?: 0 | 1 | 2 | 3;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Optional footprint override from the placement spec (e.g. in map decor).
   *  If provided, used for fitFootprint instead of asset.footprint.
   *  This allows per-placement sizing.
   */
  footprint?: GridFootprint;
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

function SceneModelWithPath({
  asset,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale,
  placementDirection,
  castShadow = true,
  receiveShadow = true,
  footprint,
}: SceneModelProps & { asset: WorldModelAsset & { modelPath: string } }) {
  const gltf = useGLTF(asset.modelPath);
  const object = useMemo(() => {
    const cloned = gltf.scene.clone(true);

    // Fix common broken GLTF exports that reference missing external textures (e.g. "Textures/colormap.png")
    // These often come from older asset packs. We null the map and let the base color / material handle it.
    cloned.traverse((child) => {
      if (child instanceof Mesh) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat: any) => {
          if (mat && mat.map) {
            const tex = mat.map;
            const isBroken =
              !tex.image ||
              (tex.image as any).width === 0 ||
              ((tex as any).isDataTexture === false && (tex.image as any).complete === false);

            if (isBroken) {
              if (import.meta.env.DEV) {
                console.warn(
                  `[LLMville] Dropped missing texture from model "${asset.modelPath}". ` +
                    `Original ref likely "Textures/colormap.png" or similar external asset path. ` +
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
  }, [gltf.scene, asset.modelPath]);

  const measuredExtents = useMemo(() => measureObjectBounds(object), [object]);

  useLayoutEffect(() => {
    registerModelBounds(asset.modelPath, measuredExtents);
  }, [asset.modelPath, measuredExtents]);

  const transform = resolveAssetTransform(
    { ...buildTransformInput(asset, position, rotation, scale, placementDirection, footprint), measuredExtents },
  );

  // Guarantee the fit scale is applied to the GLTF root (belt + suspenders with the primitive scale prop).
  // This ensures authored GLB sizes are always forced to the declared footprint.
  useLayoutEffect(() => {
    const s = transform.scale;
    if (s && (object.scale.x !== s[0] || object.scale.y !== s[1] || object.scale.z !== s[2])) {
      object.scale.set(s[0], s[1], s[2]);
    }
  }, [object, transform.scale]);

  useLayoutEffect(() => {
    applyShadowFlags(object, castShadow, receiveShadow);
  }, [castShadow, object, receiveShadow]);

  // One-time dev log: show native GLB size + the effective size after our single scaling function.
  useEffect(() => {
    if (import.meta.env.DEV && measuredExtents) {
      const key = asset.modelPath || asset.label || 'unknown';
      if (!_loggedAssets.has(key)) {
        _loggedAssets.add(key);
        const hFeet = (measuredExtents.height || 0) * 3.28084;
        const fit = transform.scale[0];
        const finalH = (measuredExtents.height || 0) * fit;
        const finalHFeet = finalH * 3.28084;
        console.log(
          `[ASSET SCALE] ${asset.label || asset.modelPath} ` +
          `measured: ${measuredExtents.width.toFixed(2)}w x ${measuredExtents.height.toFixed(2)}h x ${measuredExtents.depth.toFixed(2)}d m ` +
          `≈ ${ (measuredExtents.width||0)*3.28 } x ${hFeet.toFixed(1)}ft tall ` +
          `(human 6ft ref = ${ (hFeet / 6).toFixed(2) }x human)  ` +
          `→ fit×${fit.toFixed(3)}  final≈${finalH.toFixed(2)}m / ${finalHFeet.toFixed(1)}ft`
        );
      }
    }
  }, [asset.label, asset.modelPath, measuredExtents, transform.scale]);

  return (
    <primitive
      object={object}
      position={transform.position}
      rotation={transform.rotation}
      scale={transform.scale}
    />
  );
}

export function SceneModel(props: SceneModelProps) {
  if (!props.asset.modelPath) {
    return null;
  }
  return <SceneModelWithPath {...props} asset={{ ...props.asset, modelPath: props.asset.modelPath }} footprint={props.footprint} />;
}

export function preloadSceneModel(modelPath: string): void {
  useGLTF.preload(modelPath);
}
