import { seededStreams } from "@jgengine/core/random/rng";
import { CORRIDOR_HALF_WIDTH, PALETTE, PARK_Z, ROAD_Z, SANCTUARY_Z } from "../constants";

export type PropTypeId = "parkedCar" | "bench" | "planter" | "streetlight" | "sanctuaryLantern";

export interface PropTypeDef {
  id: PropTypeId;
  label: string;
  color: string;
  glow?: string;
}

export const PROP_TYPES: Record<PropTypeId, PropTypeDef> = {
  parkedCar: { id: "parkedCar", label: "Parked Car", color: "#3a4150" },
  bench: { id: "bench", label: "Park Bench", color: "#4a4038" },
  planter: { id: "planter", label: "Planter Box", color: "#2f4a3a" },
  streetlight: { id: "streetlight", label: "Streetlight", color: "#1c2027", glow: PALETTE.streetlightAmber },
  sanctuaryLantern: { id: "sanctuaryLantern", label: "Sanctuary Lantern", color: "#243028", glow: PALETTE.spiritMint },
};

export interface PropPlacement {
  instanceId: string;
  type: PropTypeId;
  x: number;
  z: number;
  rotationY: number;
}

const QUIET_ZONE_CENTERS: readonly number[] = (() => {
  const bounds = [PARK_Z, ...ROAD_Z, SANCTUARY_Z];
  const centers: number[] = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    centers.push((bounds[i]! + bounds[i + 1]!) / 2);
  }
  return centers;
})();

const BLOCK_PROP_TYPES: readonly PropTypeId[] = ["parkedCar", "bench", "planter", "streetlight"];

function buildBlockProps(seed: string): PropPlacement[] {
  const streams = seededStreams(seed);
  const jitterRng = streams("prop-jitter");
  const placements: PropPlacement[] = [];
  QUIET_ZONE_CENTERS.forEach((zoneCenter, zoneIndex) => {
    for (const side of [-1, 1] as const) {
      for (let slot = 0; slot < 3; slot += 1) {
        const type = BLOCK_PROP_TYPES[(zoneIndex + slot + (side > 0 ? 0 : 2)) % BLOCK_PROP_TYPES.length]!;
        const jitterX = (jitterRng() - 0.5) * 1.6;
        const jitterZ = (jitterRng() - 0.5) * 2.4;
        const x = side * (CORRIDOR_HALF_WIDTH - 2 + jitterX);
        const z = zoneCenter + (slot - 1) * 4.2 + jitterZ;
        placements.push({
          instanceId: `prop-block-${zoneIndex}-${side > 0 ? "e" : "w"}-${slot}`,
          type,
          x,
          z,
          rotationY: side > 0 ? -Math.PI / 2 : Math.PI / 2,
        });
      }
    }
  });
  return placements;
}

function buildSanctuaryRing(): PropPlacement[] {
  const count = 8;
  const radius = 9.5;
  const placements: PropPlacement[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    placements.push({
      instanceId: `prop-sanctuary-${i}`,
      type: "sanctuaryLantern",
      x: Math.cos(angle) * radius,
      z: SANCTUARY_Z + Math.sin(angle) * radius,
      rotationY: angle,
    });
  }
  return placements;
}

export const PROP_PLACEMENTS: readonly PropPlacement[] = [
  ...buildBlockProps("neon-shepherd-props"),
  ...buildSanctuaryRing(),
];
