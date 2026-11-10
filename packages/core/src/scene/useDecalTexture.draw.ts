import * as THREE from "three";
import type { DecalStyle } from "@jgengine/core/world/decalKind";
import type { EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { warmupWaitsFor } from "@jgengine/core/render/shaderWarmup.draw";
import { bakeDecal } from "./decalBakePool";
import { decalKey, knownDecal, type DecalPaint } from "./decalTexture";

/** A decal texture plus its in-flight bake, owned by a draw instead of a hook. @internal */
export interface DecalTextureLease {
  readonly texture: THREE.DataTexture;
  /** Free the texture; a late bake landing after this is dropped. */
  dispose(): void;
}

/**
 * Draw-side form of {@link useDecalTexture}: the same clear-until-baked texture, the same worker
 * bake counted in the scene's covered warmup, and the same known-bake fast path.
 * @internal
 */
export function acquireDecalTexture(
  style: DecalStyle,
  seed: string,
  size: number,
  paint: DecalPaint,
  configure: (texture: THREE.DataTexture) => void,
  state: EngineFrameState,
): DecalTextureLease {
  const scene = state.rootScene ?? state.scene;
  const { text, color } = paint;
  const known = knownDecal(decalKey(style, seed, size, { text, color }));
  const texture = new THREE.DataTexture(known?.data ?? new Uint8Array(size * size * 4), size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  configure(texture);
  texture.needsUpdate = true;
  let live = true;
  const work = bakeDecal(style, seed, size, { text, color }).then((baked) => {
    if (!live || texture.image.data === baked.data) return;
    texture.image.data = baked.data;
    texture.needsUpdate = true;
  });
  warmupWaitsFor(scene, work);
  return {
    texture,
    dispose() {
      live = false;
      texture.dispose();
    },
  };
}
