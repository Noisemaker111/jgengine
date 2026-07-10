import { seededRng } from "@jgengine/core/random/rng";
import { ROOMS } from "./floorPlan";

export interface FurnitureKindDef {
  id: string;
  footprint: readonly [number, number, number];
  color: string;
}

export const FURNITURE_KINDS: readonly FurnitureKindDef[] = [
  { id: "bookshelf", footprint: [1.4, 2.4, 0.5], color: "#3a2418" },
  { id: "armchair", footprint: [1.1, 1.0, 1.1], color: "#7a1f2b" },
  { id: "writing_desk", footprint: [1.6, 1.0, 0.9], color: "#4a2c22" },
  { id: "side_table", footprint: [0.7, 0.7, 0.7], color: "#5c3a26" },
  { id: "display_case", footprint: [1.2, 1.3, 0.8], color: "#c9a227" },
  { id: "pedestal", footprint: [0.7, 1.1, 0.7], color: "#8a7358" },
  { id: "cabinet", footprint: [1.5, 1.8, 0.6], color: "#3a2418" },
  { id: "crate", footprint: [0.9, 0.9, 0.9], color: "#6b4a2f" },
  { id: "barrel", footprint: [0.8, 1.0, 0.8], color: "#5c3a26" },
  { id: "dining_chair", footprint: [0.7, 1.0, 0.7], color: "#4a2c22" },
  { id: "settee", footprint: [1.8, 1.0, 0.9], color: "#1d2b4a" },
  { id: "wardrobe", footprint: [1.4, 2.2, 0.7], color: "#3a2418" },
  { id: "harpsichord", footprint: [2.0, 1.1, 1.0], color: "#4a2c22" },
  { id: "easel", footprint: [0.8, 1.7, 0.6], color: "#5c3a26" },
  { id: "stove", footprint: [1.6, 1.3, 0.9], color: "#2b2b2b" },
  { id: "wine_rack", footprint: [1.3, 1.8, 0.6], color: "#3a2418" },
] as const;

export function furnitureKind(id: string): FurnitureKindDef {
  const found = FURNITURE_KINDS.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`furniture: unknown kind "${id}"`);
  return found;
}

const OUTER = 3;
const INNER = 1.6;

const SLOT_OFFSETS: readonly [number, number][] = [
  [-OUTER, -OUTER],
  [OUTER, -OUTER],
  [-OUTER, OUTER],
  [OUTER, OUTER],
  [-INNER, -INNER],
  [INNER, -INNER],
  [-INNER, INNER],
  [INNER, INNER],
];

export const ROOM_FURNITURE_PLANS: Record<string, readonly string[]> = {
  servant_entrance: ["crate", "crate", "barrel", "side_table", "crate"],
  kitchen: ["stove", "cabinet", "crate", "barrel", "side_table", "crate", "wine_rack"],
  pantry: ["wine_rack", "cabinet", "crate", "barrel", "crate", "wine_rack", "barrel"],
  grand_gallery: ["pedestal", "pedestal", "easel", "easel", "display_case", "settee", "side_table", "pedestal"],
  music_room: ["harpsichord", "armchair", "side_table", "cabinet", "settee", "dining_chair", "side_table"],
  conservatory: ["easel", "settee", "side_table", "armchair", "wardrobe", "pedestal", "side_table"],
  library: ["bookshelf", "bookshelf", "bookshelf", "writing_desk", "armchair", "side_table", "bookshelf"],
  study: ["writing_desk", "bookshelf", "armchair", "cabinet", "side_table", "wardrobe", "bookshelf"],
  smoking_room: ["armchair", "armchair", "side_table", "cabinet", "settee", "wine_rack", "side_table"],
  ballroom: ["dining_chair", "dining_chair", "settee", "side_table", "pedestal", "display_case", "harpsichord", "pedestal"],
  vault_antechamber: ["display_case", "pedestal", "cabinet", "wardrobe", "side_table", "crate"],
  trophy_room: ["display_case", "display_case", "pedestal", "cabinet", "wardrobe", "side_table", "crate"],
};

export interface FurniturePlacement {
  instanceId: string;
  kind: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: readonly [number, number, number];
  color: string;
}

export function generateFurniturePlacements(): readonly FurniturePlacement[] {
  const placements: FurniturePlacement[] = [];
  for (const room of ROOMS) {
    const plan = ROOM_FURNITURE_PLANS[room.id] ?? [];
    const rng = seededRng(`clockwork-heist:furniture:${room.id}`);
    for (let i = 0; i < plan.length && i < SLOT_OFFSETS.length; i += 1) {
      const kindId = plan[i]!;
      const kind = furnitureKind(kindId);
      const [ox, oz] = SLOT_OFFSETS[i]!;
      const jitterX = (rng() - 0.5) * 0.3;
      const jitterZ = (rng() - 0.5) * 0.3;
      const rotationY = Math.floor(rng() * 4) * (Math.PI / 2);
      placements.push({
        instanceId: `furniture:${room.id}:${i}`,
        kind: kindId,
        x: room.center[0] + ox + jitterX,
        y: kind.footprint[1] / 2,
        z: room.center[1] + oz + jitterZ,
        rotationY,
        scale: kind.footprint,
        color: kind.color,
      });
    }
  }
  return placements;
}

export function furniturePropCount(): number {
  return Object.values(ROOM_FURNITURE_PLANS).reduce((sum, plan) => sum + Math.min(plan.length, SLOT_OFFSETS.length), 0);
}
