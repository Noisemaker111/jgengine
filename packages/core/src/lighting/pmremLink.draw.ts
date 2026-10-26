import * as THREE from "three";

import { linkAhead } from "@jgengine/core/render/shaderWarmup.draw";

/** The generator's own materials, which three keeps private; read to link them before the bake. */
interface PmremInternals {
  _setSize?(size: number): void;
  _allocateTargets?(): THREE.WebGLRenderTarget;
  _blurMaterial?: THREE.Material | null;
  _ggxMaterial?: THREE.Material | null;
}

/** The camera bake sources are linked with; a cube face's, which is what a bake draws them through. @internal */
export const PMREM_BAKE_CAMERA = new THREE.PerspectiveCamera(90, 1, 0.1, 100);

/**
 * Link everything a PMREM bake of `size` draws before it draws, without blocking the thread: the
 * source (a probe scene, or the equirect/cube shader via `compileSource`) and the generator's
 * blur and GGX filters, which three sizes to the bake. A bake that links on the spot waits on the
 * driver for each program, over a second on a cold cache, while the menu above the canvas is
 * meant to answer clicks. Never rejects: linking ahead only saves the bake its wait.
 * @internal
 */
export async function linkPmremBake(gl: THREE.WebGLRenderer, pmrem: THREE.PMREMGenerator, size: number, compileSource: () => void, stop: () => boolean): Promise<void> {
  const internals = pmrem as unknown as PmremInternals;
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  try {
    await linkAhead(
      gl,
      () => {
        const previous = gl.getRenderTarget();
        // The bake draws into half-float targets, linear with no tone map; any target links those programs.
        gl.setRenderTarget(target);
        try {
          compileSource();
          if (internals._setSize !== undefined && internals._allocateTargets !== undefined) {
            internals._setSize(size);
            internals._allocateTargets().dispose();
            for (const material of [internals._blurMaterial, internals._ggxMaterial]) {
              if (material != null) gl.compile(new THREE.Mesh(new THREE.BufferGeometry(), material), PMREM_BAKE_CAMERA);
            }
          }
        } finally {
          gl.setRenderTarget(previous);
        }
      },
      stop,
    );
  } catch {
    // A renderer that refuses the early link still bakes; it just waits at the bake.
  } finally {
    target.dispose();
  }
}
