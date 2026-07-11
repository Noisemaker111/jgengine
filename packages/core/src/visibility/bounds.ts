import type { EntityPosition } from "../scene/entityStore";

export type Vec3 = EntityPosition;

/**
 * World-space bounds a culler tests against. Kept as flat scalars (not tuples) so the
 * hot culling path reads them without allocating. Carries both a bounding sphere (cheap
 * broad reject) and a tight AABB (precise reject) — the standard "engine bounds" the
 * frustum, distance, and spatial-index tests all consume.
 */
export interface RenderBounds {
  centerX: number;
  centerY: number;
  centerZ: number;
  radius: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/**
 * How a renderable declares its extent. AABB, bounding sphere, and 2D rectangle cover the
 * common cases; `point` is the degenerate zero-size default for objects that never override.
 * `offset` shifts the volume from the object origin (e.g. a tall model whose pivot is at its feet).
 */
export type BoundsSpec =
  | { readonly kind: "sphere"; readonly radius: number; readonly offset?: Vec3 }
  | { readonly kind: "aabb"; readonly half: Vec3; readonly offset?: Vec3 }
  | {
      readonly kind: "rect";
      readonly halfWidth: number;
      readonly halfDepth: number;
      readonly halfHeight?: number;
      readonly offset?: Vec3;
    }
  | { readonly kind: "point" };

/** Conservative default: a unit sphere. Objects without explicit bounds cull as a small volume, never a point. */
export const DEFAULT_BOUNDS: BoundsSpec = { kind: "sphere", radius: 1 };

export function createRenderBounds(): RenderBounds {
  return {
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    radius: 0,
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: 0,
    maxY: 0,
    maxZ: 0,
  };
}

function fillBounds(
  out: RenderBounds,
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
): RenderBounds {
  out.centerX = cx;
  out.centerY = cy;
  out.centerZ = cz;
  out.minX = cx - hx;
  out.minY = cy - hy;
  out.minZ = cz - hz;
  out.maxX = cx + hx;
  out.maxY = cy + hy;
  out.maxZ = cz + hz;
  out.radius = Math.sqrt(hx * hx + hy * hy + hz * hz);
  return out;
}

/** Resolve a spec + world position into concrete bounds. Writes into `out` when supplied (no allocation). */
export function resolveBounds(
  spec: BoundsSpec,
  position: Vec3,
  out: RenderBounds = createRenderBounds(),
): RenderBounds {
  if (spec.kind === "point") {
    return fillBounds(out, position[0], position[1], position[2], 0, 0, 0);
  }
  const offset = spec.offset;
  const cx = position[0] + (offset?.[0] ?? 0);
  const cy = position[1] + (offset?.[1] ?? 0);
  const cz = position[2] + (offset?.[2] ?? 0);
  switch (spec.kind) {
    case "sphere": {
      const r = spec.radius;
      fillBounds(out, cx, cy, cz, r, r, r);
      out.radius = r;
      return out;
    }
    case "aabb":
      return fillBounds(out, cx, cy, cz, spec.half[0], spec.half[1], spec.half[2]);
    case "rect":
      return fillBounds(out, cx, cy, cz, spec.halfWidth, spec.halfHeight ?? 0, spec.halfDepth);
  }
}

export function expandRenderBounds(bounds: RenderBounds, margin: number, out: RenderBounds = createRenderBounds()): RenderBounds {
  out.centerX = bounds.centerX;
  out.centerY = bounds.centerY;
  out.centerZ = bounds.centerZ;
  out.radius = bounds.radius + margin;
  out.minX = bounds.minX - margin;
  out.minY = bounds.minY - margin;
  out.minZ = bounds.minZ - margin;
  out.maxX = bounds.maxX + margin;
  out.maxY = bounds.maxY + margin;
  out.maxZ = bounds.maxZ + margin;
  return out;
}

export function aabbIntersects(
  aMinX: number, aMinY: number, aMinZ: number, aMaxX: number, aMaxY: number, aMaxZ: number,
  bMinX: number, bMinY: number, bMinZ: number, bMaxX: number, bMaxY: number, bMaxZ: number,
): boolean {
  return (
    aMinX <= bMaxX && aMaxX >= bMinX &&
    aMinY <= bMaxY && aMaxY >= bMinY &&
    aMinZ <= bMaxZ && aMaxZ >= bMinZ
  );
}

export function boundsIntersect(a: RenderBounds, b: RenderBounds): boolean {
  return aabbIntersects(
    a.minX, a.minY, a.minZ, a.maxX, a.maxY, a.maxZ,
    b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ,
  );
}

/**
 * BoundsSystem: caches resolved bounds per object and recomputes only when the caller's
 * version advances — i.e. when a transform, geometry, or the bounds spec itself changed.
 * The cached `RenderBounds` object is reused across recomputes, so a steady-state frame
 * that touches thousands of objects performs zero bounds allocations.
 */
export interface BoundsCache {
  get(id: string, version: number, spec: BoundsSpec, position: Vec3): RenderBounds;
  peek(id: string): RenderBounds | undefined;
  invalidate(id: string): void;
  delete(id: string): void;
  clear(): void;
  size(): number;
  recomputes(): number;
}

interface BoundsEntry {
  version: number;
  bounds: RenderBounds;
}

export function createBoundsCache(): BoundsCache {
  const entries = new Map<string, BoundsEntry>();
  let recomputes = 0;

  return {
    get(id, version, spec, position) {
      const existing = entries.get(id);
      if (existing !== undefined && existing.version === version) return existing.bounds;
      if (existing === undefined) {
        const bounds = resolveBounds(spec, position);
        entries.set(id, { version, bounds });
        recomputes += 1;
        return bounds;
      }
      resolveBounds(spec, position, existing.bounds);
      existing.version = version;
      recomputes += 1;
      return existing.bounds;
    },
    peek(id) {
      return entries.get(id)?.bounds;
    },
    invalidate(id) {
      const existing = entries.get(id);
      if (existing !== undefined) existing.version = Number.NaN;
    },
    delete(id) {
      entries.delete(id);
    },
    clear() {
      entries.clear();
    },
    size() {
      return entries.size;
    },
    recomputes() {
      return recomputes;
    },
  };
}
