import {
  applyEditorDocumentOverlay,
  createEmptyEditorDocument,
  editorDocumentExtras,
  extractEditorFragment,
  mergeEditorDocuments,
  type EditorDocumentDiagnostic,
} from "./document";
import type { EditorDocument } from "./types";

/**
 * A sharded **world**: a scene that is no longer one monolithic `editor.scene.json` but a manifest
 * plus spatially-partitioned shard documents. A single-file game is the degenerate one-shard case,
 * so nothing pays for scale it does not have. The shard/overlay documents are the exact
 * {@link EditorDocument} format loaders already consume — this module is composition over
 * `mergeEditorDocuments` / `extractEditorFragment` / `editorDocumentBounds`, not a new format.
 */

/** The manifest `kind` discriminator — a world folder's `world.json`. */
export const WORLD_MANIFEST_KIND = "world";

/** Whether a shard is always loaded (terrain, always-resident hero content) or streamed by proximity. */
export type WorldShardResidency = "always" | "streamed";

/** A shard's XZ world-space footprint, `[minX, minZ]`..`[maxX, maxZ]`, used to route/stream loads. */
export interface WorldShardBounds {
  min: [number, number];
  max: [number, number];
}

/** One entry in a world manifest: a shard document, its footprint, residency, and optional overlay. */
export interface WorldManifestShard {
  /** Stable shard id (also the merge/stream unit). */
  id: string;
  /** Path to the shard's `EditorDocument` JSON, relative to the world folder. */
  file: string;
  /** XZ footprint used to cull the shard against a streaming query; absent = always resident. */
  bounds?: WorldShardBounds;
  /** `"always"` keeps the shard resident regardless of the query; default `"streamed"` when bounded. */
  residency?: WorldShardResidency;
  /** Path to a sparse overlay document applied on top of this shard (hand-tweaks over materialized content). */
  overlay?: string;
}

/** The world grid the shards partition space on. */
export interface WorldGrid {
  /** Cell edge length in meters. */
  cellSize: number;
}

/** Proximity streaming radii, in meters. */
export interface WorldStreamingConfig {
  /** Load shards whose footprint is within this distance of the query center. */
  loadRadius: number;
  /** Keep already-loaded shards resident until they fall outside this (larger) distance — hysteresis. */
  keepRadius: number;
}

/** A world manifest — the `world.json` at the root of a world folder. */
export interface WorldManifest {
  kind: typeof WORLD_MANIFEST_KIND;
  /** Manifest schema version; defaults to 1 when absent. */
  version?: number;
  grid?: WorldGrid;
  shards: WorldManifestShard[];
  streaming?: WorldStreamingConfig;
}

/** A spatial query used to select which shards a neighborhood needs. */
export interface WorldQuery {
  /** Query center in world space (typically the camera/player position). */
  center: { x: number; z: number };
  /** Selection radius in meters; 0 (default) selects only shards whose footprint contains the center. */
  radius?: number;
}

/** Resolves a shard/overlay file path to a decoded document, or null when it cannot be read. */
export type WorldShardResolver = (file: string) => EditorDocument | null;

/** True when a shard is resident regardless of any spatial query (unbounded or explicitly `"always"`). */
function isAlwaysResident(shard: WorldManifestShard): boolean {
  return shard.residency === "always" || shard.bounds === undefined;
}

/** Closest-point disc↔AABB overlap test on the XZ plane. */
function discIntersectsBounds(cx: number, cz: number, radius: number, bounds: WorldShardBounds): boolean {
  const qx = Math.max(bounds.min[0], Math.min(cx, bounds.max[0]));
  const qz = Math.max(bounds.min[1], Math.min(cz, bounds.max[1]));
  const dx = cx - qx;
  const dz = cz - qz;
  return dx * dx + dz * dz <= radius * radius;
}

/**
 * True when a shard should be resident for a query: always-resident shards always, bounded shards
 * only when the query disc (`center` ± `radius`) overlaps their footprint.
 * @capability world-shards select shards for a neighborhood by spatial query
 */
export function shardMatchesQuery(shard: WorldManifestShard, query: WorldQuery): boolean {
  if (isAlwaysResident(shard)) return true;
  return discIntersectsBounds(query.center.x, query.center.z, query.radius ?? 0, shard.bounds!);
}

/**
 * The shards a query needs — always-resident shards plus every bounded shard whose footprint the
 * query disc overlaps, in manifest order. With no query every shard is selected (load the planet),
 * so a one-shard game and an unqueried load behave exactly as a monolithic document does today.
 * @capability world-shards select shards for a neighborhood by spatial query
 */
export function selectWorldShards(manifest: WorldManifest, query?: WorldQuery): WorldManifestShard[] {
  if (query === undefined) return [...manifest.shards];
  return manifest.shards.filter((shard) => shardMatchesQuery(shard, query));
}

/**
 * Loads the live neighborhood document for a query: reads each selected shard through `resolve`,
 * applies its overlay (if any) on top, then merges them into one {@link EditorDocument} downstream
 * consumers (`placeAuthoredObjects`, `collectAuthoredTriggers`, scatter, …) read unchanged. The
 * monolith becomes an internal detail of the loader; a one-shard world yields exactly that shard.
 * @capability world-shards merge the shards for a neighborhood into one live document
 */
export function loadWorldDocument(
  manifest: WorldManifest,
  resolve: WorldShardResolver,
  query?: WorldQuery,
): EditorDocument {
  const shards = selectWorldShards(manifest, query);
  const docs: EditorDocument[] = [];
  for (const shard of shards) {
    const base = resolve(shard.file);
    if (base === null) continue;
    if (shard.overlay === undefined) {
      docs.push(base);
      continue;
    }
    const overlay = resolve(shard.overlay);
    docs.push(overlay === null ? base : applyEditorDocumentOverlay(base, overlay));
  }
  if (docs.length === 0) return createEmptyEditorDocument();
  return mergeEditorDocuments(...docs);
}

/** The always-resident base shard id used by {@link splitEditorDocumentIntoShards}. */
export const WORLD_BASE_SHARD_ID = "base";

/** Options controlling how a monolithic document is partitioned into shards. */
export interface SplitWorldOptions {
  /** Grid cell edge length in meters. Default 256. */
  cellSize?: number;
  /** Directory prefix for generated shard files. Default `"shards"`. */
  shardDir?: string;
}

/** The result of splitting a document: a manifest plus the shard documents keyed by their file path. */
export interface SplitWorldResult {
  manifest: WorldManifest;
  /** Shard file path → document, for a caller to serialize into a world folder. */
  shards: Record<string, EditorDocument>;
}

/** Representative XZ point for an object, used to assign it to a grid cell. */
function objectCell(x: number, z: number, cellSize: number): { gx: number; gz: number } {
  return { gx: Math.floor(x / cellSize), gz: Math.floor(z / cellSize) };
}

function pathCentroid(points: readonly { x: number; z: number }[]): { x: number; z: number } {
  if (points.length === 0) return { x: 0, z: 0 };
  let x = 0;
  let z = 0;
  for (const point of points) {
    x += point.x;
    z += point.z;
  }
  return { x: x / points.length, z: z / points.length };
}

/**
 * Splits a monolithic document into a sharded world: placeable objects (markers, volumes, paths,
 * notes) are bucketed into `cellSize`-meter grid cells by a representative point and extracted into
 * per-cell shard documents; the non-placeable extras (terrain, catalogs, prefabs, collections,
 * grids, HUD layout) go into one always-resident `base` shard. Round-trips through
 * {@link loadWorldDocument} to the same object set — the reverse of monolith authoring, so a large
 * scene can be sharded once and streamed thereafter. Cell shards carry their exact object footprint
 * as bounds; empty cells are omitted; order is deterministic (row-major by grid coordinate).
 * @capability world-shards split a monolithic scene document into spatial shards
 */
export function splitEditorDocumentIntoShards(
  doc: EditorDocument,
  options: SplitWorldOptions = {},
): SplitWorldResult {
  const cellSize = options.cellSize !== undefined && options.cellSize > 0 ? options.cellSize : 256;
  const shardDir = options.shardDir ?? "shards";

  // Bucket every placeable object id by the grid cell containing its representative point.
  const cellIds = new Map<string, string[]>();
  const addToCell = (gx: number, gz: number, id: string): void => {
    const key = `${gx}:${gz}`;
    const bucket = cellIds.get(key);
    if (bucket === undefined) cellIds.set(key, [id]);
    else bucket.push(id);
  };
  for (const marker of doc.markers) {
    const { gx, gz } = objectCell(marker.position.x, marker.position.z, cellSize);
    addToCell(gx, gz, marker.id);
  }
  for (const volume of doc.volumes) {
    const { gx, gz } = objectCell(volume.center.x, volume.center.z, cellSize);
    addToCell(gx, gz, volume.id);
  }
  for (const path of doc.paths) {
    const c = pathCentroid(path.points);
    const { gx, gz } = objectCell(c.x, c.z, cellSize);
    addToCell(gx, gz, path.id);
  }
  for (const note of doc.annotations) {
    const { gx, gz } = objectCell(note.position.x, note.position.z, cellSize);
    addToCell(gx, gz, note.id);
  }

  // Always-resident base shard carries the non-placeable extras verbatim.
  const baseFile = `${shardDir}/${WORLD_BASE_SHARD_ID}.json`;
  const baseDoc: EditorDocument = {
    ...createEmptyEditorDocument(),
    ...editorDocumentExtras(doc),
  };
  const shards: Record<string, EditorDocument> = { [baseFile]: baseDoc };
  const manifestShards: WorldManifestShard[] = [
    { id: WORLD_BASE_SHARD_ID, file: baseFile, residency: "always" },
  ];

  const sortedKeys = [...cellIds.keys()].sort((a, b) => {
    const [ax, az] = a.split(":").map(Number) as [number, number];
    const [bx, bz] = b.split(":").map(Number) as [number, number];
    return az === bz ? ax - bx : az - bz;
  });
  for (const key of sortedKeys) {
    const [gx, gz] = key.split(":").map(Number) as [number, number];
    const ids = cellIds.get(key)!;
    const shardDoc = extractEditorFragment(doc, ids);
    const id = `cell_${gx}_${gz}`;
    const file = `${shardDir}/${id}.json`;
    shards[file] = shardDoc;
    manifestShards.push({
      id,
      file,
      residency: "streamed",
      bounds: {
        min: [gx * cellSize, gz * cellSize],
        max: [(gx + 1) * cellSize, (gz + 1) * cellSize],
      },
    });
  }

  return {
    manifest: {
      kind: WORLD_MANIFEST_KIND,
      version: 1,
      grid: { cellSize },
      shards: manifestShards,
    },
    shards,
  };
}

/**
 * The backward-compatible degenerate manifest: one always-resident shard pointing at a single scene
 * document file. `loadWorldDocument(singleShardWorldManifest(file), resolve)` returns exactly that
 * document — the migration path for a game that has one `editor.scene.json` and wants the world API
 * without sharding yet.
 * @capability world-shards wrap a single scene document as a one-shard world
 */
export function singleShardWorldManifest(file: string, shardId = WORLD_BASE_SHARD_ID): WorldManifest {
  return {
    kind: WORLD_MANIFEST_KIND,
    version: 1,
    shards: [{ id: shardId, file, residency: "always" }],
  };
}

/** Result of {@link decodeWorldManifest}: a typed manifest, or every diagnostic collected decoding it. */
export type DecodeWorldManifestResult =
  | { ok: true; manifest: WorldManifest }
  | { ok: false; errors: EditorDocumentDiagnostic[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeBounds(
  value: unknown,
  path: string,
  errors: EditorDocumentDiagnostic[],
): WorldShardBounds | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    errors.push({ path, message: "expected an object" });
    return undefined;
  }
  const pair = (v: unknown, p: string): [number, number] | null => {
    if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== "number" || typeof v[1] !== "number") {
      errors.push({ path: p, message: "expected [number, number]" });
      return null;
    }
    return [v[0], v[1]];
  };
  const min = pair(value.min, `${path}.min`);
  const max = pair(value.max, `${path}.max`);
  if (min === null || max === null) return undefined;
  return { min, max };
}

function decodeShard(
  value: unknown,
  path: string,
  errors: EditorDocumentDiagnostic[],
): WorldManifestShard | null {
  if (!isPlainObject(value)) {
    errors.push({ path, message: "expected an object" });
    return null;
  }
  if (typeof value.id !== "string") errors.push({ path: `${path}.id`, message: "expected a string" });
  if (typeof value.file !== "string") errors.push({ path: `${path}.file`, message: "expected a string" });
  const bounds = decodeBounds(value.bounds, `${path}.bounds`, errors);
  let residency: WorldShardResidency | undefined;
  if (value.residency !== undefined) {
    if (value.residency === "always" || value.residency === "streamed") residency = value.residency;
    else errors.push({ path: `${path}.residency`, message: "expected \"always\" | \"streamed\"" });
  }
  if (value.overlay !== undefined && typeof value.overlay !== "string") {
    errors.push({ path: `${path}.overlay`, message: "expected a string" });
  }
  if (typeof value.id !== "string" || typeof value.file !== "string") return null;
  const shard: WorldManifestShard = { id: value.id, file: value.file };
  if (bounds !== undefined) shard.bounds = bounds;
  if (residency !== undefined) shard.residency = residency;
  if (typeof value.overlay === "string") shard.overlay = value.overlay;
  return shard;
}

/**
 * The authoritative decoder for a `world.json` manifest arriving from disk or an agent: validates
 * `kind`, the shard list, and each shard's fields with a path-specific diagnostic on failure, so a
 * malformed manifest fails loudly at the boundary instead of streaming a broken world.
 * @capability world-shards decode an untrusted world manifest with per-field diagnostics
 */
export function decodeWorldManifest(raw: unknown): DecodeWorldManifestResult {
  if (!isPlainObject(raw)) {
    return { ok: false, errors: [{ path: "$", message: "world manifest must be an object" }] };
  }
  const errors: EditorDocumentDiagnostic[] = [];
  if (raw.kind !== WORLD_MANIFEST_KIND) {
    errors.push({ path: "$.kind", message: `expected "${WORLD_MANIFEST_KIND}"` });
  }
  if (raw.version !== undefined && typeof raw.version !== "number") {
    errors.push({ path: "$.version", message: "expected a number" });
  }
  let grid: WorldGrid | undefined;
  if (raw.grid !== undefined) {
    if (isPlainObject(raw.grid) && typeof raw.grid.cellSize === "number") grid = { cellSize: raw.grid.cellSize };
    else errors.push({ path: "$.grid", message: "expected { cellSize: number }" });
  }
  let streaming: WorldStreamingConfig | undefined;
  if (raw.streaming !== undefined) {
    if (
      isPlainObject(raw.streaming) &&
      typeof raw.streaming.loadRadius === "number" &&
      typeof raw.streaming.keepRadius === "number"
    ) {
      streaming = { loadRadius: raw.streaming.loadRadius, keepRadius: raw.streaming.keepRadius };
    } else {
      errors.push({ path: "$.streaming", message: "expected { loadRadius: number, keepRadius: number }" });
    }
  }
  const shards: WorldManifestShard[] = [];
  if (!Array.isArray(raw.shards)) {
    errors.push({ path: "$.shards", message: "expected an array" });
  } else {
    raw.shards.forEach((item, index) => {
      const shard = decodeShard(item, `$.shards[${index}]`, errors);
      if (shard !== null) shards.push(shard);
    });
    const seen = new Set<string>();
    shards.forEach((shard, index) => {
      if (seen.has(shard.id)) errors.push({ path: `$.shards[${index}].id`, message: `duplicate shard id "${shard.id}"` });
      else seen.add(shard.id);
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  const manifest: WorldManifest = { kind: WORLD_MANIFEST_KIND, shards };
  if (typeof raw.version === "number") manifest.version = raw.version;
  if (grid !== undefined) manifest.grid = grid;
  if (streaming !== undefined) manifest.streaming = streaming;
  return { ok: true, manifest };
}

/** Serializes a world manifest to pretty JSON for writing `world.json`. */
export function exportWorldManifestJson(manifest: WorldManifest, pretty = true): string {
  return JSON.stringify(manifest, null, pretty ? 2 : undefined);
}
