export interface WorldPoint {
  x: number;
  z: number;
}

export interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CircularCollider extends WorldPoint {
  radius: number;
}

export const TILE_SIZE = 1; // meters. 1 tile = 1m ≈ 3.28084 feet
export const FEET_PER_METER = 3.28084;
export const HUMAN_HEIGHT_FEET = 6;
export const HUMAN_HEIGHT_METERS = HUMAN_HEIGHT_FEET / FEET_PER_METER; // ~1.83m

export const PLAYER_COLLISION_RADIUS = 0.45;

export function isPointInBounds(point: WorldPoint, bounds: RoomBounds): boolean {
  return point.x >= bounds.minX
    && point.x <= bounds.maxX
    && point.z >= bounds.minZ
    && point.z <= bounds.maxZ;
}

export function clampPointToBounds(point: WorldPoint, bounds: RoomBounds): WorldPoint {
  return {
    x: Math.min(Math.max(point.x, bounds.minX), bounds.maxX),
    z: Math.min(Math.max(point.z, bounds.minZ), bounds.maxZ),
  };
}

export function squaredDistance2d(a: WorldPoint, b: WorldPoint): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

export function distance2d(a: WorldPoint, b: WorldPoint): number {
  return Math.sqrt(squaredDistance2d(a, b));
}

export interface MapGridSpec {
  tileSize: number;
  tilesX: number;
  tilesZ: number;
  originX: number;
  originZ: number;
  wallThicknessTiles: number;
}

export interface GridFootprint {
  width: number;
  depth: number;
}

export interface GridAnchor {
  gridX: number;
  gridZ: number;
}

export const DEFAULT_GRID_FOOTPRINT: GridFootprint = { width: 1, depth: 1 };

export function normalizeGridFootprint(footprint?: Partial<GridFootprint> | null): GridFootprint {
  const width = Math.max(1, Math.round(footprint?.width ?? DEFAULT_GRID_FOOTPRINT.width));
  const depth = Math.max(1, Math.round(footprint?.depth ?? DEFAULT_GRID_FOOTPRINT.depth));
  return { width, depth };
}

export function createMapGridSpec(grid?: Partial<MapGridSpec> | null): MapGridSpec {
  return {
    tileSize: grid?.tileSize ?? TILE_SIZE,
    tilesX: Math.max(1, Math.round(grid?.tilesX ?? 1)),
    tilesZ: Math.max(1, Math.round(grid?.tilesZ ?? 1)),
    originX: grid?.originX ?? 0,
    originZ: grid?.originZ ?? 0,
    wallThicknessTiles: Math.max(1, Math.round(grid?.wallThicknessTiles ?? 1)),
  };
}

export function getGridMinX(grid: MapGridSpec): number {
  return grid.originX - (grid.tilesX * grid.tileSize) / 2;
}

export function getGridMinZ(grid: MapGridSpec): number {
  return grid.originZ - (grid.tilesZ * grid.tileSize) / 2;
}

export function clampGridAnchor(
  grid: MapGridSpec,
  anchor: GridAnchor,
  footprint: GridFootprint,
): GridAnchor {
  const normalized = normalizeGridFootprint(footprint);
  return {
    gridX: Math.min(Math.max(anchor.gridX, 0), Math.max(0, grid.tilesX - normalized.width)),
    gridZ: Math.min(Math.max(anchor.gridZ, 0), Math.max(0, grid.tilesZ - normalized.depth)),
  };
}

export function gridAnchorToWorldPosition(
  grid: MapGridSpec,
  gridX: number,
  gridZ: number,
  footprint: GridFootprint,
): WorldPoint {
  const normalized = normalizeGridFootprint(footprint);
  const minX = getGridMinX(grid);
  const minZ = getGridMinZ(grid);
  return {
    x: minX + (gridX + normalized.width / 2) * grid.tileSize,
    z: minZ + (gridZ + normalized.depth / 2) * grid.tileSize,
  };
}

export function worldToGridAnchor(
  grid: MapGridSpec,
  x: number,
  z: number,
  footprint: GridFootprint,
): GridAnchor {
  const normalized = normalizeGridFootprint(footprint);
  const minX = getGridMinX(grid);
  const minZ = getGridMinZ(grid);
  return clampGridAnchor(
    grid,
    {
      gridX: Math.round((x - minX) / grid.tileSize - normalized.width / 2),
      gridZ: Math.round((z - minZ) / grid.tileSize - normalized.depth / 2),
    },
    normalized,
  );
}

export function snapWorldToGrid(
  grid: MapGridSpec,
  x: number,
  z: number,
  footprint: GridFootprint = DEFAULT_GRID_FOOTPRINT,
): { gridX: number; gridZ: number; worldX: number; worldZ: number } {
  const anchor = worldToGridAnchor(grid, x, z, footprint);
  const world = gridAnchorToWorldPosition(grid, anchor.gridX, anchor.gridZ, footprint);
  return { gridX: anchor.gridX, gridZ: anchor.gridZ, worldX: world.x, worldZ: world.z };
}

export function getFootprintWorldSize(grid: MapGridSpec, footprint: GridFootprint): { width: number; depth: number } {
  const normalized = normalizeGridFootprint(footprint);
  return {
    width: normalized.width * grid.tileSize,
    depth: normalized.depth * grid.tileSize,
  };
}

export function getCenteredFootprintBounds(
  grid: MapGridSpec,
  position: WorldPoint,
  footprint: GridFootprint,
): RoomBounds {
  const size = getFootprintWorldSize(grid, footprint);
  return {
    minX: position.x - size.width / 2,
    maxX: position.x + size.width / 2,
    minZ: position.z - size.depth / 2,
    maxZ: position.z + size.depth / 2,
  };
}

/** Convert meters to feet for human-friendly debug/UI. */
export function metersToFeet(meters: number): number {
  return meters * FEET_PER_METER;
}

/** Format size in feet for labels, e.g. "6.0 ft". */
export function formatFeet(meters: number, decimals = 1): string {
  return `${metersToFeet(meters).toFixed(decimals)} ft`;
}
