import type { AmbientFaunaConfig } from "../ambientFauna/ambientFaunaConfig";

export interface SteamVent {
  position: readonly [number, number, number];
  size?: number;
  rise?: number;
}

export interface AmbientLifeConfig {
  /** A flock circling over the ground in view, `height` metres above world zero. On by default under a sky with the sun up; `false` turns it off. */
  birds?: boolean | { count?: number; height?: number; radius?: number };
  litter?: boolean | { count?: number; groundY?: number };
  steam?: readonly SteamVent[];
  /** Fish schools, insect swarms, motes and soaring flyers; off unless given. Instanced and capped. */
  fauna?: AmbientFaunaConfig;
}

/** @internal */
export interface ResolvedAmbientLife {
  birds: { count: number; height: number; radius: number } | null;
  litter: { count: number; groundY: number } | null;
  steam: readonly Required<SteamVent>[];
}

/** @internal */
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
