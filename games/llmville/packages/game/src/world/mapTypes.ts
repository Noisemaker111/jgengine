import type { RoomBounds, WorldPoint, GridFootprint } from "@llmville/game/world/grid";
import type { CardinalDirection, CardinalLabel } from "@llmville/game/world/cardinal";

export interface WallSegmentSpec {
  args: [number, number, number];
  position: [number, number, number];
}

export interface PlaceLandmarkDefinition {
  id: string;
  title: string;
  purpose?: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  visibility: "always" | "tutorial_only";
}

export interface DecorItemSpec {
  id?: string;
  modelKey?: string;
  modelId?: string;
  assetType?: "model" | "primitive";
  gridX?: number;
  gridZ?: number;
  footprint?: GridFootprint;
  type: "box" | "plane" | "cylinder" | "sphere" | "group" | "model";
  args?: number[];
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** Quarter-turn facing: 0=N, 1=E, 2=S, 3=W (toward tier door = N). */
  gridRotation?: CardinalDirection;
  /** Compass label — preferred over gridRotation in new maps. */
  facing?: CardinalLabel;
  scale?: [number, number, number] | number;
  color?: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  receiveShadow?: boolean;
  castShadow?: boolean;
  doubleSide?: boolean;
  children?: DecorItemSpec[];
}

export interface MaterialRegistryEntry {
  diffuse: string;
  normal?: string;
  roughness?: number;
  metalness?: number;
  color?: string;
  tileSize?: number;
}

export type MaterialRegistry = Record<string, MaterialRegistryEntry>;

export interface MapData {
  mapId: string;
  version: 1;
  grid?: {
    tileSize?: number;
    floorTilesX?: number;
    floorTilesZ?: number;
    tilesX?: number;
    tilesZ?: number;
    originX?: number;
    originZ?: number;
    wallThicknessTiles?: number;
  };
  environment: {
    wallHeight: number;
    wallThickness: number;
    floor: {
      width: number;
      depth: number;
      centerX: number;
      centerZ: number;
    };
    floorMaterial: string;
    wallMaterial: string;
    ceilingColor: string;
    floorRepeat?: [number, number];
    wallColor: string;
    /** Optional base GLB for the entire static room geometry (walls, floor, fixed large props).
     *  Positioned at floor center. Use this for properly authored scenes instead of pure primitives + procedural walls.
     *  Decor items are still placed on top for dynamic/interactable stuff.
     */
    baseModel?: string;
  };
  walls: WallSegmentSpec[];
  colliders: RoomBounds[];
  decorColliders?: RoomBounds[];
  decor: DecorItemSpec[];
  landmarks: PlaceLandmarkDefinition[];
  decorFixtures?: Record<string, WorldPoint>;
  frontDoorPosition: WorldPoint;
  dropoffPosition: WorldPoint;
}

