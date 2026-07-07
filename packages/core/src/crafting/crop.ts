import type { RecipeItem } from "./recipe";

export type SoilState = "untilled" | "tilled";

export interface CropDef {
  id: string;
  stages: readonly number[];
  regrowDays?: number;
  needsDailyWater?: boolean;
  harvest?: RecipeItem;
}

export interface CropTileState {
  soil: SoilState;
  watered: boolean;
  cropId: string | null;
  stage: number;
  stageProgress: number;
  harvestable: boolean;
}

export type CropCatalog = (cropId: string) => CropDef | null;

export function emptyTile(): CropTileState {
  return { soil: "untilled", watered: false, cropId: null, stage: 0, stageProgress: 0, harvestable: false };
}

export function canTill(state: CropTileState): boolean {
  return state.soil === "untilled" && state.cropId === null;
}

export function tillTile(state: CropTileState): CropTileState {
  if (!canTill(state)) return state;
  return { ...state, soil: "tilled" };
}

export function canPlant(state: CropTileState): boolean {
  return state.soil === "tilled" && state.cropId === null;
}

export function plantCrop(state: CropTileState, cropId: string): CropTileState {
  if (!canPlant(state)) return state;
  return { ...state, cropId, stage: 0, stageProgress: 0, harvestable: false };
}

export function waterTile(state: CropTileState): CropTileState {
  if (state.soil !== "tilled" || state.watered) return state;
  return { ...state, watered: true };
}

export function maturityDays(def: CropDef): number {
  return def.stages.reduce((sum, days) => sum + Math.max(0, days), 0);
}

export function advanceCropDay(def: CropDef, state: CropTileState): CropTileState {
  const rested: CropTileState = state.watered ? { ...state, watered: false } : state;
  if (state.cropId === null) return rested;

  const needsWater = def.needsDailyWater !== false;
  if (needsWater && !state.watered) return rested;

  if (state.stage < def.stages.length) {
    const threshold = Math.max(1, def.stages[state.stage] ?? 1);
    const stageProgress = state.stageProgress + 1;
    if (stageProgress < threshold) return { ...rested, stageProgress };
    const stage = state.stage + 1;
    const harvestable = stage >= def.stages.length;
    return { ...rested, stage, stageProgress: 0, harvestable };
  }

  if (!state.harvestable && def.regrowDays !== undefined && def.regrowDays > 0) {
    const stageProgress = state.stageProgress + 1;
    if (stageProgress < def.regrowDays) return { ...rested, stageProgress };
    return { ...rested, stageProgress: 0, harvestable: true };
  }

  return rested;
}

export interface HarvestResult {
  state: CropTileState;
  yield: RecipeItem | null;
}

export function harvestCrop(def: CropDef, state: CropTileState): HarvestResult {
  if (!state.harvestable || state.cropId === null) return { state, yield: null };
  const produce = def.harvest ?? { itemId: state.cropId, count: 1 };
  if (def.regrowDays !== undefined && def.regrowDays > 0) {
    return {
      state: { ...state, harvestable: false, stageProgress: 0, stage: def.stages.length },
      yield: produce,
    };
  }
  return {
    state: { ...state, soil: "tilled", cropId: null, stage: 0, stageProgress: 0, harvestable: false },
    yield: produce,
  };
}

export type TileCoord = readonly [number, number];
export type TilePattern = readonly TileCoord[];

export function tileKey(coord: TileCoord): string {
  return `${coord[0]},${coord[1]}`;
}

export function singleTile(): TilePattern {
  return [[0, 0]];
}

export function squarePattern(radius: number): TilePattern {
  const r = Math.max(0, Math.floor(radius));
  const tiles: TileCoord[] = [];
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) tiles.push([dx, dz]);
  return tiles;
}

export function diamondPattern(radius: number): TilePattern {
  const r = Math.max(0, Math.floor(radius));
  const tiles: TileCoord[] = [];
  for (let dx = -r; dx <= r; dx++)
    for (let dz = -r; dz <= r; dz++) if (Math.abs(dx) + Math.abs(dz) <= r) tiles.push([dx, dz]);
  return tiles;
}

export function rectPattern(width: number, depth: number): TilePattern {
  const w = Math.max(1, Math.floor(width));
  const d = Math.max(1, Math.floor(depth));
  const x0 = -Math.floor((w - 1) / 2);
  const z0 = -Math.floor((d - 1) / 2);
  const tiles: TileCoord[] = [];
  for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++) tiles.push([x0 + dx, z0 + dz]);
  return tiles;
}

export function patternAt(center: TileCoord, pattern: TilePattern): TileCoord[] {
  return pattern.map(([dx, dz]) => [center[0] + dx, center[1] + dz] as TileCoord);
}

export interface ApplyToolResult {
  tiles: Map<string, CropTileState>;
  changed: TileCoord[];
}

export function applyToolToTiles(
  tiles: ReadonlyMap<string, CropTileState>,
  center: TileCoord,
  pattern: TilePattern,
  apply: (state: CropTileState, coord: TileCoord) => CropTileState,
  fill: () => CropTileState = emptyTile,
): ApplyToolResult {
  const next = new Map(tiles);
  const changed: TileCoord[] = [];
  for (const coord of patternAt(center, pattern)) {
    const key = tileKey(coord);
    const before = next.get(key) ?? fill();
    const after = apply(before, coord);
    if (after !== before) {
      next.set(key, after);
      changed.push(coord);
    }
  }
  return { tiles: next, changed };
}

export interface DayTicker {
  tick(currentDay: number): number;
  day(): number;
}

export function createDayTicker(startDay = 0): DayTicker {
  let last = Math.floor(startDay);
  return {
    tick(currentDay) {
      const now = Math.floor(currentDay);
      const crossed = Math.max(0, now - last);
      last = now;
      return crossed;
    },
    day: () => last,
  };
}

export interface CropField {
  get(coord: TileCoord): CropTileState;
  till(coord: TileCoord, pattern?: TilePattern): TileCoord[];
  plant(coord: TileCoord, cropId: string): boolean;
  water(coord: TileCoord, pattern?: TilePattern): TileCoord[];
  harvest(coord: TileCoord): RecipeItem | null;
  advanceDay(days?: number): void;
  tiles(): ReadonlyMap<string, CropTileState>;
}

export function createCropField(catalog: CropCatalog = () => null): CropField {
  let grid = new Map<string, CropTileState>();

  function read(coord: TileCoord): CropTileState {
    return grid.get(tileKey(coord)) ?? emptyTile();
  }

  return {
    get: read,
    till(coord, pattern = singleTile()) {
      const result = applyToolToTiles(grid, coord, pattern, tillTile);
      grid = result.tiles;
      return result.changed;
    },
    plant(coord, cropId) {
      const before = read(coord);
      const after = plantCrop(before, cropId);
      if (after === before) return false;
      grid.set(tileKey(coord), after);
      return true;
    },
    water(coord, pattern = singleTile()) {
      const result = applyToolToTiles(grid, coord, pattern, waterTile);
      grid = result.tiles;
      return result.changed;
    },
    harvest(coord) {
      const state = read(coord);
      if (state.cropId === null) return null;
      const def = catalog(state.cropId);
      if (def === null) return null;
      const result = harvestCrop(def, state);
      grid.set(tileKey(coord), result.state);
      return result.yield;
    },
    advanceDay(days = 1) {
      for (let i = 0; i < days; i++) {
        for (const [key, state] of grid) {
          if (state.cropId === null) {
            if (state.watered) grid.set(key, { ...state, watered: false });
            continue;
          }
          const def = catalog(state.cropId);
          grid.set(key, def === null ? state : advanceCropDay(def, state));
        }
      }
    },
    tiles: () => grid,
  };
}
