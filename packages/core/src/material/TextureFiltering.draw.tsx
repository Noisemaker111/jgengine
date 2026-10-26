import { useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import * as THREE from "three";

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
export function TextureFiltering({ anisotropy }: { anisotropy: number }): null {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useLayoutEffect(() => {
    const target = Math.max(1, Math.min(anisotropy, gl.capabilities.getMaxAnisotropy()));
    const previous = THREE.Texture.DEFAULT_ANISOTROPY;
    if (previous === target) return;
    THREE.Texture.DEFAULT_ANISOTROPY = target;
    retuneTextureAnisotropy(scene, previous, target);
    return () => {
      THREE.Texture.DEFAULT_ANISOTROPY = previous;
    };
  }, [gl, scene, anisotropy]);
  return null;
}
