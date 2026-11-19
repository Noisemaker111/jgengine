import { applyRotationPolicy, resolveFacingRotationY, type AssetSpace } from "../scene/assetSpace";
import type { PlacementCommit } from "./placementController";
import type { AddStructureInput, StructureVec3 } from "./placedStructureStore";

/** World-space point shared by structure stores and editor markers. */
export type PlaceAssetVec3 = { x: number; y: number; z: number };

/** @capability place-asset resolve a placement commit into a shared asset placement payload */
export interface PlaceAssetResult {
  id: string;
  assetId: string;
  kind: string;
  label: string;
  position: PlaceAssetVec3;
  rotationY: number;
  color: string;
  meta: Readonly<Record<string, unknown>>;
}

export interface ResolvePlaceAssetInput {
  assetId: string;
  position: PlaceAssetVec3 | StructureVec3;
  kind?: string | undefined;
  label?: string;
  rotationY?: number;
  /**
   * Placement heading in degrees (engine north = `0`, clockwise). When set it takes precedence over
   * `rotationY`: the resolved `rotationY` runs through `space.rotation` (the asset's rotation policy)
   * and `space.forwardDegrees` (canonical facing), so the catalog owns the correction instead of games.
   */
  headingDegrees?: number;
  space?: AssetSpace;
  id?: string;
  color?: string;
  meta?: Readonly<Record<string, unknown>>;
  url?: string;
  knownKind?: string | undefined;
  knownLabel?: string | undefined;
  knownUrl?: string | undefined;
}

export interface PlaceAssetFromCommitOptions {
  kind?: string;
  label?: string;
  id?: string;
  color?: string;
  meta?: Readonly<Record<string, unknown>>;
  url?: string;
  knownKind?: string;
  knownLabel?: string;
  knownUrl?: string;
}

function normalizePosition(position: PlaceAssetVec3 | StructureVec3): PlaceAssetVec3 {
  if (typeof (position as PlaceAssetVec3).x === "number") {
    const p = position as PlaceAssetVec3;
    return { x: p.x, y: p.y, z: p.z };
  }
  const t = position as StructureVec3;
  return { x: t[0], y: t[1], z: t[2] };
}

let placementSequence = 0;

function placementId(assetId: string, explicit?: string): string {
  if (explicit !== undefined && explicit.length > 0) return explicit;
  placementSequence += 1;
  return `placed_${assetId}_${Date.now().toString(36)}_${placementSequence.toString(36)}`;
}

/** @capability place-asset resolve a placement commit into a shared asset placement payload */
export function resolvePlaceAsset(input: ResolvePlaceAssetInput): PlaceAssetResult {
  const position = normalizePosition(input.position);
  const assetId = input.assetId;
  const kind = input.kind ?? input.knownKind ?? "prop";
  const label = input.label ?? input.knownLabel ?? assetId;
  const url = input.url ?? input.knownUrl;
  const meta: Record<string, unknown> = {
    assetId,
    ...(url === undefined ? {} : { url }),
    ...(input.meta ?? {}),
  };
  const rotationY =
    input.headingDegrees === undefined
      ? (input.rotationY ?? 0)
      : resolveFacingRotationY(applyRotationPolicy(input.headingDegrees, input.space?.rotation), input.space);
  return {
    id: placementId(assetId, input.id),
    assetId,
    kind,
    label,
    position,
    rotationY,
    color: input.color ?? "#e2e8f0",
    meta,
  };
}

/** @capability place-asset resolve a placement commit into a shared asset placement payload */
export function placeAssetFromCommit(
  commit: PlacementCommit,
  assetId: string,
  options: PlaceAssetFromCommitOptions = {},
): PlaceAssetResult {
  return resolvePlaceAsset({
    assetId,
    position: [commit.center[0], commit.y, commit.center[1]],
    rotationY: commit.rotationY,
    ...options,
  });
}

export function toStructureInput(result: PlaceAssetResult): AddStructureInput {
  return {
    id: result.id,
    catalogId: result.assetId,
    position: [result.position.x, result.position.y, result.position.z],
    rotationY: result.rotationY,
    data: { ...result.meta, kind: result.kind, label: result.label, color: result.color },
  };
}

export function toEditorMarker(result: PlaceAssetResult): {
  id: string;
  kind: string;
  position: PlaceAssetVec3;
  rotationY: number;
  label: string;
  color: string;
  meta: Record<string, unknown>;
} {
  return {
    id: result.id,
    kind: result.kind,
    position: result.position,
    rotationY: result.rotationY,
    label: result.label,
    color: result.color,
    meta: { ...result.meta },
  };
}
