import { registerBuiltinSceneKinds } from "../scene/builtinSceneKinds";
import { getSceneKind, parseParams, type SceneKindObject } from "../scene/sceneKinds";
import type { WorldSolid, WorldSolids } from "./worldSolids";

type Vec3Like = { x: number; y: number; z: number };

/** Minimal editor document shape {@link resolveAuthoredSolids} walks; any `EditorDocument` satisfies it. */
export interface AuthoredSolidsDocumentLike {
  markers: readonly { id: string; kind: string; position: Vec3Like; rotationY?: number; meta?: Record<string, unknown> }[];
  volumes: readonly {
    id: string;
    kind: string;
    center: Vec3Like;
    halfExtents?: Vec3Like;
    radius?: number;
    meta?: Record<string, unknown>;
  }[];
  paths: readonly { id: string; kind: string; points: readonly Vec3Like[]; meta?: Record<string, unknown> }[];
}

/** Layer prefix `syncAuthoredSolids` owns in `ctx.world.solids`; one layer per document object. */
export const AUTHORED_SOLID_LAYER_PREFIX = "authored:";

function kindObjects(document: AuthoredSolidsDocumentLike): SceneKindObject[] {
  const objects: SceneKindObject[] = [];
  for (const marker of document.markers) {
    objects.push({
      id: marker.id,
      kind: marker.kind,
      position: marker.position,
      ...(marker.rotationY === undefined ? {} : { rotationY: marker.rotationY }),
      ...(marker.meta === undefined ? {} : { meta: marker.meta }),
    });
  }
  for (const volume of document.volumes) {
    objects.push({
      id: volume.id,
      kind: volume.kind,
      center: volume.center,
      ...(volume.halfExtents === undefined ? {} : { halfExtents: volume.halfExtents }),
      ...(volume.radius === undefined ? {} : { radius: volume.radius }),
      ...(volume.meta === undefined ? {} : { meta: volume.meta }),
    });
  }
  for (const path of document.paths) {
    objects.push({
      id: path.id,
      kind: path.kind,
      points: path.points,
      ...(path.meta === undefined ? {} : { meta: path.meta }),
    });
  }
  return objects;
}

/**
 * Solids for every document object whose scene kind declares `solids`, keyed by object id. Objects
 * whose kind has no `solids` hook, or whose hook returns none, are left out.
 * @capability authored-solids collision for studio-authored world content such as city volumes
 */
export function resolveAuthoredSolids(
  document: AuthoredSolidsDocumentLike,
  sampleHeight?: (x: number, z: number) => number,
): Map<string, readonly WorldSolid[]> {
  registerBuiltinSceneKinds();
  const out = new Map<string, readonly WorldSolid[]>();
  const objects = kindObjects(document);
  const context = { ...(sampleHeight === undefined ? {} : { sampleHeight }), objects };
  for (const object of objects) {
    const definition = getSceneKind(object.kind);
    if (definition?.solids === undefined || definition.resolve === undefined) continue;
    const params = parseParams(definition.schema, object.meta);
    const solids = definition.solids(definition.resolve(object, params, context), object, params, context);
    if (solids.length > 0) out.set(object.id, solids);
  }
  return out;
}

/**
 * Write a document's studio solids into `solids` (usually `ctx.world.solids`), one
 * `authored:<objectId>` layer per object, dropping authored layers the document no longer has.
 * Call again whenever the document changes.
 * @capability authored-solids collision for studio-authored world content such as city volumes
 */
export function syncAuthoredSolids(
  solids: WorldSolids,
  document: AuthoredSolidsDocumentLike,
  sampleHeight?: (x: number, z: number) => number,
): void {
  const resolved = resolveAuthoredSolids(document, sampleHeight);
  solids.batch(() => {
    for (const layer of solids.layers()) {
      if (!layer.startsWith(AUTHORED_SOLID_LAYER_PREFIX)) continue;
      if (!resolved.has(layer.slice(AUTHORED_SOLID_LAYER_PREFIX.length))) solids.remove(layer);
    }
    for (const [id, set] of resolved) solids.set(`${AUTHORED_SOLID_LAYER_PREFIX}${id}`, set);
  });
}
