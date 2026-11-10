import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { collapseHead, keepHeadUnderEye } from "@jgengine/core/camera/firstPersonBody.draw";

import {
  buildInstance,
  disposeInstance,
  loadGltf,
  type BuiltInstance,
} from "./entityModelDraw.draw";

/** Model loading, placement, shadows and animation for a custom renderer. */
export type ModelInstanceConfig = Pick<
  ModelConfig,
  | "url"
  | "scale"
  | "targetHeight"
  | "y"
  | "anchor"
  | "dims"
  | "shadows"
  | "animation"
  | "hiddenNodes"
  | "surfaceDetail"
  | "wind"
  | "lod"
>;

/** Caller-owned styling runs on the isolated clone, never the loader cache. */
export interface ModelInstanceOptions {
  instanceId?: string | undefined;
  /** Configure each new clone before placement measurement. Memoize this callback; changing it replaces the instance. Materials are isolated; geometry/textures stay borrowed. */
  configure?: (content: THREE.Object3D) => void;
  /**
   * Drive the default locomotion graph from the entity's velocity when the model leaves `animation`
   * unset. `false` holds the idle clip instead. Default true.
   */
  locomotion?: boolean | undefined;
}

/** The built instance handed to `onReady` once the model has loaded and placed. */
export interface ModelInstanceReady {
  /** The unscaled content group the animation/IK drivers pose. */
  content: THREE.Object3D;
  /** The unscaled content wrapper group. */
  scene: THREE.Group;
  /** The placed group (position + uniform scale) added under the draw's parent. */
  group: THREE.Group;
  scale: number;
  position: [number, number, number];
  gltf: GLTF;
}

export interface ModelInstanceDrawOptions extends ModelInstanceOptions {
  /** Runs once after the model loads, places and binds its animation driver; return a cleanup. */
  onReady?: (ready: ModelInstanceReady) => (() => void) | void;
}

/**
 * The draw-side {@link ModelInstanceConfig} renderer: loads the shared GLTF, clones and places
 * the model through the same build path entity draws use, then poses it every frame. Mount under
 * an {@link EngineSceneContext} parent (or the scene root) for the world transform.
 */
export function modelInstanceDraw(model: ModelInstanceConfig, options: ModelInstanceDrawOptions = {}): EngineDraw {
  let built: BuiltInstance | null = null;
  let frameState: EngineFrameState | null = null;
  let disposed = false;
  let offReady: (() => void) | null = null;
  return {
    mount(state) {
      frameState = state;
      void loadGltf(model.url)
        .then((gltf) => {
          if (disposed) return;
          built = buildInstance(
            {
              model,
              gltf,
              instanceId: options.instanceId,
              configure: options.configure,
              locomotion: options.locomotion,
              ctx: null,
              invalidate: () => frameState?.invalidate(),
            },
            state.gl,
          );
          state.scene.add(built.group);
          offReady =
            options.onReady?.({
              content: built.content,
              scene: built.scene,
              group: built.group,
              scale: built.scale,
              position: built.position,
              gltf,
            }) ?? null;
        })
        .catch((error: unknown) => {
          if (disposed) return;
          if (typeof console !== "undefined") {
            console.warn(`[jgengine] modelInstanceDraw "${model.url}" failed to load or build.`, error);
          }
        });
    },
    frame(state) {
      frameState = state;
      if (built === null) return;
      built.animation?.pose(state.delta);
      if (built.head !== null) {
        collapseHead(built.head);
        keepHeadUnderEye(built.content, built.head, state.camera, built.bodyRest);
      }
      built.arms?.();
    },
    dispose(state) {
      disposed = true;
      offReady?.();
      offReady = null;
      if (built !== null) {
        state.scene.remove(built.group);
        disposeInstance(built);
        built = null;
      }
      frameState = null;
    },
  };
}
