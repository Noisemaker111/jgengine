import type { PlacementCommit } from "./placementController";
import type { AddStructureInput, StructureVec3 } from "./placedStructureStore";

/** World-space point shared by structure stores and editor markers. */
export type PlaceAssetVec3 = { x: number; y: number; z: number };

/**
 * Shared place-asset verb: one resolved payload for editor `place_asset` and in-game
 * build-mode commits. Convert with {@link toStructureInput} / {@link toEditorMarker}.
 * @capability place-asset resolve a placement commit into a shared asset placement payload
 */
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

/** Inputs to {@link resolvePlaceAsset}: asset id, pose, and optional catalog/known fields. */
export interface ResolvePlaceAssetInput {
  assetId: string;
  position: PlaceAssetVec3 | StructureVec3;
  kind?: string;
  label?: string;
  rotationY?: number;
  id?: string;
  color?: string;
  meta?: Readonly<Record<string, unknown>>;
  url?: string;
  knownKind?: string;
  knownLabel?: string;
  knownUrl?: string;
}

/** Optional catalog/label overrides for {@link placeAssetFromCommit}. */
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

/**
 * Resolve a place-asset intent into a shared payload (editor + games, one verb).
 * @capability place-asset resolve a placement commit into a shared asset placement payload
 */
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
  return {
    id: placementId(assetId, input.id),
    assetId,
    kind,
    label,
    position,
    rotationY: input.rotationY ?? 0,
    color: input.color ?? "#e2e8f0",
    meta,
  };
}

/**
 * Bridge a {@link PlacementCommit} into the shared place-asset verb.
 * @capability place-asset resolve a placement commit into a shared asset placement payload
 */
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

/** Game-state form: feed {@link createPlacedStructureStore}.add. */
export function toStructureInput(result: PlaceAssetResult): AddStructureInput {
  return {
    id: result.id,
    catalogId: result.assetId,
    position: [result.position.x, result.position.y, result.position.z],
    rotationY: result.rotationY,
    data: { ...result.meta, kind: result.kind, label: result.label, color: result.color },
  };
}

/** Scene-document form: feed editor `addMarker` / `place_asset` path. */
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
