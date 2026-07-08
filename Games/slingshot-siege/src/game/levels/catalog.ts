import type { BlockMaterial } from "../physics/impact";
import type { Vec3 } from "../physics/trajectory";

export interface BlockPiece {
  id: string;
  position: Vec3;
  halfExtents: Vec3;
  material: BlockMaterial;
}

export interface DummyPiece {
  id: string;
  position: Vec3;
  halfExtents: Vec3;
}

export interface LevelDef {
  id: string;
  name: string;
  shotsMax: number;
  slingAnchor: Vec3;
  blocks: readonly BlockPiece[];
  dummies: readonly DummyPiece[];
}

const WOOD_HALF: Vec3 = [0.45, 0.45, 0.45];
const STONE_HALF: Vec3 = [0.5, 0.5, 0.5];
const DUMMY_HALF: Vec3 = [0.35, 0.45, 0.35];

function stack(baseX: number, material: BlockMaterial, count: number): BlockPiece[] {
  const half = material === "wood" ? WOOD_HALF : STONE_HALF;
  const height = half[1] * 2;
  return Array.from({ length: count }, (_, row) => ({
    id: `${material}_${baseX}_${row}`,
    position: [baseX, half[1] + row * height, 0] as Vec3,
    halfExtents: half,
    material,
  }));
}

export const LEVELS: readonly LevelDef[] = [
  {
    id: "outpost",
    name: "The Lookout Post",
    shotsMax: 3,
    slingAnchor: [0, 1.2, 0],
    blocks: stack(9, "wood", 2),
    dummies: [{ id: "sentry_1", position: [9, 0.45 + 2 * 0.9, 0], halfExtents: DUMMY_HALF }],
  },
  {
    id: "palisade",
    name: "The Timber Palisade",
    shotsMax: 4,
    slingAnchor: [0, 1.2, 0],
    blocks: [...stack(10, "wood", 3), ...stack(14, "stone", 2)],
    dummies: [
      { id: "sentry_1", position: [10, 0.45 + 3 * 0.9, 0], halfExtents: DUMMY_HALF },
      { id: "sentry_2", position: [14, 0.5 + 2 * 1.0, 0], halfExtents: DUMMY_HALF },
    ],
  },
  {
    id: "keep",
    name: "The Stone Keep",
    shotsMax: 5,
    slingAnchor: [0, 1.2, 0],
    blocks: [...stack(11, "stone", 2), ...stack(13, "wood", 3), ...stack(16, "stone", 3)],
    dummies: [
      { id: "sentry_1", position: [11, 0.5 + 2 * 1.0, 0], halfExtents: DUMMY_HALF },
      { id: "sentry_2", position: [13, 0.45 + 3 * 0.9, 0], halfExtents: DUMMY_HALF },
      { id: "sentry_3", position: [16, 0.5 + 3 * 1.0, 0], halfExtents: DUMMY_HALF },
    ],
  },
];
