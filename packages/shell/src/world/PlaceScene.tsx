import { useMemo } from "react";

import type { PlaceWorldFeature } from "@jgengine/core/world/place";

import { DefaultSurface } from "../render/defaultSurface";

/** Render extent (m) standing in for an `Infinity` flat-ground axis — far past the default fog. */
const UNBOUNDED_RENDER_EXTENT = 2048;

const GROUND_COLOR = "#5c6b52";

function clampExtent(value: number): number {
  return Number.isFinite(value) ? value : UNBOUNDED_RENDER_EXTENT;
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
  if (ground.mode === "flat" && size !== undefined) {
    return (
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[size[0], size[1]]} />
        <DefaultSurface color={GROUND_COLOR} roughness={0.95} />
      </mesh>
    );
  }
  if (ground.mode === "round") {
    return (
      <mesh position={[0, -ground.size.radius, 0]} receiveShadow>
        <sphereGeometry args={[ground.size.radius, 64, 48]} />
        <DefaultSurface color={GROUND_COLOR} roughness={0.95} />
      </mesh>
    );
  }
  return null;
}
