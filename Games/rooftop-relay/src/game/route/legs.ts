export type RoofMaterial = "tar" | "brick" | "glass" | "canvas" | "stone";
export type BridgeKind = "plank" | "awning";

export interface BlockSpec {
  footprint: readonly [number, number];
  roofY: number;
  xDrift: number;
}

export type FiveBlocks = readonly [BlockSpec, BlockSpec, BlockSpec, BlockSpec, BlockSpec];
export type FourGaps = readonly [number, number, number, number];

export interface LegSpec {
  id: string;
  name: string;
  theme: string;
  material: RoofMaterial;
  parSeconds: number;
  entryGap: number;
  blocks: FiveBlocks;
  internalGaps: FourGaps;
  bridges: Partial<Record<0 | 1 | 2 | 3, BridgeKind>>;
}

export const LEG_SPECS: readonly LegSpec[] = [
  {
    id: "leg1",
    name: "Warehouse Flats",
    theme: "Low wide flats, easy sightlines — find your legs.",
    material: "tar",
    parSeconds: 24,
    entryGap: 0,
    blocks: [
      { footprint: [7, 7], roofY: 4, xDrift: 0 },
      { footprint: [5, 5], roofY: 4, xDrift: 1 },
      { footprint: [5, 5], roofY: 5, xDrift: -1 },
      { footprint: [5, 5], roofY: 4, xDrift: 1 },
      { footprint: [7, 7], roofY: 5, xDrift: 0 },
    ],
    internalGaps: [2, 3, 2, 3],
    bridges: {},
  },
  {
    id: "leg2",
    name: "Tenement Staircase Roofs",
    theme: "Every roof a step higher — climb the block.",
    material: "brick",
    parSeconds: 27,
    entryGap: 3,
    blocks: [
      { footprint: [5, 5], roofY: 5, xDrift: 1 },
      { footprint: [5, 5], roofY: 6, xDrift: 1 },
      { footprint: [5, 5], roofY: 7, xDrift: -2 },
      { footprint: [5, 5], roofY: 8, xDrift: 1 },
      { footprint: [7, 7], roofY: 9, xDrift: 1 },
    ],
    internalGaps: [3, 3, 4, 3],
    bridges: { 1: "plank" },
  },
  {
    id: "leg3",
    name: "Glass Towers",
    theme: "Tall and narrow — the widest gaps in the relay.",
    material: "glass",
    parSeconds: 30,
    entryGap: 4,
    blocks: [
      { footprint: [5, 5], roofY: 9, xDrift: -1 },
      { footprint: [5, 5], roofY: 11, xDrift: 2 },
      { footprint: [5, 5], roofY: 9, xDrift: -2 },
      { footprint: [5, 5], roofY: 12, xDrift: 2 },
      { footprint: [7, 7], roofY: 10, xDrift: 0 },
    ],
    internalGaps: [4, 5, 4, 5],
    bridges: {},
  },
  {
    id: "leg4",
    name: "Market Awnings",
    theme: "Striped canvas over the alleys — trust the awning.",
    material: "canvas",
    parSeconds: 28,
    entryGap: 4,
    blocks: [
      { footprint: [7, 7], roofY: 7, xDrift: 1 },
      { footprint: [5, 5], roofY: 6, xDrift: -1 },
      { footprint: [7, 7], roofY: 8, xDrift: 2 },
      { footprint: [5, 5], roofY: 6, xDrift: -2 },
      { footprint: [7, 7], roofY: 7, xDrift: 0 },
    ],
    internalGaps: [3, 4, 3, 4],
    bridges: { 0: "awning", 2: "awning" },
  },
  {
    id: "leg5",
    name: "Clocktower Finish",
    theme: "The last ascent — clocktower waits at the top.",
    material: "stone",
    parSeconds: 34,
    entryGap: 5,
    blocks: [
      { footprint: [5, 5], roofY: 8, xDrift: -1 },
      { footprint: [5, 5], roofY: 9, xDrift: 1 },
      { footprint: [5, 5], roofY: 10, xDrift: -1 },
      { footprint: [5, 5], roofY: 11, xDrift: 1 },
      { footprint: [9, 9], roofY: 13, xDrift: 0 },
    ],
    internalGaps: [4, 5, 5, 6],
    bridges: {},
  },
];

export interface Platform {
  id: string;
  legId: string;
  blockIndex: number;
  center: readonly [number, number];
  footprint: readonly [number, number];
  roofY: number;
  material: RoofMaterial;
}

export interface GapCrossing {
  legId: string;
  gapIndex: number;
  fromPlatformId: string;
  toPlatformId: string;
  width: number;
  bridge?: BridgeKind;
  midpoint: readonly [number, number];
  roofY: number;
}

export interface CheckpointSpec {
  id: string;
  position: readonly [number, number, number];
}

export interface RouteLeg {
  spec: LegSpec;
  platforms: readonly Platform[];
  gaps: readonly GapCrossing[];
  startCheckpoint: CheckpointSpec;
  handoffCheckpoint: CheckpointSpec;
}

export interface Route {
  legs: readonly RouteLeg[];
}

function platformId(legId: string, blockIndex: number): string {
  return `${legId}-block${blockIndex + 1}`;
}

export function buildRoute(specs: readonly LegSpec[] = LEG_SPECS): Route {
  const legs: RouteLeg[] = [];
  let cursorZ = 0;
  let lastX = 0;
  let prevHandoff: CheckpointSpec | null = null;

  for (const spec of specs) {
    if (prevHandoff !== null) cursorZ += spec.entryGap + 1;

    const platforms: Platform[] = [];
    for (let i = 0; i < spec.blocks.length; i += 1) {
      const block = spec.blocks[i]!;
      const [w, d] = block.footprint;
      const halfD = (d - 1) / 2;
      lastX += block.xDrift;
      const centerZ = cursorZ + halfD;
      platforms.push({
        id: platformId(spec.id, i),
        legId: spec.id,
        blockIndex: i,
        center: [lastX, centerZ],
        footprint: [w, d],
        roofY: block.roofY,
        material: spec.material,
      });
      const farEdge = cursorZ + d - 1;
      if (i < spec.blocks.length - 1) {
        const gap = spec.internalGaps[i]!;
        cursorZ = farEdge + gap + 1;
      } else {
        cursorZ = farEdge;
      }
    }

    const gaps: GapCrossing[] = [];
    for (let i = 0; i < platforms.length - 1; i += 1) {
      const from = platforms[i]!;
      const to = platforms[i + 1]!;
      const width = spec.internalGaps[i]!;
      const bridge = spec.bridges[i as 0 | 1 | 2 | 3];
      gaps.push({
        legId: spec.id,
        gapIndex: i,
        fromPlatformId: from.id,
        toPlatformId: to.id,
        width,
        ...(bridge === undefined ? {} : { bridge }),
        midpoint: [(from.center[0] + to.center[0]) / 2, (from.center[1] + to.center[1]) / 2 + width / 2 + 0.5],
        roofY: Math.round((from.roofY + to.roofY) / 2),
      });
    }

    const block1 = platforms[0]!;
    const block5 = platforms[platforms.length - 1]!;
    const startCheckpoint: CheckpointSpec = {
      id: `${spec.id}-start`,
      position: prevHandoff?.position ?? [block1.center[0], block1.roofY, block1.center[1]],
    };
    const handoffCheckpoint: CheckpointSpec = {
      id: `${spec.id}-handoff`,
      position: [block5.center[0], block5.roofY, block5.center[1]],
    };

    legs.push({ spec, platforms, gaps, startCheckpoint, handoffCheckpoint });
    prevHandoff = handoffCheckpoint;
  }

  return { legs };
}

export const ROUTE: Route = buildRoute();

export function totalParSeconds(route: Route = ROUTE): number {
  return route.legs.reduce((sum, leg) => sum + leg.spec.parSeconds, 0);
}

export function allPlatforms(route: Route = ROUTE): readonly Platform[] {
  return route.legs.flatMap((leg) => leg.platforms);
}

export function allGaps(route: Route = ROUTE): readonly GapCrossing[] {
  return route.legs.flatMap((leg) => leg.gaps);
}

export function allCheckpoints(route: Route = ROUTE): readonly CheckpointSpec[] {
  const seen = new Set<string>();
  const out: CheckpointSpec[] = [];
  for (const leg of route.legs) {
    for (const cp of [leg.startCheckpoint, leg.handoffCheckpoint]) {
      if (seen.has(cp.id)) continue;
      seen.add(cp.id);
      out.push(cp);
    }
  }
  return out;
}
