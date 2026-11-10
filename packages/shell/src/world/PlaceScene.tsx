import { useMemo } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { PlaceWorldFeature } from "@jgengine/core/placement/place";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { defaultSurfaceMaterial } from "@jgengine/core/material/defaultSurface.draw";

/** Render extent (m) standing in for an `Infinity` flat-ground axis — far past the default fog. */
const UNBOUNDED_RENDER_EXTENT = 2048;

const GROUND_COLOR = "#5c6b52";

function clampExtent(value: number): number {
  return Number.isFinite(value) ? value : UNBOUNDED_RENDER_EXTENT;
}

function placeGroundDraw(ground: PlaceWorldFeature["ground"], size: readonly [number, number] | undefined): EngineDraw {
  let mesh: THREE.Mesh | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let material: THREE.MeshStandardMaterial | null = null;
  return {
    mount(state: EngineFrameState) {
      material = defaultSurfaceMaterial({ color: GROUND_COLOR, roughness: 0.95 });
      if (ground.mode === "flat" && size !== undefined) {
        geometry = new THREE.PlaneGeometry(size[0], size[1]);
        mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
      } else if (ground.mode === "round") {
        geometry = new THREE.SphereGeometry(ground.size.radius, 64, 48);
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = -ground.size.radius;
      } else {
        material.dispose();
        material = null;
        return;
      }
      mesh.receiveShadow = true;
      state.scene.add(mesh);
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) state.scene.remove(mesh);
      geometry?.dispose();
      material?.dispose();
      mesh = null;
      geometry = null;
      material = null;
    },
  };
}

/**
 * The substrate of a place world, rendered plainly: a flat slab or a round planet under the engine
 * default sky. This is deliberately not a diorama — sky look, foliage, props, and sculpt are scene
 * content the editor authors; `voxel` grounds are realized by the game's generation systems and
 * `board` grounds by the game's own 2D face, so both mount nothing here.
 * @internal
 */
export function PlaceScene({ feature }: { feature: PlaceWorldFeature }) {
  const ground = feature.ground;
  const size = useMemo(
    () =>
      ground.mode === "flat" ? ([clampExtent(ground.size.x), clampExtent(ground.size.z)] as const) : undefined,
    [ground],
  );
  useEngineDraw(() => placeGroundDraw(ground, size), [ground, size]);
  return null;
}
