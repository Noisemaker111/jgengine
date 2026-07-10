import { seededRng } from "@jgengine/core/random/rng";
import { PALETTE } from "../theme";

export type Vec2 = readonly [number, number];

function polar(angleDeg: number, radius: number): Vec2 {
  const a = (angleDeg * Math.PI) / 180;
  return [Math.sin(a) * radius, Math.cos(a) * radius];
}

export type PlanetoidTier = "small" | "medium" | "large";

export interface PlanetoidTierSpec {
  radius: number;
  mass: number;
  wellScale: number;
}

export const PLANETOID_TIERS: Record<PlanetoidTier, PlanetoidTierSpec> = {
  small: { radius: 7, mass: 55, wellScale: 2.4 },
  medium: { radius: 10, mass: 95, wellScale: 2.1 },
  large: { radius: 14, mass: 155, wellScale: 1.9 },
};

export interface PlanetoidArchetype {
  id: string;
  name: string;
  position: Vec2;
  tier: PlanetoidTier;
  color: string;
  ringColor: string | null;
  craterSeed: string;
}

export const PLANETOID_ARCHETYPES: readonly PlanetoidArchetype[] = [
  {
    id: "ceres_junction",
    name: "Ceres Junction",
    position: polar(90, 80),
    tier: "large",
    color: PALETTE.planetMint,
    ringColor: PALETTE.starlight,
    craterSeed: "ceres-junction",
  },
  {
    id: "vesta_reach",
    name: "Vesta Reach",
    position: polar(30, 80),
    tier: "medium",
    color: PALETTE.planetPeach,
    ringColor: null,
    craterSeed: "vesta-reach",
  },
  {
    id: "pallas_drift",
    name: "Pallas Drift",
    position: polar(150, 80),
    tier: "small",
    color: "#2f3470",
    ringColor: null,
    craterSeed: "pallas-drift",
  },
  {
    id: "hygiea_hollow",
    name: "Hygiea Hollow",
    position: polar(210, 80),
    tier: "large",
    color: PALETTE.planetMint,
    ringColor: PALETTE.boostTangerine,
    craterSeed: "hygiea-hollow",
  },
  {
    id: "eros_bend",
    name: "Eros Bend",
    position: polar(270, 80),
    tier: "small",
    color: PALETTE.planetPeach,
    ringColor: null,
    craterSeed: "eros-bend",
  },
  {
    id: "juno_flats",
    name: "Juno Flats",
    position: polar(330, 80),
    tier: "medium",
    color: PALETTE.starlight,
    ringColor: null,
    craterSeed: "juno-flats",
  },
  {
    id: "psyche_point",
    name: "Psyche Point",
    position: [0, -44],
    tier: "medium",
    color: PALETTE.boostTangerine,
    ringColor: PALETTE.planetMint,
    craterSeed: "psyche-point",
  },
];

export interface Planetoid extends PlanetoidArchetype {
  radius: number;
  mass: number;
  wellRadius: number;
}

export const PLANETOIDS: readonly Planetoid[] = PLANETOID_ARCHETYPES.map((archetype) => {
  const tierSpec = PLANETOID_TIERS[archetype.tier];
  return {
    ...archetype,
    radius: tierSpec.radius,
    mass: tierSpec.mass,
    wellRadius: tierSpec.radius * tierSpec.wellScale,
  };
});

export function planetoidById(id: string): Planetoid | undefined {
  return PLANETOIDS.find((planetoid) => planetoid.id === id);
}

export interface CheckpointDef {
  id: string;
  name: string;
  position: Vec2;
}

export const CHECKPOINT_DEFS: readonly CheckpointDef[] = [
  { id: "cp_vesta_gate", name: "Vesta Gate", position: polar(0, 122) },
  { id: "cp_ceres_approach", name: "Ceres Approach", position: polar(60, 122) },
  { id: "cp_hygiea_bend", name: "Hygiea Bend", position: polar(120, 122) },
  { id: "cp_pallas_curve", name: "Pallas Curve", position: polar(180, 122) },
  { id: "cp_eros_straight", name: "Eros Straight", position: polar(240, 122) },
  { id: "cp_finish_line", name: "Finish Line", position: polar(300, 122) },
];

export interface AsteroidRock {
  position: Vec2;
  radius: number;
}

export interface AsteroidCluster {
  id: string;
  name: string;
  center: Vec2;
  rocks: readonly AsteroidRock[];
}

function generateCluster(id: string, name: string, center: Vec2, count: number, spread: number, seed: string): AsteroidCluster {
  const rng = seededRng(seed);
  const rocks: AsteroidRock[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = spread * (0.3 + rng() * 0.7);
    const radius = 1.5 + rng() * 2.1;
    rocks.push({
      position: [center[0] + Math.sin(angle) * distance, center[1] + Math.cos(angle) * distance],
      radius,
    });
  }
  return { id, name, center, rocks };
}

export const ASTEROID_CLUSTERS: readonly AsteroidCluster[] = [
  generateCluster("belt_alpha", "Alpha Belt", polar(15, 102), 7, 15, "orbit-kart-belt-alpha"),
  generateCluster("belt_beta", "Beta Belt", polar(195, 52), 8, 13, "orbit-kart-belt-beta"),
  generateCluster("belt_gamma", "Gamma Belt", polar(255, 102), 6, 14, "orbit-kart-belt-gamma"),
];

export interface AsteroidObstacle {
  clusterId: string;
  position: Vec2;
  radius: number;
}

export const ASTEROID_OBSTACLES: readonly AsteroidObstacle[] = ASTEROID_CLUSTERS.flatMap((cluster) =>
  cluster.rocks.map((rock) => ({ clusterId: cluster.id, position: rock.position, radius: rock.radius })),
);

export interface BoostPad {
  id: string;
  position: Vec2;
  boostMultiplier: number;
}

const BOOST_PAD_ANGLES: readonly number[] = [15, 60, 105, 165, 210, 255, 300, 345];

export const BOOST_PADS: readonly BoostPad[] = BOOST_PAD_ANGLES.map((angle, index) => ({
  id: `boost_pad_${index}`,
  position: polar(angle, 98),
  boostMultiplier: index % 2 === 0 ? 1.4 : 1.28,
}));

export const BOOST_PAD_RADIUS = 4.5;
