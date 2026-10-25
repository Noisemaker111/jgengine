import type { GridFootprint } from "@llmville/game/world/grid";
import { TILE_SIZE } from "@llmville/game/world/grid";
import {
  type CardinalDirection,
  cardinalToRotationY,
  CARDINAL,
} from "@llmville/game/world/cardinal";

/** Which axis the raw GLB mesh considers "forward" before engine correction. */
export type SourceForwardAxis = "+Z" | "-Z" | "+X" | "-X";

export type AssetAnchor =
  /** Footprint center on the floor at Y=0. Default for most props. */
  | "floor-center"
  /** Center of the front footprint edge — good for vehicles parked nose-out. */
  | "floor-front-center";

export interface AssetBoundsMeters {
  width: number;
  height: number;
  depth: number;
}

export interface AssetFrame {
  /** Raw mesh forward axis before correction. Defaults to +Z (North). */
  sourceForward?: SourceForwardAxis;
  /** Where the placement point sits on the asset. */
  anchor?: AssetAnchor;
  /** Uniformly scale mesh to fit catalog footprint using measured GLB size. */
  fitFootprint?: boolean;
  /** Extra Euler correction (radians XYZ) applied after sourceForward. */
  correction?: [number, number, number];
  /** Local offset from the placement anchor (meters). */
  offset?: [number, number, number];
  /** Multiplier applied after footprint fitting. */
  scale?: number | [number, number, number];
}

export interface MeasuredAssetExtents extends AssetBoundsMeters {
  center?: [number, number, number];
  minY?: number;
}

export interface AssetTransformInput {
  frame?: AssetFrame;
  footprint?: GridFootprint;
  placementDirection?: CardinalDirection;
  /** Measured from loaded GLB — preferred for fitFootprint. */
  measuredExtents?: MeasuredAssetExtents;
  instanceRotation?: [number, number, number];
  instanceScale?: number | [number, number, number];
  instancePosition?: [number, number, number];
  /** @deprecated Use frame.correction */
  baseRotation?: [number, number, number];
  /** @deprecated Use frame.offset */
  basePosition?: [number, number, number];
  /** @deprecated Use frame.scale */
  baseScale?: number | [number, number, number];
  /** @deprecated Use frame.scale */
  defaultScale?: [number, number, number] | number;
}

export interface ResolvedAssetTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface ModelWorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

const ZERO_ROTATION: [number, number, number] = [0, 0, 0];
const UNIT_SCALE: [number, number, number] = [1, 1, 1];
const ZERO_POSITION: [number, number, number] = [0, 0, 0];

const SOURCE_FORWARD_Y: Record<SourceForwardAxis, number> = {
  "+Z": 0,
  "-Z": Math.PI,
  "+X": -Math.PI / 2,
  "-X": Math.PI / 2,
};

export const MAX_FOOTPRINT_FIT_SCALE = 5;
export const MIN_FOOTPRINT_FIT_SCALE = 0.05;

export function normalizeScaleVec(scale?: number | [number, number, number]): [number, number, number] {
  if (scale === undefined) return UNIT_SCALE;
  if (typeof scale === "number") return [scale, scale, scale];
  return scale;
}

/** Map mesh X/Z extents to footprint width/depth given raw forward axis. */
export function meshExtentsToFootprintAxes(
  extents: AssetBoundsMeters,
  sourceForward: SourceForwardAxis,
): { width: number; depth: number } {
  if (sourceForward === "+X" || sourceForward === "-X") {
    return { width: extents.depth, depth: extents.width };
  }
  return { width: extents.width, depth: extents.depth };
}

export function clampFootprintFitScale(scale: number): number {
  return Math.min(Math.max(scale, MIN_FOOTPRINT_FIT_SCALE), MAX_FOOTPRINT_FIT_SCALE);
}

function addVec3(
  left: [number, number, number],
  right: [number, number, number],
): [number, number, number] {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function multiplyVec3(
  left: [number, number, number],
  right: [number, number, number],
): [number, number, number] {
  return [left[0] * right[0], left[1] * right[1], left[2] * right[2]];
}

function anchorOffset(
  anchor: AssetAnchor | undefined,
  footprint: GridFootprint | undefined,
  direction: CardinalDirection,
): [number, number, number] {
  if (anchor !== "floor-front-center" || !footprint) {
    return ZERO_POSITION;
  }

  const halfDepth = (footprint.depth * TILE_SIZE) / 2;
  const rotationY = cardinalToRotationY(direction);
  const localZ = -halfDepth;
  const worldX = -Math.sin(rotationY) * localZ;
  const worldZ = Math.cos(rotationY) * localZ;
  return [worldX, 0, worldZ];
}

function floorCenterMeshOffset(
  measured: MeasuredAssetExtents,
  scale: [number, number, number],
): [number, number, number] {
  if (!measured.center || measured.minY === undefined) {
    return ZERO_POSITION;
  }
  return [
    -measured.center[0] * scale[0],
    -measured.minY * scale[1],
    -measured.center[2] * scale[2],
  ];
}

function computeFootprintFitScale(
  measuredExtents: AssetBoundsMeters,
  footprint: GridFootprint,
  sourceForward: SourceForwardAxis = "+Z",
): number {
  const axes = meshExtentsToFootprintAxes(measuredExtents, sourceForward);
  const targetWidth = footprint.width * TILE_SIZE;
  const targetDepth = footprint.depth * TILE_SIZE;
  const scaleX = targetWidth / Math.max(axes.width, 0.001);
  const scaleZ = targetDepth / Math.max(axes.depth, 0.001);
  return clampFootprintFitScale(Math.min(scaleX, scaleZ));
}

export function resolveAssetTransform(input: AssetTransformInput): ResolvedAssetTransform {
  const frame = input.frame;
  const direction = input.placementDirection ?? CARDINAL.N;

  const sourceForward = frame?.sourceForward ?? "+Z";
  const sourceY = SOURCE_FORWARD_Y[sourceForward];

  const placementY = cardinalToRotationY(direction);
  const instanceRotation = input.instanceRotation ?? ZERO_ROTATION;

  const legacyCorrection = input.baseRotation ?? ZERO_ROTATION;
  const frameCorrection = frame?.correction ?? ZERO_ROTATION;

  const rotation: [number, number, number] = [
    instanceRotation[0] + frameCorrection[0] + legacyCorrection[0],
    instanceRotation[1] + sourceY + placementY + frameCorrection[1] + legacyCorrection[1],
    instanceRotation[2] + frameCorrection[2] + legacyCorrection[2],
  ];

  const legacyOffset = input.basePosition ?? ZERO_POSITION;
  const frameOffset = frame?.offset ?? ZERO_POSITION;
  const anchor = anchorOffset(frame?.anchor ?? "floor-center", input.footprint, direction);

  let scale = UNIT_SCALE;
  if (input.footprint && input.measuredExtents) {
    const fit = computeFootprintFitScale(
      input.measuredExtents,
      input.footprint,
      sourceForward,
    );
    scale = [fit, fit, fit];
  }

  const frameScale = frame?.scale ?? input.defaultScale ?? input.baseScale;
  scale = multiplyVec3(scale, normalizeScaleVec(frameScale));
  scale = multiplyVec3(scale, normalizeScaleVec(input.instanceScale));

  const meshAnchor = (frame?.anchor ?? "floor-center") === "floor-center" && input.measuredExtents
    ? floorCenterMeshOffset(input.measuredExtents, scale)
    : ZERO_POSITION;

  const position = addVec3(
    addVec3(addVec3(input.instancePosition ?? ZERO_POSITION, frameOffset), legacyOffset),
    addVec3(anchor, meshAnchor),
  );

  return { position, rotation, scale };
}

function rotateEulerXyz(
  rotation: [number, number, number],
  point: [number, number, number],
): [number, number, number] {
  const [x, y, z] = rotation;
  const c1 = Math.cos(x);
  const s1 = Math.sin(x);
  const c2 = Math.cos(y);
  const s2 = Math.sin(y);
  const c3 = Math.cos(z);
  const s3 = Math.sin(z);

  const m00 = c2 * c3;
  const m01 = -c2 * s3;
  const m02 = s2;
  const m10 = c1 * s3 + c3 * s1 * s2;
  const m11 = c1 * c3 - s1 * s2 * s3;
  const m12 = -c2 * s1;
  const m20 = s1 * s3 - c1 * c3 * s2;
  const m21 = c3 * s1 + c1 * s2 * s3;
  const m22 = c1 * c2;

  const [px, py, pz] = point;
  return [
    m00 * px + m01 * py + m02 * pz,
    m10 * px + m11 * py + m12 * pz,
    m20 * px + m21 * py + m22 * pz,
  ];
}

function localAabbCorners(measured: MeasuredAssetExtents): [number, number, number][] {
  const center = measured.center ?? [0, measured.height / 2, 0];
  const minY = measured.minY ?? center[1] - measured.height / 2;
  const halfWidth = measured.width / 2;
  const halfDepth = measured.depth / 2;
  const maxY = minY + measured.height;

  const minX = center[0] - halfWidth;
  const maxX = center[0] + halfWidth;
  const minZ = center[2] - halfDepth;
  const maxZ = center[2] + halfDepth;

  return [
    [minX, minY, minZ],
    [minX, minY, maxZ],
    [minX, maxY, minZ],
    [minX, maxY, maxZ],
    [maxX, minY, minZ],
    [maxX, minY, maxZ],
    [maxX, maxY, minZ],
    [maxX, maxY, maxZ],
  ];
}

/** World-space bounds for a model using the same transform rules as SceneModel. */
export function resolveModelWorldBounds(input: AssetTransformInput): ModelWorldBounds | null {
  if (!input.measuredExtents) return null;

  const transform = resolveAssetTransform(input);
  const measured = input.measuredExtents;
  const corners = localAabbCorners(measured);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const corner of corners) {
    const scaled: [number, number, number] = [
      corner[0] * transform.scale[0],
      corner[1] * transform.scale[1],
      corner[2] * transform.scale[2],
    ];
    const rotated = rotateEulerXyz(transform.rotation, scaled);
    const world: [number, number, number] = [
      transform.position[0] + rotated[0],
      transform.position[1] + rotated[1],
      transform.position[2] + rotated[2],
    ];

    minX = Math.min(minX, world[0]);
    maxX = Math.max(maxX, world[0]);
    minY = Math.min(minY, world[1]);
    maxY = Math.max(maxY, world[1]);
    minZ = Math.min(minZ, world[2]);
    maxZ = Math.max(maxZ, world[2]);
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
}