import type { CityIntersection, CityStreet } from "@jgengine/core/world/cityKind";

/**
 * Surface for a crossing's welded patch: gravel only when every street running through the crossing
 * is gravel, so an unpaved hamlet's junctions stay gravel while a lane meeting a paved main stays asphalt.
 * @internal
 */
export function junctionSurface(
  cross: Pick<CityIntersection, "x" | "z" | "radius">,
  streets: readonly Pick<CityStreet, "points" | "width" | "surface">[],
): CityStreet["surface"] {
  let touched = false;
  for (const street of streets) {
    const reach = cross.radius + street.width * 0.5 + 0.5;
    if (distanceToPath(cross.x, cross.z, street.points) > reach) continue;
    if (street.surface !== "gravel") return "asphalt";
    touched = true;
  }
  return touched ? "gravel" : "asphalt";
}

function distanceToPath(x: number, z: number, points: CityStreet["points"]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return Math.hypot(x - points[0]![0], z - points[0]![1]);
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const [ax, az] = points[i - 1]!;
    const [bx, bz] = points[i]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}
