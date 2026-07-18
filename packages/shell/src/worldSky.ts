import type { SkyEnvironmentDescriptor, WorldFeature } from "@jgengine/core/world/features";

/** The engine default sky a 3D place world renders when no sky is authored in its scene document. */
const PLACE_DEFAULT_SKY: SkyEnvironmentDescriptor = { kind: "sky", preset: "day", timeOfDay: false };

/**
 * The sky in effect for a world feature (#196.1). Environments answer their declared sky; place
 * worlds (`world()` — substrate + laws, no sky fields) get the engine default sky for 3D grounds,
 * while `board` grounds get none (the game owns the 2D face it draws). An authored scene document's
 * sky arrives through `backdrop`/`lighting`, which wins over this at the presentation layer.
 * @internal
 */
export function resolveWorldSky(world: WorldFeature | undefined): SkyEnvironmentDescriptor | undefined {
  if (world?.kind === "place") return world.ground.mode === "board" ? undefined : PLACE_DEFAULT_SKY;
  return world?.kind === "environment" ? world.sky : undefined;
}

/** Deterministic HSL color from a stable instance id (default entity/object tint). @internal */
export function colorFromId(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return `hsl(${hash % 360}, 65%, 55%)`;
}
