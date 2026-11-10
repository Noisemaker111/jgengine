// @skill jgengine-assets
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

const TEXTURE_SLOTS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "emissiveMap",
  "bumpMap",
  "alphaMap",
  "displacementMap",
] as const;

/**
 * Retune already-loaded textures that still carry the old default anisotropy. Textures a
 * system set on purpose (pixel-art sprites pin 1) keep their value.
 * @internal
 */
export function retuneTextureAnisotropy(root: THREE.Object3D, from: number, to: number): number {
  const seen = new Set<THREE.Texture>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.material === undefined) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const slots = material as unknown as Record<string, THREE.Texture | null | undefined>;
      for (const slot of TEXTURE_SLOTS) {
        const texture = slots[slot];
        if (texture === null || texture === undefined || seen.has(texture)) continue;
        seen.add(texture);
        if (texture.anisotropy !== from) continue;
        texture.anisotropy = to;
        texture.needsUpdate = true;
      }
    }
  });
  return seen.size;
}

/**
 * Applies the player's texture-filtering choice. Sets three's construction-time default so
 * every texture loaded afterwards (GLTF, texture loaders) samples anisotropically, and walks the
 * scene once per change for textures loaded before. No per-frame work.
 * @internal shell-internal; driven by `GraphicsProfile.anisotropy`.
 */
export function textureFilteringDraw(getAnisotropy: () => number): EngineDraw {
  let original: number | null = null;
  const sync = (state: EngineFrameState) => {
    const target = Math.max(1, Math.min(getAnisotropy(), state.gl.capabilities.getMaxAnisotropy()));
    if (original === null) original = THREE.Texture.DEFAULT_ANISOTROPY;
    const current = THREE.Texture.DEFAULT_ANISOTROPY;
    if (current === target) return;
    THREE.Texture.DEFAULT_ANISOTROPY = target;
    retuneTextureAnisotropy(state.scene, current, target);
  };
  return {
    mount: sync,
    update: sync,
    dispose() {
      if (original !== null) {
        THREE.Texture.DEFAULT_ANISOTROPY = original;
        original = null;
      }
    },
  };
}

/**
 * Applies the player's texture-filtering choice. Sets three's construction-time default so
 * every texture loaded afterwards (GLTF, texture loaders) samples anisotropically, and walks the
 * scene once per change for textures loaded before. No per-frame work.
 * @internal shell-internal; driven by `GraphicsProfile.anisotropy`.
 */
export function TextureFiltering({ anisotropy }: { anisotropy: number }) {
  const latest = useRef(anisotropy);
  latest.current = anisotropy;
  useEngineDraw(() => textureFilteringDraw(() => latest.current), []);
  return null;
}
