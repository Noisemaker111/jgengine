/**
 * Room authoring DSL over `MapData` — used by the 3D builder shell.
 *
 * One grid (1 cell = 1 meter, integer `gridX`/`gridZ`), one material registry
 * (referenced by key), one map format (`MapData`):
 *
 *   createRoom({ mapId: "demo", width: 8, depth: 7, ... })
 *     .placePerimeterWalls()
 *     .placeProp({ id: "garage_car", modelKey: "garage_car", gridX: 2, gridZ: 1, facing: "N", footprint: { width: 3, depth: 5 } })
 *     .setFrontDoor({ x: 0, z: 3 })
 *     .build();
 *
 * Placement supports grid-cell coordinates (preferred for new content) AND a
 * raw `position`/`args` escape hatch (to reproduce legacy hand-tuned geometry
 * and special cases). Colliders are derived from walls by the loader, so the
 * builder never authors them.
 */

import { type CardinalLabel } from "@llmville/game/world/cardinal";
import { TILE_SIZE, type GridFootprint, type WorldPoint } from "@llmville/game/world/grid";
import type {
  DecorItemSpec,
  PlaceLandmarkDefinition,
  MapData,
  WallSegmentSpec,
} from "@llmville/game/world/mapTypes";

export interface RoomOptions {
  mapId: string;
  /** Floor width in meters. */
  width: number;
  /** Floor depth in meters. */
  depth: number;
  wallHeight: number;
  wallThickness: number;
  floorMaterial: string;
  wallMaterial: string;
  ceilingColor: string;
  wallColor: string;
  floorRepeat?: [number, number];
  /** Floor center in world meters; defaults to origin. */
  centerX?: number;
  centerZ?: number;
  /** Optional authored room GLB (walls/floor/fixed props). When set, procedural walls/floor/ceiling are skipped by the renderer. */
  baseModel?: string;
  /** Tile size in meters; defaults to 1. */
  tileSize?: number;
}

export interface PlaceWallRunOptions {
  /** Start cell (inclusive). */
  from: WorldPoint;
  /** End cell (inclusive). */
  to: WorldPoint;
  wallHeight?: number;
  wallThickness?: number;
  /** Y center of the wall; defaults to wallHeight / 2. */
  centerY?: number;
}

export interface PlacePropOptions {
  id?: string;
  modelKey: string;
  modelId?: string;
  gridX: number;
  gridZ: number;
  facing?: CardinalLabel;
  footprint?: GridFootprint;
  /** Y offset in meters; defaults to 0. */
  y?: number;
  scale?: DecorItemSpec["scale"];
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export interface PlacePrimitiveOptions extends Partial<Omit<DecorItemSpec, "type">> {
  type: DecorItemSpec["type"];
}

export interface WorldBuilder {
  /** Append a raw wall segment (full control over args + position). */
  placeWall(wall: WallSegmentSpec): WorldBuilder;
  /** Append a straight wall run between two points along one axis. */
  placeWallRun(options: PlaceWallRunOptions): WorldBuilder;
  /** Derive and append the four perimeter walls from the room floor + wall thickness. */
  placePerimeterWalls(): WorldBuilder;
  /** Append a decor item verbatim (full DecorItemSpec — grid or raw position). */
  placeObject(item: DecorItemSpec): WorldBuilder;
  /** Append a grid-placed model prop (the common case for furniture/props). */
  placeProp(options: PlacePropOptions): WorldBuilder;
  /** Append a primitive decor item (box/plane/cylinder/sphere/group) with full control. */
  placePrimitive(options: PlacePrimitiveOptions): WorldBuilder;
  setFrontDoor(position: WorldPoint): WorldBuilder;
  setDropoff(position: WorldPoint): WorldBuilder;
  addLandmark(landmark: PlaceLandmarkDefinition): WorldBuilder;
  build(): MapData;
}

export function createRoom(options: RoomOptions): WorldBuilder {
  const tileSize = options.tileSize ?? TILE_SIZE;
  const centerX = options.centerX ?? 0;
  const centerZ = options.centerZ ?? 0;
  const tilesX = Math.max(1, Math.round(options.width / tileSize));
  const tilesZ = Math.max(1, Math.round(options.depth / tileSize));
  const wallThicknessTiles = Math.max(1, Math.round(options.wallThickness / tileSize));

  const walls: WallSegmentSpec[] = [];
  const decor: DecorItemSpec[] = [];
  const landmarks: PlaceLandmarkDefinition[] = [];
  let frontDoorPosition: WorldPoint = { x: centerX, z: centerZ + tilesZ / 2 - 0.5 };
  let dropoffPosition: WorldPoint = { x: centerX - 1, z: centerZ + tilesZ / 2 - 0.5 };

  const self: WorldBuilder = {
    placeWall(wall) {
      walls.push(wall);
      return self;
    },
    placeWallRun({ from, to, wallHeight = options.wallHeight, wallThickness = options.wallThickness, centerY }) {
      walls.push(wallRunToSegment(from, to, wallHeight, wallThickness, centerY ?? wallHeight / 2));
      return self;
    },
    placePerimeterWalls() {
      for (const wall of perimeterWalls(options.width, options.depth, options.wallHeight, options.wallThickness, centerX, centerZ)) {
        walls.push(wall);
      }
      return self;
    },
    placeObject(item) {
      decor.push(item);
      return self;
    },
    placeProp(opts) {
      decor.push(propToDecor(opts));
      return self;
    },
    placePrimitive(opts) {
      decor.push(opts as DecorItemSpec);
      return self;
    },
    setFrontDoor(position) {
      frontDoorPosition = position;
      return self;
    },
    setDropoff(position) {
      dropoffPosition = position;
      return self;
    },
    addLandmark(landmark) {
      landmarks.push(landmark);
      return self;
    },
    build(): MapData {
      return {
        mapId: options.mapId,
        version: 1,
        grid: {
          tileSize,
          tilesX,
          tilesZ,
          originX: centerX,
          originZ: centerZ,
          wallThicknessTiles,
        },
        environment: {
          wallHeight: options.wallHeight,
          wallThickness: options.wallThickness,
          floor: {
            width: options.width,
            depth: options.depth,
            centerX,
            centerZ,
          },
          floorMaterial: options.floorMaterial,
          wallMaterial: options.wallMaterial,
          ceilingColor: options.ceilingColor,
          wallColor: options.wallColor,
          ...(options.floorRepeat !== undefined ? { floorRepeat: options.floorRepeat } : {}),
          ...(options.baseModel !== undefined ? { baseModel: options.baseModel } : {}),
        },
        walls,
        colliders: [],
        decor,
        landmarks,
        frontDoorPosition,
        dropoffPosition,
      };
    },
  };

  return self;
}

/**
 * Four perimeter walls around a `width` x `depth` floor. Walls sit on the floor
 * edge with the given thickness, centered at Y = wallHeight / 2.
 */
export function perimeterWalls(
  width: number,
  depth: number,
  wallHeight: number,
  wallThickness: number,
  centerX: number,
  centerZ: number,
): readonly WallSegmentSpec[] {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const y = wallHeight / 2;
  return [
    { args: [width, wallHeight, wallThickness], position: [centerX, y, centerZ - halfDepth] },
    { args: [width, wallHeight, wallThickness], position: [centerX, y, centerZ + halfDepth] },
    { args: [wallThickness, wallHeight, depth], position: [centerX - halfWidth, y, centerZ] },
    { args: [wallThickness, wallHeight, depth], position: [centerX + halfWidth, y, centerZ] },
  ];
}

/** Build a wall segment between two points on the same axis (X-major or Z-major). */
export function wallRunToSegment(
  from: WorldPoint,
  to: WorldPoint,
  wallHeight: number,
  wallThickness: number,
  centerY: number,
): WallSegmentSpec {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx !== 0 && dz !== 0) {
    throw new Error(`placeWallRun must be axis-aligned: from ${JSON.stringify(from)} to ${JSON.stringify(to)}`);
  }
  const midX = (from.x + to.x) / 2;
  const midZ = (from.z + to.z) / 2;
  const length = Math.abs(dx) + Math.abs(dz) + wallThickness;
  const isXMajor = dx !== 0;
  const args: [number, number, number] = isXMajor
    ? [length, wallHeight, wallThickness]
    : [wallThickness, wallHeight, length];
  return { args, position: [midX, centerY, midZ] };
}

function propToDecor(opts: PlacePropOptions): DecorItemSpec {
  return {
    type: "model",
    ...(opts.id !== undefined ? { id: opts.id } : {}),
    modelKey: opts.modelKey,
    ...(opts.modelId !== undefined ? { modelId: opts.modelId } : {}),
    gridX: opts.gridX,
    gridZ: opts.gridZ,
    ...(opts.facing !== undefined ? { facing: opts.facing } : {}),
    ...(opts.footprint !== undefined ? { footprint: opts.footprint } : {}),
    ...(opts.y !== undefined ? { position: [0, opts.y, 0] } : {}),
    ...(opts.scale !== undefined ? { scale: opts.scale } : {}),
    ...(opts.castShadow !== undefined ? { castShadow: opts.castShadow } : {}),
    ...(opts.receiveShadow !== undefined ? { receiveShadow: opts.receiveShadow } : {}),
  };
}
