import { seededRng } from "@jgengine/core/random/rng";

import { edgeLength, nodeById, RAIL_EDGES, type RailEdge } from "../rail/network";
import { PROP_BOULDER, PROP_FENCE, PROP_MARKER, PROP_PINE, PROP_SIGNAL } from "../objects/catalog";

export interface PropPlacement {
  instanceId: string;
  catalogId: string;
  x: number;
  z: number;
  rotationY: number;
  scale: number;
}

const PROP_WEIGHTS: readonly { id: string; weight: number }[] = [
  { id: PROP_PINE, weight: 5 },
  { id: PROP_BOULDER, weight: 3 },
  { id: PROP_FENCE, weight: 2 },
  { id: PROP_MARKER, weight: 1 },
  { id: PROP_SIGNAL, weight: 1 },
];
const TOTAL_WEIGHT = PROP_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);

function pickProp(roll: number): string {
  let remaining = roll * TOTAL_WEIGHT;
  for (const entry of PROP_WEIGHTS) {
    if (remaining < entry.weight) return entry.id;
    remaining -= entry.weight;
  }
  return PROP_WEIGHTS[0]!.id;
}

const SPACING = 6.5;
const LATERAL_OFFSET_MIN = 5;
const LATERAL_OFFSET_MAX = 11;

function edgesForDressing(): readonly RailEdge[] {
  return RAIL_EDGES.filter((edge) => edge.kind !== "tunnel");
}

export function generateTracksideProps(seed = "rail-rushers-props"): readonly PropPlacement[] {
  const rng = seededRng(seed);
  const placements: PropPlacement[] = [];
  for (const edge of edgesForDressing()) {
    const length = edgeLength(edge);
    const count = Math.max(2, Math.round(length / SPACING));
    const a = nodeById(edge.from).position;
    const b = nodeById(edge.to).position;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const edgeLen = Math.hypot(dx, dz) || 1;
    const nx = -dz / edgeLen;
    const nz = dx / edgeLen;
    for (let i = 0; i < count; i += 1) {
      const t = (i + 1) / (count + 1);
      const side = rng() < 0.5 ? -1 : 1;
      const lateral = LATERAL_OFFSET_MIN + rng() * (LATERAL_OFFSET_MAX - LATERAL_OFFSET_MIN);
      const jitter = (rng() - 0.5) * 3;
      const x = a[0] + dx * t + nx * lateral * side + jitter;
      const z = a[1] + dz * t + nz * lateral * side + jitter;
      const catalogId = pickProp(rng());
      const scale = 0.75 + rng() * 0.7;
      const rotationY = rng() * Math.PI * 2;
      placements.push({ instanceId: `prop-${edge.id}-${i}`, catalogId, x, z, rotationY, scale });
    }
  }
  return placements;
}
