import type { BaseBuildingConfig, StructureShapeDef } from "../../engine-local/basebuilding/baseBuilding";
import type { SocketDef } from "@jgengine/core/placement/buildSockets";

/**
 * ARK's building kit on its 3 m grid: thatch, wood and stone foundations, walls, doorframes, doors and
 * ceilings, wooden and stone pillars, the wooden ramp, and the two stations. Health, level, engram
 * points and costs are each piece's ark.wiki.gg page; shapes are ours (placeholder boxes).
 */
export interface StructureDef {
  id: string;
  label: string;
  shape: string;
  tier: TierId;
  health: number;
  level: number;
  points: number;
  cost: Record<string, number>;
  /** kg per carried piece. */
  weight: number;
  note: string;
}

export type TierId = "thatch" | "wood" | "stone" | "station";

const GRID = 3;
const HALF = GRID / 2;
const WALL = 3;
const THICK = 0.15;
const RIGHT = Math.PI / 2;

/** Socket yaw is the outward direction's angle `atan2(z, x)`, as `placement/buildSockets` reads it. */
function edges(kind: string, y: number): SocketDef[] {
  return [
    { name: `${kind}+x`, kind, position: [HALF, y, 0], yaw: 0 },
    { name: `${kind}+z`, kind, position: [0, y, HALF], yaw: RIGHT },
    { name: `${kind}-x`, kind, position: [-HALF, y, 0], yaw: Math.PI },
    { name: `${kind}-z`, kind, position: [0, y, -HALF], yaw: -RIGHT },
  ];
}

function corners(kind: string, y: number): SocketDef[] {
  return [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ].map(([x, z]) => ({ name: `${kind}${x}${z}`, kind, position: [x! * HALF, y, z! * HALF] as const, yaw: Math.atan2(z!, x!) }));
}

/** Both faces of a wall-like piece, so it can sit either way round. */
function faces(kind: string, y: number): SocketDef[] {
  return [
    { name: `${kind}a`, kind, position: [0, y, 0], yaw: RIGHT },
    { name: `${kind}b`, kind, position: [0, y, 0], yaw: -RIGHT },
  ];
}

const DOOR_W = 1.2;
const DOOR_H = 2.3;
const RAMP_STEPS = 10;

export const SHAPES: readonly StructureShapeDef[] = [
  // The slab's top is the floor; its block runs 2 m down so uneven ground stays covered.
  { id: "foundation", boxes: [{ min: [-HALF, -2, -HALF], max: [HALF, 0, HALF] }], sockets: [...edges("floor_edge", 0), ...corners("floor_corner", 0)], ground: { lift: 0.3, maxStep: 1.6 } },
  { id: "wall", boxes: [{ min: [-HALF, 0, -THICK], max: [HALF, WALL, THICK] }], sockets: [...faces("wall_base", 0), ...faces("wall_top", WALL)] },
  {
    id: "doorframe",
    boxes: [
      { min: [-HALF, 0, -THICK], max: [-DOOR_W / 2, WALL, THICK] },
      { min: [DOOR_W / 2, 0, -THICK], max: [HALF, WALL, THICK] },
      { min: [-DOOR_W / 2, DOOR_H, -THICK], max: [DOOR_W / 2, WALL, THICK] },
    ],
    sockets: [...faces("wall_base", 0), ...faces("wall_top", WALL), { name: "door", kind: "door_slot", position: [0, 0, 0], yaw: 0 }],
  },
  {
    id: "door",
    boxes: [{ min: [-DOOR_W / 2, 0, -0.06], max: [DOOR_W / 2, DOOR_H, 0.06] }],
    // Swung 90° on its left hinge.
    openBoxes: [{ min: [-DOOR_W / 2 - 0.06, 0, 0], max: [-DOOR_W / 2 + 0.06, DOOR_H, DOOR_W] }],
    sockets: [
      { name: "hinge", kind: "door_hinge", position: [0, 0, 0], yaw: Math.PI },
      { name: "hinge-flip", kind: "door_hinge", position: [0, 0, 0], yaw: 0 },
    ],
  },
  { id: "ceiling", boxes: [{ min: [-HALF, -0.25, -HALF], max: [HALF, 0, HALF] }], sockets: [...edges("ceiling_edge", 0), ...corners("ceiling_corner", 0)] },
  {
    id: "pillar",
    boxes: [{ min: [-0.2, 0, -0.2], max: [0.2, WALL, 0.2] }],
    sockets: [{ name: "base", kind: "pillar_base", position: [0, 0, 0], yaw: 0 }, ...[0, 1, 2, 3].map((turn) => ({ name: `top${turn}`, kind: "pillar_top", position: [0, WALL, 0] as const, yaw: Math.PI / 4 + turn * RIGHT }))],
    ground: { lift: 0, maxStep: 0.5 },
  },
  {
    // Steps 0.3 m high and deep, under the survivor's 0.4 m step, rising one wall height over one grid cell.
    id: "ramp",
    boxes: Array.from({ length: RAMP_STEPS }, (_, step) => {
      const rise = (WALL / RAMP_STEPS) * (step + 1);
      return { min: [(GRID / RAMP_STEPS) * step, Math.max(0, rise - 0.35), -HALF] as const, max: [(GRID / RAMP_STEPS) * (step + 1), rise, HALF] as const };
    }),
    sockets: [
      { name: "low-out", kind: "ramp_low", position: [0, 0, 0], yaw: Math.PI },
      { name: "low-in", kind: "ramp_low", position: [0, 0, 0], yaw: 0 },
      { name: "high", kind: "ramp_high", position: [GRID, WALL, 0], yaw: 0 },
    ],
  },
  { id: "campfire", boxes: [{ min: [-0.5, 0, -0.5], max: [0.5, 0.35, 0.5] }], ground: { maxStep: 0.6 }, floor: true },
  { id: "mortar_and_pestle", boxes: [{ min: [-0.3, 0, -0.3], max: [0.3, 0.55, 0.3] }], ground: { maxStep: 0.6 }, floor: true },
];

/** Which socket kinds mate: candidate kind `a` onto placed kind `b`. */
const RULES: BaseBuildingConfig["rules"] = [
  { a: "floor_edge", b: "floor_edge" },
  { a: "wall_base", b: "floor_edge", mutual: false },
  { a: "wall_base", b: "ceiling_edge", mutual: false },
  { a: "wall_base", b: "wall_top", mutual: false },
  { a: "ceiling_edge", b: "wall_top", mutual: false },
  { a: "ceiling_edge", b: "ceiling_edge" },
  { a: "ceiling_corner", b: "pillar_top", mutual: false },
  { a: "pillar_base", b: "floor_corner", mutual: false },
  { a: "pillar_base", b: "ceiling_corner", mutual: false },
  { a: "door_hinge", b: "door_slot", mutual: false },
  { a: "ramp_low", b: "floor_edge", mutual: false },
  { a: "ramp_low", b: "ceiling_edge", mutual: false },
  { a: "ramp_low", b: "ramp_high", mutual: false },
  { a: "ramp_high", b: "floor_edge", mutual: false },
  { a: "ramp_high", b: "ceiling_edge", mutual: false },
];

/**
 * ARK's tier rules: thatch takes anything but plain ranged shots; wood shrugs off fists, stone tools and
 * plain ranged shots; stone only takes metal tools and explosives.
 */
const TIERS: BaseBuildingConfig["tiers"] = [
  { id: "thatch", at: 0, damage: { ranged: 0 } },
  { id: "wood", at: 1, damage: { fist: 0, primitive: 0, ranged: 0 } },
  { id: "stone", at: 2, damage: { "*": 0, metal: 1, explosive: 1 } },
  { id: "station", at: 3 },
];

export const TIER_COLORS: Record<TierId, string> = { thatch: "#c9a85a", wood: "#8a5a34", stone: "#9a978f", station: "#6b5a48" };

const piece = (id: string, label: string, shape: string, tier: TierId, health: number, level: number, points: number, cost: Record<string, number>, weight: number, note: string): StructureDef => ({ id, label, shape, tier, health, level, points, cost, weight, note });

export const STRUCTURES: readonly StructureDef[] = [
  piece("campfire", "Campfire", "campfire", "station", 100, 2, 3, { thatch: 12, flint: 1, stone: 16, wood: 2 }, 4, "Cooks meat and keeps you warm."),
  piece("thatch_foundation", "Thatch Foundation", "foundation", "thatch", 2400, 4, 3, { thatch: 20, wood: 6, fiber: 15 }, 6, "The floor every hut starts from."),
  piece("thatch_wall", "Thatch Wall", "wall", "thatch", 1600, 4, 3, { thatch: 10, wood: 2, fiber: 7 }, 4, "Snaps to a foundation edge."),
  piece("thatch_doorframe", "Thatch Doorframe", "doorframe", "thatch", 2400, 4, 3, { thatch: 8, wood: 6, fiber: 6 }, 4, "A wall with a door gap."),
  piece("thatch_door", "Thatch Door", "door", "thatch", 1600, 4, 3, { thatch: 7, fiber: 4 }, 4, "Fits a doorframe. E opens it."),
  piece("thatch_ceiling", "Thatch Ceiling", "ceiling", "thatch", 1600, 4, 3, { thatch: 15, wood: 4, fiber: 10 }, 4, "A roof over walls."),
  piece("mortar_and_pestle", "Mortar and Pestle", "mortar_and_pestle", "station", 1000, 6, 6, { stone: 65, hide: 15 }, 12, "Grinds sparkpowder and narcotics."),
  piece("wooden_foundation", "Wooden Foundation", "foundation", "wood", 15000, 11, 6, { wood: 80, thatch: 20, fiber: 15 }, 4, "Fists and stone tools can't break it."),
  piece("wooden_wall", "Wooden Wall", "wall", "wood", 10000, 11, 7, { wood: 40, thatch: 10, fiber: 7 }, 4, "Fists and stone tools can't break it."),
  piece("wooden_doorframe", "Wooden Doorframe", "doorframe", "wood", 10000, 11, 6, { wood: 30, thatch: 8, fiber: 6 }, 4, "A wooden wall with a door gap."),
  piece("wooden_door", "Wooden Door", "door", "wood", 6250, 11, 4, { wood: 20, thatch: 7, fiber: 4 }, 4, "Fits a doorframe. E opens it."),
  piece("wooden_ceiling", "Wooden Ceiling", "ceiling", "wood", 10000, 11, 6, { wood: 60, thatch: 15, fiber: 10 }, 4, "A roof you can stand on."),
  piece("wooden_ramp", "Wooden Ramp", "ramp", "wood", 10000, 12, 3, { wood: 60, thatch: 15, fiber: 10 }, 4, "Climbs one wall height."),
  piece("wooden_pillar", "Wooden Pillar", "pillar", "wood", 6250, 12, 9, { wood: 40, thatch: 10, fiber: 7 }, 4, "Holds up ceilings from below."),
  piece("stone_foundation", "Stone Foundation", "foundation", "stone", 15000, 24, 6, { stone: 80, wood: 40, thatch: 30 }, 4, "Only metal tools and explosives break it."),
  piece("stone_wall", "Stone Wall", "wall", "stone", 10000, 24, 8, { stone: 40, wood: 20, thatch: 15 }, 4, "Only metal tools and explosives break it."),
  piece("stone_doorframe", "Stone Doorframe", "doorframe", "stone", 10000, 24, 6, { stone: 30, wood: 16, thatch: 12 }, 4, "A stone wall with a door gap."),
  piece("reinforced_wooden_door", "Reinforced Wooden Door", "door", "stone", 6250, 24, 4, { stone: 20, wood: 14, thatch: 8 }, 4, "A stone-tier door. E opens it."),
  piece("stone_ceiling", "Stone Ceiling", "ceiling", "stone", 10000, 24, 6, { stone: 60, wood: 30, thatch: 20 }, 4, "A stone roof."),
  piece("stone_pillar", "Stone Pillar", "pillar", "stone", 6250, 25, 8, { stone: 30, wood: 15, thatch: 10 }, 4, "Holds up ceilings from below."),
];

const BY_ID = new Map(STRUCTURES.map((entry) => [entry.id, entry]));

export function structureDef(id: string): StructureDef | null {
  return BY_ID.get(id) ?? null;
}

export const BASE_BUILDING: BaseBuildingConfig = {
  shapes: SHAPES,
  tiers: TIERS,
  pieces: STRUCTURES.map((entry) => ({ id: entry.id, shape: entry.shape, tier: entry.tier, health: entry.health })),
  rules: RULES,
  // No camera pitch reaches the sim, so a 3 m snap lets a cursor at chest height reach both floor edges and wall tops.
  snapDistance: 3,
};

/** Stations a recipe can need, by piece id. */
export const STATIONS: ReadonlySet<string> = new Set(["campfire", "mortar_and_pestle"]);
