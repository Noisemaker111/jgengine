import type { RenderBounds } from "./bounds";
import type { CameraView } from "./frustum";

export interface OcclusionInput {
  readonly camera: CameraView;
  readonly bounds: RenderBounds;
  /** Candidate blockers already known to be in front of the object (nearer to the camera). */
  readonly occluders: Iterable<RenderBounds>;
}

/**
 * Optional occlusion stage. Kept behind a feature flag and disabled by default: a fragile
 * occlusion test that wrongly hides a visible object is worse than no occlusion at all.
 * Any tester here MUST be conservative — it may return false (visible) for a truly hidden
 * object, but must never return true (hidden) for an object the player can actually see.
 */
export interface OcclusionTester {
  readonly enabled: boolean;
  isOccluded(input: OcclusionInput): boolean;
}

/** The safe default: never occludes anything. */
export const noOcclusion: OcclusionTester = {
  enabled: false,
  isOccluded: () => false,
};

export interface AxisOccluderOptions {
  enabled?: boolean;
  /** An occluder is only trusted when its bounding sphere is at least this large (world units). Default 8. */
  minOccluderRadius?: number;
}

function screenlessContains(outer: RenderBounds, inner: RenderBounds): boolean {
  return (
    outer.minX <= inner.minX && outer.maxX >= inner.maxX &&
    outer.minZ <= inner.minZ && outer.maxZ >= inner.maxZ &&
    outer.minY <= inner.minY && outer.maxY >= inner.maxY
  );
}

/**
 * A deliberately conservative bounding-volume occlusion tester. It hides an object only when a
 * single large occluder's AABB fully contains the object's AABB on every axis AND sits strictly
 * nearer the camera on the dominant view axis — the object is then provably in the occluder's
 * shadow. Full containment (not just the two perpendicular axes) makes it stricter than it needs
 * to be, which is the safe direction: it never hides a partially-visible object.
 *
 * This is the architecture/interface for occlusion, not a production hierarchical-Z implementation.
 * It stays disabled by default; enable only where the scene has genuine large blockers.
 */
export function createAxisAlignedOcclusionTester(options: AxisOccluderOptions = {}): OcclusionTester {
  const minRadius = options.minOccluderRadius ?? 8;
  return {
    enabled: options.enabled ?? false,
    isOccluded({ camera, bounds, occluders }) {
      const dirX = camera.target[0] - camera.position[0];
      const dirZ = camera.target[2] - camera.position[2];
      const horizontal = Math.abs(dirX) >= Math.abs(dirZ);
      const objAxis = horizontal ? camera.position[0] : camera.position[2];
      const objDepth = horizontal ? bounds.minX : bounds.minZ;
      for (const occ of occluders) {
        if (occ.radius < minRadius) continue;
        if (!screenlessContains(occ, bounds)) continue;
        const occNear = horizontal
          ? Math.abs(occ.maxX - objAxis) < Math.abs(objDepth - objAxis)
          : Math.abs(occ.maxZ - objAxis) < Math.abs(objDepth - objAxis);
        if (occNear) return true;
      }
      return false;
    },
  };
}
