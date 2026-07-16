import type { SkyEnvironmentDescriptor, WorldFeature } from "@jgengine/core/world/features";

/** The world's declared sky, when its world feature is an environment with one (#196.1). */
export function resolveWorldSky(world: WorldFeature | undefined): SkyEnvironmentDescriptor | undefined {
  return world?.kind === "environment" ? world.sky : undefined;
}

/** Deterministic HSL color from a stable instance id (default entity/object tint). */
export function colorFromId(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return `hsl(${hash % 360}, 65%, 55%)`;
}
