import { seededStreams } from "@jgengine/core/random/rng";
import { resolveTerrainField } from "@jgengine/core/world/terrain";
import { scatter, type ScatterPoint } from "@jgengine/core/world/scatter";
import { world, ISLAND_SEED } from "../../world";
import { TIDE_STAGES, waterDepthAt } from "../tide/catalog";
import { VILLAGES } from "./villages";
import { BOAT_HULL, CRATE, PALM_FROND, PALM_TRUNK, ROCK, type PropCatalogId } from "../objects/catalog";

export interface PropPlacement {
  readonly catalogId: PropCatalogId;
  readonly instanceId: string;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly rotationY: number;
  readonly scale: number;
}

const field = resolveTerrainField(world.terrain);
const startingTideLevel = TIDE_STAGES[0]!.level;

function isDryAtStart(x: number, z: number): boolean {
  return waterDepthAt(field.sampleHeight(x, z), startingTideLevel) <= 0;
}

function avoidVillages(margin: number) {
  return VILLAGES.map((village) => ({
    minX: village.position[0] - village.radius - margin,
    minZ: village.position[1] - village.radius - margin,
    maxX: village.position[0] + village.radius + margin,
    maxZ: village.position[1] + village.radius + margin,
  }));
}

function streamRng(name: string): () => number {
  return seededStreams(ISLAND_SEED)(name);
}

function scatterPalms(): PropPlacement[] {
  const points = scatter({
    area: { w: 190, d: 190, center: [0, 0] },
    count: 22,
    seed: `${ISLAND_SEED}-palms`,
    minDistance: 8,
    avoid: avoidVillages(3),
  });
  const rng = streamRng("palm-detail");
  const placements: PropPlacement[] = [];
  points.forEach((point, index) => {
    if (!isDryAtStart(point.x, point.z)) return;
    const groundY = field.sampleHeight(point.x, point.z);
    const trunkHeight = 2.2 + rng() * 1.4;
    const rotation = rng() * Math.PI * 2;
    const scale = 0.85 + rng() * 0.5;
    placements.push({
      catalogId: PALM_TRUNK,
      instanceId: `palm_trunk_${index}`,
      x: point.x,
      z: point.z,
      y: groundY + trunkHeight / 2,
      rotationY: rotation,
      scale,
    });
    placements.push({
      catalogId: PALM_FROND,
      instanceId: `palm_frond_${index}`,
      x: point.x,
      z: point.z,
      y: groundY + trunkHeight,
      rotationY: rotation,
      scale: scale * 1.6,
    });
  });
  return placements;
}

function scatterKind(
  catalogId: PropCatalogId,
  kindSeed: string,
  count: number,
  minDistance: number,
  avoidMargin: number,
  scaleRange: readonly [number, number],
): PropPlacement[] {
  const points = scatter({
    area: { w: 200, d: 200, center: [0, 0] },
    count,
    seed: `${ISLAND_SEED}-${kindSeed}`,
    minDistance,
    avoid: avoidVillages(avoidMargin),
  });
  const rng = streamRng(`${kindSeed}-detail`);
  const placements: PropPlacement[] = [];
  points.forEach((point: ScatterPoint, index) => {
    if (!isDryAtStart(point.x, point.z)) return;
    const scale = scaleRange[0] + rng() * (scaleRange[1] - scaleRange[0]);
    placements.push({
      catalogId,
      instanceId: `${kindSeed}_${index}`,
      x: point.x,
      z: point.z,
      y: field.sampleHeight(point.x, point.z) + 0.3 * scale,
      rotationY: rng() * Math.PI * 2,
      scale,
    });
  });
  return placements;
}

function boatPlacements(): PropPlacement[] {
  const coastalVillages = VILLAGES.filter((village) => village.elevation < 1);
  const rng = streamRng("boats");
  const placements: PropPlacement[] = [];
  coastalVillages.forEach((village, villageIndex) => {
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2 + rng() * 0.6;
      const distance = village.radius + 3 + rng() * 4;
      const x = village.position[0] + Math.cos(angle) * distance;
      const z = village.position[1] + Math.sin(angle) * distance;
      placements.push({
        catalogId: BOAT_HULL,
        instanceId: `boat_${villageIndex}_${i}`,
        x,
        z,
        y: Math.min(field.sampleHeight(x, z), startingTideLevel) + 0.15,
        rotationY: rng() * Math.PI * 2,
        scale: 0.9 + rng() * 0.4,
      });
    }
  });
  return placements;
}

export const PROP_PLACEMENTS: readonly PropPlacement[] = [
  ...scatterPalms(),
  ...scatterKind(CRATE, "crates", 18, 4, 2, [0.7, 1.1]),
  ...scatterKind(ROCK, "rocks", 20, 5, 1, [0.6, 1.6]),
  ...boatPlacements(),
];
