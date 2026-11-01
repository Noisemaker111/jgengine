import type { AmbientFaunaConfig } from "../ambientFauna/ambientFaunaConfig";

/** A point that breathes steam: a manhole, a vent, a hot spring, a kettle on a stall. */
export interface SteamVent {
  /** World position of the vent's mouth. */
  position: readonly [number, number, number];
  /** Plume width in world units at the mouth. Default 0.8. */
  size?: number;
  /** How high the plume rises before it is gone, in world units. Default 4. */
  rise?: number;
}

/**
 * Small life the renderer adds around the camera, driven by the weather and the time of day.
 * Birds circle overhead in fair daylight and leave in rain or at night; litter blows along the
 * ground when the wind picks up; steam rises from vents, thicker when it is cold, wet or dark.
 */
export interface AmbientLifeConfig {
  /** A flock circling over the ground in view, `height` metres above world zero. On by default under a sky with the sun up; `false` turns it off. */
  birds?: boolean | { count?: number; height?: number; radius?: number };
  /** Paper and leaves blowing along the ground in wind. Off by default. `groundY` is the street height. */
  litter?: boolean | { count?: number; groundY?: number };
  /** Steam vents. None by default. */
  steam?: readonly SteamVent[];
  /** Fish schools, insect swarms, motes and soaring flyers; off unless given. Instanced and capped. */
  fauna?: AmbientFaunaConfig;
}

/** Ambient life with every default filled in. @internal */
export interface ResolvedAmbientLife {
  birds: { count: number; height: number; radius: number } | null;
  litter: { count: number; groundY: number } | null;
  steam: readonly Required<SteamVent>[];
}

/**
 * Fills defaults for `config`. Low tier keeps every effect but runs fewer of each.
 * @internal
 */
export function resolveAmbientLife(config: AmbientLifeConfig | false | undefined, lowTier: boolean): ResolvedAmbientLife {
  if (config === false) return { birds: null, litter: null, steam: [] };
  const birds = config?.birds ?? true;
  const litter = config?.litter ?? false;
  const birdOptions = typeof birds === "object" ? birds : {};
  const litterOptions = typeof litter === "object" ? litter : {};
  return {
    birds: birds === false ? null : { count: birdOptions.count ?? (lowTier ? 7 : 14), height: birdOptions.height ?? 20, radius: birdOptions.radius ?? 50 },
    litter: litter === false ? null : { count: litterOptions.count ?? (lowTier ? 14 : 32), groundY: litterOptions.groundY ?? 0 },
    steam: (config?.steam ?? []).map((vent) => ({ position: vent.position, size: vent.size ?? 0.8, rise: vent.rise ?? 4 })),
  };
}
