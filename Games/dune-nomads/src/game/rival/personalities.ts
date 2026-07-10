import { seededStreams } from "@jgengine/core/random/rng";

import { CITY, OASES, SOUTH_GATE } from "../world/sites";

export type RivalPersonalityId = "direct" | "ridge-runner" | "cautious";

export interface RivalPersonality {
  id: RivalPersonalityId;
  label: string;
  description: string;
  oasisIds: readonly string[];
}

export const RIVAL_PERSONALITIES: readonly RivalPersonality[] = [
  {
    id: "direct",
    label: "Bull-Headed",
    description: "Cuts straight for Meridaan, wind be damned.",
    oasisIds: ["ashen-springs"],
  },
  {
    id: "ridge-runner",
    label: "Wind-Reader",
    description: "Chases the lee ridges through the middle of the sea.",
    oasisIds: ["bitter-well", "ashen-springs", "widows-cistern"],
  },
  {
    id: "cautious",
    label: "Cistern-Cautious",
    description: "Never strays far from water, at the cost of speed.",
    oasisIds: ["bitter-well", "palm-hollow", "ashen-springs", "widows-cistern", "last-water"],
  },
];

export function pickRivalPersonality(seed: string | number): RivalPersonality {
  const roll = seededStreams(seed)("rival-personality")();
  const index = Math.min(RIVAL_PERSONALITIES.length - 1, Math.floor(roll * RIVAL_PERSONALITIES.length));
  return RIVAL_PERSONALITIES[index]!;
}

export interface RivalWaypoint {
  x: number;
  z: number;
}

export function rivalWaypointsFor(personality: RivalPersonality): readonly RivalWaypoint[] {
  const oasisById = new Map(OASES.map((oasis) => [oasis.id, oasis] as const));
  const stops = personality.oasisIds
    .map((id) => oasisById.get(id))
    .filter((oasis): oasis is NonNullable<typeof oasis> => oasis !== undefined)
    .map((oasis) => ({ x: oasis.x, z: oasis.z }));
  return [{ x: SOUTH_GATE.x, z: SOUTH_GATE.z }, ...stops, { x: CITY.x, z: CITY.z }];
}
