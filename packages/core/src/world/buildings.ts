import { footprintAabb, type Aabb, type Footprint, type Vec2 } from "./geometry";

export type BuildingSeed = number | string;
export type Vec3 = readonly [number, number, number];
export type BuildingFacade = "front" | "back" | "left" | "right" | "roof";
export type BuildingPartKind =
  | "wall"
  | "window"
  | "awning"
  | "airConditioner"
  | "clothesline"
  | "storefront"
  | "shutter"
  | "storeSign"
  | "roof"
  | "roofProp"
  | "guardrail"
  | "corner";
export type BuildingPartTag = "ground" | "upper" | "open" | "closed" | "decor" | "structure";

export interface BuildingProbabilities {
  window: number;
  openStore: number;
  awning: number;
  airConditioner: number;
  clothesline: number;
  storeSign: number;
  roofProp: number;
}

export interface BuildingVariantCounts {
  wall: number;
  window: number;
  awning: number;
  airConditioner: number;
  clothesline: number;
  storefront: number;
  shutter: number;
  storeSign: number;
  roofProp: number;
}

export interface BuildingConfig {
  id: string;
  seed: BuildingSeed;
  center: Vec2;
  floors: number;
  baysWide: number;
  baysDeep: number;
  bayWidth: number;
  floorHeight: number;
  facadeDepth: number;
  roofOverhang: number;
  probabilities: BuildingProbabilities;
  variants: BuildingVariantCounts;
}

export type BuildingConfigInput = Partial<
  Omit<BuildingConfig, "probabilities" | "variants">
> & {
  probabilities?: Partial<BuildingProbabilities>;
  variants?: Partial<BuildingVariantCounts>;
};

export interface BuildingKitSlot {
  key: string;
  variant: number;
}

export interface BuildingCellRef {
  facade: BuildingFacade;
  level: number;
  bay: number;
}

export interface BuildingPartPlacement {
  id: string;
  buildingId: string;
  kind: BuildingPartKind;
  facade: BuildingFacade;
  position: Vec3;
  rotationY: number;
  scale: Vec3;
  kit: BuildingKitSlot;
  cell?: BuildingCellRef;
  tags?: readonly BuildingPartTag[];
}

export interface GeneratedBuilding {
  id: string;
  seed: BuildingSeed;
  center: Vec2;
  footprint: Footprint;
  floors: number;
  floorHeight: number;
  bounds: Aabb;
  parts: readonly BuildingPartPlacement[];
  /**
   * Optional building yaw (radians) about `center`, applied by the renderer to the whole massing —
   * used by street-aware placement to turn a building's front to face its road. Absent/0 keeps the
   * axis-aligned grid orientation.
   */
  rotationY?: number;
}

export interface BuildingLot {
  id: string;
  center: Vec2;
  footprint: Footprint;
  quarterTurns: number;
  config: BuildingConfig;
}

export interface BuildingGridConfig {
  rows: number;
  columns: number;
  origin?: Vec2;
  lotSize?: Footprint;
  streetWidth?: number;
  seed?: BuildingSeed;
  idPrefix?: string;
  base?: BuildingConfigInput;
  floorRange?: readonly [number, number];
}

const DEFAULT_PROBABILITIES: BuildingProbabilities = {
  window: 0.88,
  openStore: 0.58,
  awning: 0.45,
  airConditioner: 0.42,
  clothesline: 0.28,
  storeSign: 0.62,
  roofProp: 0.34,
};

const DEFAULT_VARIANTS: BuildingVariantCounts = {
  wall: 6,
  window: 4,
  awning: 3,
  airConditioner: 3,
  clothesline: 3,
  storefront: 4,
  shutter: 3,
  storeSign: 5,
  roofProp: 5,
};

export const DEFAULT_BUILDING_CONFIG: BuildingConfig = {
  id: "building",
  seed: 0,
  center: [0, 0],
  floors: 6,
  baysWide: 6,
  baysDeep: 3,
  bayWidth: 2,
  floorHeight: 2.8,
  facadeDepth: 0.18,
  roofOverhang: 0.35,
  probabilities: DEFAULT_PROBABILITIES,
  variants: DEFAULT_VARIANTS,
};

export type BuildingPalette = Record<BuildingPartKind, string>;
export type BuildingPaletteOverrides = Partial<BuildingPalette>;

export type BuildingStyle =
  | "generic"
  | "capital"
  | "village"
  | "desert"
  | "industrial"
  | "coastal"
  | "neon"
  | "ruin"
  | "frontier"
  | "aerial";

export const DEFAULT_BUILDING_STYLE: BuildingStyle = "generic";

export const BUILDING_STYLE_PALETTES: Record<BuildingStyle, BuildingPalette> = {
  generic: {
    wall: "#83766a",
    window: "#8ecae6",
    awning: "#c2410c",
    airConditioner: "#d4d4d8",
    clothesline: "#facc15",
    storefront: "#3f3f46",
    shutter: "#52525b",
    storeSign: "#f97316",
    roof: "#57534e",
    roofProp: "#14b8a6",
    guardrail: "#a8a29e",
    corner: "#6b6258",
  },
  capital: {
    wall: "#cfc5ad",
    window: "#33506e",
    awning: "#7a1f2b",
    airConditioner: "#b9b3a4",
    clothesline: "#d9cfae",
    storefront: "#4a3f33",
    shutter: "#5d5647",
    storeSign: "#d4af37",
    roof: "#3b4252",
    roofProp: "#8c7a4e",
    guardrail: "#a89f88",
    corner: "#b3a98d",
  },
  village: {
    wall: "#b59e7a",
    window: "#e9c46a",
    awning: "#7f5539",
    airConditioner: "#a8a29e",
    clothesline: "#e07a5f",
    storefront: "#5c4a36",
    shutter: "#6e5a40",
    storeSign: "#c8894a",
    roof: "#8a5a3b",
    roofProp: "#97724d",
    guardrail: "#8f8271",
    corner: "#8d7354",
  },
  desert: {
    wall: "#c9a877",
    window: "#3f6f6b",
    awning: "#a3512e",
    airConditioner: "#c9bfa8",
    clothesline: "#d9b16f",
    storefront: "#6e5233",
    shutter: "#7d6140",
    storeSign: "#b8742f",
    roof: "#b5946a",
    roofProp: "#9a7648",
    guardrail: "#b09b77",
    corner: "#a98c5d",
  },
  industrial: {
    wall: "#6b7280",
    window: "#9fb3c8",
    awning: "#f97316",
    airConditioner: "#9ca3af",
    clothesline: "#eab308",
    storefront: "#374151",
    shutter: "#4b5563",
    storeSign: "#f59e0b",
    roof: "#374151",
    roofProp: "#ef4444",
    guardrail: "#d1d5db",
    corner: "#52596b",
  },
  coastal: {
    wall: "#e8e2d2",
    window: "#7cc3d8",
    awning: "#e76f51",
    airConditioner: "#cfd8dc",
    clothesline: "#f2cc8f",
    storefront: "#35526b",
    shutter: "#3a7ca5",
    storeSign: "#ee6c4d",
    roof: "#4f6d7a",
    roofProp: "#62b6cb",
    guardrail: "#c5ccc2",
    corner: "#cfc5ab",
  },
  neon: {
    wall: "#1b1b26",
    window: "#22d3ee",
    awning: "#ff2d95",
    airConditioner: "#3f3f50",
    clothesline: "#a78bfa",
    storefront: "#12121a",
    shutter: "#2a2a3a",
    storeSign: "#f0abfc",
    roof: "#14141d",
    roofProp: "#34d399",
    guardrail: "#52525f",
    corner: "#24242f",
  },
  ruin: {
    wall: "#6b6156",
    window: "#1c1917",
    awning: "#4a4238",
    airConditioner: "#57534e",
    clothesline: "#6b7f4f",
    storefront: "#292524",
    shutter: "#44403c",
    storeSign: "#78716c",
    roof: "#4a443e",
    roofProp: "#6b7f4f",
    guardrail: "#7c7268",
    corner: "#57503f",
  },
  frontier: {
    wall: "#7f5539",
    window: "#d9ae62",
    awning: "#6e3f1f",
    airConditioner: "#8d8072",
    clothesline: "#c98a5e",
    storefront: "#4a3220",
    shutter: "#5c3d26",
    storeSign: "#b3702f",
    roof: "#9c4a1a",
    roofProp: "#7d6b52",
    guardrail: "#937b5f",
    corner: "#66492f",
  },
  aerial: {
    wall: "#dfe7ec",
    window: "#67c3cc",
    awning: "#4d7ea8",
    airConditioner: "#b8c4cc",
    clothesline: "#9fd8df",
    storefront: "#5c7684",
    shutter: "#7b95a3",
    storeSign: "#3aa7b8",
    roof: "#aebcc4",
    roofProp: "#e0f2f5",
    guardrail: "#98a8b0",
    corner: "#c3d0d7",
  },
};

/** @internal */
export function resolveBuildingPalette(
  style: BuildingStyle = DEFAULT_BUILDING_STYLE,
  overrides?: BuildingPaletteOverrides,
): BuildingPalette {
  const preset = BUILDING_STYLE_PALETTES[style] as BuildingPalette | undefined;
  if (preset === undefined) {
    throw new Error(
      `Unknown building style "${style}". Valid styles: ${Object.keys(BUILDING_STYLE_PALETTES).join(", ")}. Use palette: { wall, window, ... } for a custom look.`,
    );
  }
  if (overrides === undefined) return preset;
  return { ...preset, ...overrides };
}

function hashU32(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function hash01(seed: BuildingSeed, key: string): number {
  return hashU32(`${seed}:${key}`) / 4294967296;
}

function probability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function positiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function positiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function variantCount(value: number): number {
  return positiveInt(value, 1);
}

function variant(seed: BuildingSeed, key: string, count: number): number {
  return Math.floor(hash01(seed, key) * variantCount(count));
}

function chance(seed: BuildingSeed, key: string, p: number): boolean {
  return hash01(seed, key) < probability(p);
}

function rangeInt(seed: BuildingSeed, key: string, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(hash01(seed, key) * (hi - lo + 1));
}

/** @internal */
export function createBuildingConfig(input: BuildingConfigInput = {}): BuildingConfig {
  return {
    id: input.id ?? DEFAULT_BUILDING_CONFIG.id,
    seed: input.seed ?? DEFAULT_BUILDING_CONFIG.seed,
    center: input.center ?? DEFAULT_BUILDING_CONFIG.center,
    floors: positiveInt(input.floors ?? DEFAULT_BUILDING_CONFIG.floors, DEFAULT_BUILDING_CONFIG.floors),
    baysWide: positiveInt(input.baysWide ?? DEFAULT_BUILDING_CONFIG.baysWide, DEFAULT_BUILDING_CONFIG.baysWide),
    baysDeep: positiveInt(input.baysDeep ?? DEFAULT_BUILDING_CONFIG.baysDeep, DEFAULT_BUILDING_CONFIG.baysDeep),
    bayWidth: positiveNumber(input.bayWidth ?? DEFAULT_BUILDING_CONFIG.bayWidth, DEFAULT_BUILDING_CONFIG.bayWidth),
    floorHeight: positiveNumber(
      input.floorHeight ?? DEFAULT_BUILDING_CONFIG.floorHeight,
      DEFAULT_BUILDING_CONFIG.floorHeight,
    ),
    facadeDepth: positiveNumber(
      input.facadeDepth ?? DEFAULT_BUILDING_CONFIG.facadeDepth,
      DEFAULT_BUILDING_CONFIG.facadeDepth,
    ),
    roofOverhang: Math.max(0, input.roofOverhang ?? DEFAULT_BUILDING_CONFIG.roofOverhang),
    probabilities: {
      window: probability(input.probabilities?.window ?? DEFAULT_PROBABILITIES.window),
      openStore: probability(input.probabilities?.openStore ?? DEFAULT_PROBABILITIES.openStore),
      awning: probability(input.probabilities?.awning ?? DEFAULT_PROBABILITIES.awning),
      airConditioner: probability(
        input.probabilities?.airConditioner ?? DEFAULT_PROBABILITIES.airConditioner,
      ),
      clothesline: probability(input.probabilities?.clothesline ?? DEFAULT_PROBABILITIES.clothesline),
      storeSign: probability(input.probabilities?.storeSign ?? DEFAULT_PROBABILITIES.storeSign),
      roofProp: probability(input.probabilities?.roofProp ?? DEFAULT_PROBABILITIES.roofProp),
    },
    variants: {
      wall: variantCount(input.variants?.wall ?? DEFAULT_VARIANTS.wall),
      window: variantCount(input.variants?.window ?? DEFAULT_VARIANTS.window),
      awning: variantCount(input.variants?.awning ?? DEFAULT_VARIANTS.awning),
      airConditioner: variantCount(input.variants?.airConditioner ?? DEFAULT_VARIANTS.airConditioner),
      clothesline: variantCount(input.variants?.clothesline ?? DEFAULT_VARIANTS.clothesline),
      storefront: variantCount(input.variants?.storefront ?? DEFAULT_VARIANTS.storefront),
      shutter: variantCount(input.variants?.shutter ?? DEFAULT_VARIANTS.shutter),
      storeSign: variantCount(input.variants?.storeSign ?? DEFAULT_VARIANTS.storeSign),
      roofProp: variantCount(input.variants?.roofProp ?? DEFAULT_VARIANTS.roofProp),
    },
  };
}

function faceRotation(facade: BuildingFacade): number {
  if (facade === "front") return Math.PI;
  if (facade === "left") return Math.PI / 2;
  if (facade === "right") return -Math.PI / 2;
  return 0;
}

function faceDepth(facade: BuildingFacade, width: number, depth: number, config: BuildingConfig): number {
  if (facade === "front") return config.center[1] + depth / 2 + config.facadeDepth / 2;
  if (facade === "back") return config.center[1] - depth / 2 - config.facadeDepth / 2;
  if (facade === "left") return config.center[0] - width / 2 - config.facadeDepth / 2;
  return config.center[0] + width / 2 + config.facadeDepth / 2;
}

function panelPosition(
  config: BuildingConfig,
  facade: Exclude<BuildingFacade, "roof">,
  bay: number,
  level: number,
  width: number,
  depth: number,
): Vec3 {
  const y = level * config.floorHeight + config.floorHeight / 2;
  if (facade === "front" || facade === "back") {
    const x = config.center[0] - width / 2 + config.bayWidth * (bay + 0.5);
    return [x, y, faceDepth(facade, width, depth, config)];
  }
  const z = config.center[1] - depth / 2 + config.bayWidth * (bay + 0.5);
  return [faceDepth(facade, width, depth, config), y, z];
}

function panelScale(config: BuildingConfig, _facade: BuildingFacade, heightRatio: number, widthRatio = 0.92): Vec3 {
  const along = config.bayWidth * widthRatio;
  const high = config.floorHeight * heightRatio;
  return [along, high, config.facadeDepth];
}

function part(
  config: BuildingConfig,
  kind: BuildingPartKind,
  facade: BuildingFacade,
  position: Vec3,
  scale: Vec3,
  key: string,
  cell?: BuildingCellRef,
  tags?: readonly BuildingPartTag[],
): BuildingPartPlacement {
  const selectedVariant =
    kind === "airConditioner"
      ? variant(config.seed, `${key}:variant`, config.variants.airConditioner)
      : kind === "roofProp"
        ? variant(config.seed, `${key}:variant`, config.variants.roofProp)
        : kind === "storefront"
          ? variant(config.seed, `${key}:variant`, config.variants.storefront)
          : kind === "shutter"
            ? variant(config.seed, `${key}:variant`, config.variants.shutter)
            : kind === "storeSign"
              ? variant(config.seed, `${key}:variant`, config.variants.storeSign)
              : kind === "awning"
                ? variant(config.seed, `${key}:variant`, config.variants.awning)
                : kind === "clothesline"
                  ? variant(config.seed, `${key}:variant`, config.variants.clothesline)
                  : kind === "window"
                    ? variant(config.seed, `${key}:variant`, config.variants.window)
                    : kind === "wall"
                      ? variant(config.seed, `${key}:variant`, config.variants.wall)
                      : 0;
  return {
    id: `${config.id}:${key}:${kind}`,
    buildingId: config.id,
    kind,
    facade,
    position,
    rotationY: faceRotation(facade),
    scale,
    kit: { key: `${facade}.${kind}`, variant: selectedVariant },
    ...(cell === undefined ? {} : { cell }),
    ...(tags === undefined ? {} : { tags }),
  };
}

function pushUpperFloorParts(
  parts: BuildingPartPlacement[],
  config: BuildingConfig,
  facade: Exclude<BuildingFacade, "roof">,
  bay: number,
  level: number,
  width: number,
  depth: number,
): void {
  const cell: BuildingCellRef = { facade, level, bay };
  const key = `${facade}:${level}:${bay}`;
  const position = panelPosition(config, facade, bay, level, width, depth);
  parts.push(part(config, "wall", facade, position, panelScale(config, facade, 0.92), `${key}:wall`, cell, ["structure", "upper"]));
  if (!chance(config.seed, `${key}:window`, config.probabilities.window)) return;
  parts.push(part(config, "window", facade, position, panelScale(config, facade, 0.46, 0.58), `${key}:window`, cell, ["upper"]));
  if (chance(config.seed, `${key}:awning`, config.probabilities.awning)) {
    const awningPosition: Vec3 = [position[0], position[1] + config.floorHeight * 0.29, position[2]];
    parts.push(part(config, "awning", facade, awningPosition, panelScale(config, facade, 0.1, 0.72), `${key}:awning`, cell, ["decor", "upper"]));
  }
  if (chance(config.seed, `${key}:ac`, config.probabilities.airConditioner)) {
    const acPosition: Vec3 = [position[0], position[1] - config.floorHeight * 0.25, position[2]];
    parts.push(part(config, "airConditioner", facade, acPosition, panelScale(config, facade, 0.16, 0.24), `${key}:ac`, cell, ["decor", "upper"]));
  }
  if (chance(config.seed, `${key}:clothesline`, config.probabilities.clothesline)) {
    const linePosition: Vec3 = [position[0], position[1] - config.floorHeight * 0.36, position[2]];
    parts.push(part(config, "clothesline", facade, linePosition, panelScale(config, facade, 0.04, 0.72), `${key}:line`, cell, ["decor", "upper"]));
  }
}

function pushGroundFloorParts(
  parts: BuildingPartPlacement[],
  config: BuildingConfig,
  facade: Exclude<BuildingFacade, "roof">,
  bay: number,
  width: number,
  depth: number,
): void {
  const cell: BuildingCellRef = { facade, level: 0, bay };
  const key = `${facade}:0:${bay}`;
  const position = panelPosition(config, facade, bay, 0, width, depth);
  if (facade === "front" && chance(config.seed, `${key}:open`, config.probabilities.openStore)) {
    parts.push(part(config, "storefront", facade, position, panelScale(config, facade, 0.86), `${key}:store`, cell, ["ground", "open"]));
    if (chance(config.seed, `${key}:sign`, config.probabilities.storeSign)) {
      const signPosition: Vec3 = [position[0], position[1] + config.floorHeight * 0.34, position[2]];
      parts.push(part(config, "storeSign", facade, signPosition, panelScale(config, facade, 0.14, 0.76), `${key}:sign`, cell, ["decor", "ground"]));
    }
    return;
  }
  const kind: BuildingPartKind = facade === "front" ? "shutter" : "wall";
  parts.push(part(config, kind, facade, position, panelScale(config, facade, 0.86), `${key}:${kind}`, cell, ["ground", "closed"]));
}

function pushFacade(
  parts: BuildingPartPlacement[],
  config: BuildingConfig,
  facade: Exclude<BuildingFacade, "roof">,
  width: number,
  depth: number,
): void {
  const bays = facade === "front" || facade === "back" ? config.baysWide : config.baysDeep;
  for (let bay = 0; bay < bays; bay += 1) {
    pushGroundFloorParts(parts, config, facade, bay, width, depth);
    for (let level = 1; level < config.floors; level += 1) {
      pushUpperFloorParts(parts, config, facade, bay, level, width, depth);
    }
  }
}

function pushRoof(parts: BuildingPartPlacement[], config: BuildingConfig, width: number, depth: number): void {
  const height = config.floors * config.floorHeight;
  parts.push(
    part(
      config,
      "roof",
      "roof",
      [config.center[0], height + config.facadeDepth / 2, config.center[1]],
      [width + config.roofOverhang * 2, config.facadeDepth, depth + config.roofOverhang * 2],
      "roof:slab",
      { facade: "roof", level: config.floors, bay: 0 },
      ["structure"],
    ),
  );
  const edges: readonly Exclude<BuildingFacade, "roof">[] = ["front", "back", "left", "right"];
  for (const facade of edges) {
    const position =
      facade === "front" || facade === "back"
        ? ([config.center[0], height + config.floorHeight * 0.18, faceDepth(facade, width, depth, config)] as const)
        : ([faceDepth(facade, width, depth, config), height + config.floorHeight * 0.18, config.center[1]] as const);
    const scale =
      facade === "front" || facade === "back"
        ? ([width + config.roofOverhang * 2, config.floorHeight * 0.28, config.facadeDepth] as const)
        : ([depth + config.roofOverhang * 2, config.floorHeight * 0.28, config.facadeDepth] as const);
    parts.push(part(config, "guardrail", facade, position, scale, `roof:${facade}:rail`, undefined, ["structure"]));
  }
  const roofCells = config.baysWide * config.baysDeep;
  for (let index = 0; index < roofCells; index += 1) {
    if (!chance(config.seed, `roof:prop:${index}`, config.probabilities.roofProp)) continue;
    const x = config.center[0] - width / 2 + config.bayWidth * ((index % config.baysWide) + 0.5);
    const z = config.center[1] - depth / 2 + config.bayWidth * (Math.floor(index / config.baysWide) + 0.5);
    parts.push(
      part(
        config,
        "roofProp",
        "roof",
        [x, height + config.facadeDepth + config.floorHeight * 0.16, z],
        [config.bayWidth * 0.34, config.floorHeight * 0.32, config.bayWidth * 0.34],
        `roof:prop:${index}`,
        { facade: "roof", level: config.floors, bay: index },
        ["decor"],
      ),
    );
  }
}

function pushCorners(parts: BuildingPartPlacement[], config: BuildingConfig, width: number, depth: number): void {
  const height = config.floors * config.floorHeight;
  const positions: readonly Vec3[] = [
    [config.center[0] - width / 2, height / 2, config.center[1] - depth / 2],
    [config.center[0] + width / 2, height / 2, config.center[1] - depth / 2],
    [config.center[0] - width / 2, height / 2, config.center[1] + depth / 2],
    [config.center[0] + width / 2, height / 2, config.center[1] + depth / 2],
  ];
  positions.forEach((position, index) => {
    parts.push(
      part(
        config,
        "corner",
        index < 2 ? "back" : "front",
        position,
        [config.facadeDepth * 1.35, height, config.facadeDepth * 1.35],
        `corner:${index}`,
        undefined,
        ["structure"],
      ),
    );
  });
}

/** @internal */
export function generateBuilding(input: BuildingConfigInput = {}): GeneratedBuilding {
  const config = createBuildingConfig(input);
  const width = config.baysWide * config.bayWidth;
  const depth = config.baysDeep * config.bayWidth;
  const footprint = { w: width + config.roofOverhang * 2, d: depth + config.roofOverhang * 2 };
  const parts: BuildingPartPlacement[] = [];
  pushFacade(parts, config, "front", width, depth);
  pushFacade(parts, config, "back", width, depth);
  pushFacade(parts, config, "left", width, depth);
  pushFacade(parts, config, "right", width, depth);
  pushCorners(parts, config, width, depth);
  pushRoof(parts, config, width, depth);
  return {
    id: config.id,
    seed: config.seed,
    center: config.center,
    footprint,
    floors: config.floors,
    floorHeight: config.floorHeight,
    bounds: footprintAabb(config.center, footprint),
    parts,
  };
}

/** @internal */
export function createBuildingGrid(config: BuildingGridConfig): BuildingLot[] {
  const rows = positiveInt(config.rows, 1);
  const columns = positiveInt(config.columns, 1);
  const lotSize = config.lotSize ?? { w: 14, d: 10 };
  const streetWidth = Math.max(0, config.streetWidth ?? 4);
  const origin = config.origin ?? [0, 0];
  const seed = config.seed ?? 0;
  const idPrefix = config.idPrefix ?? "building";
  const lots: BuildingLot[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const id = `${idPrefix}-${row}-${column}`;
      const center: Vec2 = [
        origin[0] + column * (lotSize.w + streetWidth),
        origin[1] + row * (lotSize.d + streetWidth),
      ];
      const floorRange = config.floorRange ?? [3, 9];
      const floors = rangeInt(seed, `${id}:floors`, floorRange[0], floorRange[1]);
      const base = config.base ?? {};
      const bayWidth = positiveNumber(base.bayWidth ?? DEFAULT_BUILDING_CONFIG.bayWidth, DEFAULT_BUILDING_CONFIG.bayWidth);
      const baysWide = Math.max(1, Math.floor(lotSize.w / bayWidth));
      const baysDeep = Math.max(1, Math.floor(lotSize.d / bayWidth));
      const buildingConfig = createBuildingConfig({
        ...base,
        id,
        seed: `${seed}:${index}`,
        center,
        floors,
        baysWide: base.baysWide ?? baysWide,
        baysDeep: base.baysDeep ?? baysDeep,
        bayWidth,
      });
      lots.push({ id, center, footprint: lotSize, quarterTurns: 0, config: buildingConfig });
    }
  }
  return lots;
}

/** @internal */
export function generateBuildingDistrict(config: BuildingGridConfig): GeneratedBuilding[] {
  return createBuildingGrid(config).map((lot) => generateBuilding(lot.config));
}
