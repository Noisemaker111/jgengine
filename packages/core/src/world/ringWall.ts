import type { WorldSolid } from "./worldSolids";

/** Where a ring wall stands and how high it rises. */
export interface RingWallOptions {
  center: readonly [number, number];
  /** Radius of the open floor inside the wall, metres. */
  radius: number;
  height: number;
  /** Wall thickness, metres. Default `4`. */
  thickness?: number;
  /** Straight pieces round the ring. Default `32`. */
  sides?: number;
  /** Ground height under a point; the wall stands on the lowest ground of each piece. */
  ground: (x: number, z: number) => number;
}

/**
 * A solid ring wall round a circular floor: `sides` slabs, each standing on the lowest ground under
 * it so no gap opens on a slope. Feed it to `ctx.world.solids.set`.
 *
 * @capability ring-wall solid ring wall round a circular floor, following the ground
 */
export function ringWall(options: RingWallOptions): WorldSolid[] {
  const thickness = options.thickness ?? 4;
  const sides = Math.max(3, Math.round(options.sides ?? 32));
  const ring = options.radius + thickness / 2;
  // Each slab spans its side plus a little, so the corners close.
  const length = 2 * ring * Math.tan(Math.PI / sides) + thickness * 0.5;
  const out: WorldSolid[] = [];
  for (let side = 0; side < sides; side += 1) {
    const angle = ((side + 0.5) / sides) * Math.PI * 2;
    const x = options.center[0] + Math.cos(angle) * ring;
    const z = options.center[1] + Math.sin(angle) * ring;
    const along = [-Math.sin(angle), Math.cos(angle)] as const;
    const half = length / 2;
    const base = Math.min(options.ground(x, z), options.ground(x + along[0] * half, z + along[1] * half), options.ground(x - along[0] * half, z - along[1] * half));
    out.push({
      center: [x, base + options.height / 2 - 1, z],
      halfExtents: [half, options.height / 2 + 1, thickness / 2],
      // Local x runs along the slab: rotationY maps local +x to (cos, -sin) in XZ.
      rotationY: -Math.atan2(along[1], along[0]),
    });
  }
  return out;
}
