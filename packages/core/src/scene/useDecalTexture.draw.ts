import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { DecalStyle } from "@jgengine/core/world/decalKind";
import { useDisposable } from "@jgengine/core/render/useDisposable.draw";
import { warmupWaitsFor } from "@jgengine/core/render/shaderWarmup.draw";
import { bakeDecal } from "./decalBakePool";
import { decalKey, knownDecal, type DecalPaint } from "./decalTexture";

/**
 * A procedural decal's texture, baked on a worker. Until the bake lands the texture is clear (alpha
 * 0), so the decal shows nothing rather than a black square, and the scene's covered warmup (the
 * loading cover, a travel card) waits for the bake, so a place is revealed with its decals painted.
 * A look baked before fills the texture at once. `configure` sets filtering and colour space; it
 * runs once, before the first upload.
 *
 * Baking on the main thread was ~13 ms per 256-pixel stencil: Deepward's 84 floor markings froze
 * the frame that mounted a floor for over a second.
 */
export function useDecalTexture(style: DecalStyle, seed: string, size: number, paint: DecalPaint, configure: (texture: THREE.DataTexture) => void): THREE.DataTexture {
  const scene = useThree((state) => state.scene);
  const { text, color } = paint;
  const texture = useDisposable(() => {
    const known = knownDecal(decalKey(style, seed, size, { text, color }));
    const next = new THREE.DataTexture(known?.data ?? new Uint8Array(size * size * 4), size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    configure(next);
    next.needsUpdate = true;
    return next;
    // `configure` is read once, at creation, like a texture loader's onLoad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, seed, size, text, color]);
  useEffect(() => {
    let live = true;
    const work = bakeDecal(style, seed, size, { text, color }).then((baked) => {
      if (!live || texture.image.data === baked.data) return;
      texture.image.data = baked.data;
      texture.needsUpdate = true;
    });
    warmupWaitsFor(scene, work);
    return () => {
      live = false;
    };
  }, [texture, scene, style, seed, size, text, color]);
  return texture;
}
