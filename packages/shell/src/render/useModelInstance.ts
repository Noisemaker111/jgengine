import { useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Group, type Object3D } from "three";

import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { measureLocalBounds } from "./measureBounds";
import { detectKtx2Support, sharedGltfLoader } from "./modelLoad";
import { cloneModelScene, disposeModelScene, modelPlacementTransform } from "./modelRender";
import { useModelAnimation } from "./useModelAnimation";

/** Model loading, placement, shadows and animation for a custom renderer. */
export type ModelInstanceConfig = Pick<ModelConfig,
  "url" | "scale" | "targetHeight" | "y" | "anchor" | "dims" | "shadows" | "animation"
>;

/** Caller-owned styling runs on the isolated clone, never the loader cache. */
export interface ModelInstanceOptions {
  instanceId?: string;
  /** Configure each new clone before placement measurement. Memoize this callback; changing it replaces the instance. Materials are isolated; geometry/textures stay borrowed. */
  configure?: (content: Object3D) => void;
}

/** Render `scene` with `position` and uniform `scale`; animate or deform `content` inside that placement frame. */
export interface ModelInstance {
  content: Object3D;
  scene: Group;
  scale: number;
  position: [number, number, number];
}

/**
 * Load and own an isolated model instance, preserving imported transforms and measuring placement at bind pose.
 * Mount `scene` with the returned position/scale. Custom materials, deformation and surrounding geometry stay caller-owned.
 * Must run inside an R3F canvas and Suspense boundary; a game provider is optional.
 * @capability model-instance own loading, clone cleanup, placement and animation for a custom model renderer
 */
export function useModelInstance(model: ModelInstanceConfig, options: ModelInstanceOptions = {}): ModelInstance {
  const renderer = useThree(state => state.gl);
  if ((renderer as typeof renderer & { isWebGLRenderer?: boolean }).isWebGLRenderer) detectKtx2Support(renderer);
  const gltf = useLoader(sharedGltfLoader, model.url);
  const { configure, instanceId } = options;
  const { content, scene, bindBounds } = useMemo(() => {
    const content = cloneModelScene(gltf.scene, { shadows: model.shadows });
    try {
      configure?.(content);
      const scene = new Group().add(content);
      return { content, scene, bindBounds: measureLocalBounds(scene) };
    } catch (error) {
      disposeModelScene(content);
      throw error;
    }
  }, [gltf.scene, model.shadows, configure]);
  const placement = useMemo(() => modelPlacementTransform(scene, model, bindBounds),
    [scene, bindBounds, model.scale, model.targetHeight, model.y, model.anchor, model.dims]);
  useEffect(() => () => disposeModelScene(content), [content]);
  useModelAnimation(content, gltf.animations, model.animation, instanceId);
  return { content, scene, ...placement };
}
