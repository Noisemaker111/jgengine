import type { EntityPosition } from "@jgengine/core/scene/entityStore";

export const WORLD_BOUNDS = { w: 420, d: 420 } as const;

export const FYRESTONE = { x: -60, z: -50 } as const;
export const BANDIT_CAMP = { x: 85, z: 60 } as const;
export const SKAG_GULLY = { x: -30, z: 110 } as const;
export const FLYNT_PERCH = { x: 150, z: -95 } as const;

export const PLAYER_SPAWN: EntityPosition = [FYRESTONE.x + 10, 0, FYRESTONE.z + 14];
export const NEW_U_STATION: EntityPosition = [FYRESTONE.x + 6, 0, FYRESTONE.z + 8];

export const CLAPTRAP_POS: EntityPosition = [FYRESTONE.x + 4, 0, FYRESTONE.z + 2];
export const MARCUS_VENDOR_POS: EntityPosition = [FYRESTONE.x - 4, 0, FYRESTONE.z - 3];
export const ZED_VENDOR_POS: EntityPosition = [FYRESTONE.x + 12, 0, FYRESTONE.z - 6];

export interface SpawnCluster {
  center: { x: number; z: number };
  radius: number;
  entries: readonly { catalogId: string; count: number }[];
  respawnSeconds: number;
}

export const SPAWN_CLUSTERS: readonly SpawnCluster[] = [
  {
    center: BANDIT_CAMP,
    radius: 22,
    respawnSeconds: 75,
    entries: [
      { catalogId: "psycho", count: 5 },
      { catalogId: "marauder", count: 4 },
      { catalogId: "nomad", count: 1 },
      { catalogId: "badass_psycho", count: 1 },
    ],
  },
  {
    center: SKAG_GULLY,
    radius: 20,
    respawnSeconds: 60,
    entries: [
      { catalogId: "skag_pup", count: 5 },
      { catalogId: "skag", count: 3 },
      { catalogId: "badass_skag", count: 1 },
    ],
  },
  {
    center: { x: (BANDIT_CAMP.x + FLYNT_PERCH.x) / 2, z: (BANDIT_CAMP.z + FLYNT_PERCH.z) / 2 },
    radius: 16,
    respawnSeconds: 90,
    entries: [
      { catalogId: "marauder", count: 3 },
      { catalogId: "psycho", count: 2 },
    ],
  },
];
