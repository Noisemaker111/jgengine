/**
 * Builder document primitives.
 *
 * The builder edits a `MapData` document. A selection points into that
 * document by stable decor id or wall index. Everything here is pure and
 * app-agnostic so the builder core can run outside LLMville.
 */
import type { MapData } from "@llmville/game/world/mapTypes";
import { wallSegmentsToColliders } from "@llmville/game/world/bounds";
import { createMapGridSpec, TILE_SIZE, type MapGridSpec } from "@llmville/game/world/grid";

export type BuilderSelectionRef =
  | { kind: "decor"; id: string }
  | { kind: "wall"; index: number };

export function cloneSpec<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Round to 1mm so exported documents stay diff-friendly. */
export function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function isSameSelectionRef(left: BuilderSelectionRef | null, right: BuilderSelectionRef | null): boolean {
  if (!left || !right) return left === right;
  if (left.kind !== right.kind) return false;
  return left.kind === "decor"
    ? left.id === (right as { kind: "decor"; id: string }).id
    : left.index === (right as { kind: "wall"; index: number }).index;
}

export function hasSelectionRef(refs: readonly BuilderSelectionRef[], ref: BuilderSelectionRef): boolean {
  return refs.some((candidate) => isSameSelectionRef(candidate, ref));
}

export function selectionWithoutRef(refs: readonly BuilderSelectionRef[], ref: BuilderSelectionRef): BuilderSelectionRef[] {
  return refs.filter((candidate) => !isSameSelectionRef(candidate, ref));
}

export interface SplitSelectionRefs {
  decorIds: Set<string>;
  wallIndexes: Set<number>;
}

/** Split a mixed selection into decor-id and wall-index lookups. */
export function splitSelectionRefs(refs: readonly BuilderSelectionRef[]): SplitSelectionRefs {
  const decorIds = new Set<string>();
  const wallIndexes = new Set<number>();
  for (const ref of refs) {
    if (ref.kind === "decor") decorIds.add(ref.id);
    else wallIndexes.add(ref.index);
  }
  return { decorIds, wallIndexes };
}

export function findDecorIndexById(mapData: MapData, id: string): number {
  return mapData.decor.findIndex((item) => item.id === id);
}

export function isSelectionRefPresent(mapData: MapData, ref: BuilderSelectionRef): boolean {
  return ref.kind === "decor"
    ? findDecorIndexById(mapData, ref.id) >= 0
    : ref.index >= 0 && ref.index < mapData.walls.length;
}

export function nextUniqueDecorId(mapData: MapData, base: string): string {
  const used = new Set(mapData.decor.map((item) => item.id).filter((id): id is string => id !== undefined));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

export function ensureTopLevelDecorIds(mapData: MapData): MapData {
  let nextId = 1;
  const used = new Set<string>();
  return {
    ...mapData,
    decor: mapData.decor.map((item) => {
      if (item.id && !used.has(item.id)) {
        used.add(item.id);
        return item;
      }
      while (used.has(`decor_${nextId}`)) nextId += 1;
      const id = `decor_${nextId}`;
      used.add(id);
      nextId += 1;
      return { ...item, id };
    }),
  };
}

/** Re-derive everything a raw edit can invalidate: decor ids and wall colliders. */
export function normalizeBuilderMapData(mapData: MapData): MapData {
  const withIds = ensureTopLevelDecorIds(mapData);
  return {
    ...withIds,
    colliders: wallSegmentsToColliders(withIds.walls),
  };
}

function nearlyInteger(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 0.001;
}

function deriveLegacyTileSize(map: MapData): number {
  const areIntegerSized =
    nearlyInteger(map.environment.floor.width) && nearlyInteger(map.environment.floor.depth);
  return areIntegerSized ? 1 : TILE_SIZE;
}

export function getMapGrid(map: MapData): MapGridSpec {
  const explicitGrid = map.grid;
  const tileSize = explicitGrid?.tileSize ?? deriveLegacyTileSize(map);
  const tilesX = explicitGrid?.tilesX
    ?? explicitGrid?.floorTilesX
    ?? Math.max(1, Math.round(map.environment.floor.width / tileSize));
  const tilesZ = explicitGrid?.tilesZ
    ?? explicitGrid?.floorTilesZ
    ?? Math.max(1, Math.round(map.environment.floor.depth / tileSize));
  return createMapGridSpec({
    tileSize,
    tilesX,
    tilesZ,
    originX: explicitGrid?.originX ?? map.environment.floor.centerX,
    originZ: explicitGrid?.originZ ?? map.environment.floor.centerZ,
    wallThicknessTiles: explicitGrid?.wallThicknessTiles ?? Math.max(1, Math.round(map.environment.wallThickness / tileSize)),
  });
}
