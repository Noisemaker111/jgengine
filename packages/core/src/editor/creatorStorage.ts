import type { KeyValueStorage } from "../game/keyValueStore";
import { cloneEditorDocument, decodeEditorDocument, editorDocumentSize } from "./document";
import type { EditorDocument } from "./types";
import { isScatterPath } from "../world/scatterRegion";

/** Bounds and catalog permissions for player-authored documents. */
export interface CreatorPolicy {
  maxDocuments: number;
  maxBytes: number;
  maxObjects: number;
  maxPathPoints: number;
  maxGridCells: number;
  maxTerrainVertices: number;
  allowedKinds: readonly string[];
  allowedAssets: readonly string[];
  allowedCatalogIds?: readonly string[];
  /** Total standing/weather pools plus capacity for 32 concurrent collision child bursts. */
  maxSimulationParticles?: number;
  maxFireCells?: number;
  maxPopulation?: number;
  maxForceFields?: number;
  /** Additional game-specific constraints; throw to reject the candidate atomically. */
  validate?: (document: EditorDocument) => void;
}

/** A named scene save with a storage-format version and optimistic revision. */
export interface CreatorDocument {
  version: 1;
  id: string;
  name: string;
  revision: number;
  document: EditorDocument;
}

/** Injected durable storage. Save rejects stale revisions; null creates a new id. */
export interface CreatorDocumentStorage {
  list(): Promise<readonly Omit<CreatorDocument, "document">[]>;
  load(id: string): Promise<CreatorDocument | null>;
  save(value: CreatorDocument, expectedRevision: number | null): Promise<CreatorDocument>;
}

/** Creator configuration shared by a host and its lazily loaded editor. */
export interface CreatorConfig<TPlayable> {
  storage: CreatorDocumentStorage;
  policy: CreatorPolicy;
  initialDocument: () => EditorDocument;
  createPlayable: (document: EditorDocument) => TPlayable;
  createId?: () => string;
}

function byteSize(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Validates schema, finite work budgets, and approved catalog references before cloning. */
export function validateCreatorDocument(value: unknown, policy: CreatorPolicy): EditorDocument {
  if (value === null || typeof value !== "object" || (value as { version?: unknown }).version !== 1) throw new Error("Unsupported creator scene version");
  for (const key of ["maxDocuments", "maxBytes", "maxObjects", "maxPathPoints", "maxGridCells", "maxTerrainVertices"] as const) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] < 0) throw new Error(`Invalid creator limit: ${key}`);
  }
  const json = JSON.stringify(value, null, 2);
  if (json === undefined || byteSize(json) > policy.maxBytes) throw new Error("Scene exceeds byte budget");
  const decoded = decodeEditorDocument(value);
  if (!decoded.ok) throw new Error(decoded.errors.map((error) => `${error.path} ${error.message}`).join("; "));
  const document = decoded.document;
  if (editorDocumentSize(document) > policy.maxObjects) throw new Error("Scene exceeds object budget");
  const kinds = new Set(policy.allowedKinds);
  const assets = new Set(policy.allowedAssets);
  const catalogs = new Set(policy.allowedCatalogIds ?? []);
  const nodes = [...document.markers, ...document.volumes, ...document.paths];
  for (const node of nodes) if (!kinds.has(node.kind)) throw new Error(`Unavailable scene kind: ${node.kind}`);
  if (document.paths.some(isScatterPath)) throw new Error("Creator documents require explicit placements instead of scatter paths");
  if (document.paths.reduce((count, path) => count + path.points.length, 0) > policy.maxPathPoints) throw new Error("Scene exceeds path point budget");
  let gridCells = 0;
  for (const grid of document.grids ?? []) {
    if (!kinds.has(grid.kind)) throw new Error(`Unavailable scene kind: ${grid.kind}`);
    gridCells += grid.cols * grid.rows;
  }
  if (!Number.isSafeInteger(gridCells) || gridCells > policy.maxGridCells) throw new Error("Scene exceeds grid budget");
  if (document.terrain !== undefined && document.terrain.cols * document.terrain.rows > policy.maxTerrainVertices) throw new Error("Scene exceeds terrain budget");
  // Procedural directives and prefab duplication can expand a tiny save into unbounded runtime work.
  if ((document.directives?.length ?? 0) > 0 || document.prefabs.length > 0) throw new Error("Creator documents require explicit placements");
  for (const key of ["maxSimulationParticles", "maxFireCells", "maxPopulation", "maxForceFields"] as const) {
    if (policy[key] !== undefined && (!Number.isSafeInteger(policy[key]) || policy[key]! < 0)) throw new Error(`Invalid creator limit: ${key}`);
  }
  const simulation = document.simulation;
  if (simulation !== undefined) {
    if ((simulation.forces?.length ?? 0) > (policy.maxForceFields ?? 0)) throw new Error("Scene exceeds force field budget");
    // Default precipitation pools plus the supported 256-slot rain-impact maximum.
    const weatherParticles = simulation.weather === undefined ? 0 : 5556;
    let maxChildParticles = 0;
    const emitterParticles = (simulation.emitters ?? []).reduce((total, emitter) => {
      const child = emitter.options?.collisionEffect;
      if (child !== undefined) maxChildParticles = Math.max(maxChildParticles, Math.min(child.count, child.config.max ?? child.count));
      return total + (emitter.config.max ?? 512);
    }, 0);
    // The renderer retains up to 32 concurrent child bursts, shared by all standing emitters.
    if (weatherParticles + emitterParticles + 32 * maxChildParticles > (policy.maxSimulationParticles ?? 0)) throw new Error("Scene exceeds particle budget");
    if ((simulation.fires ?? []).reduce((total, fire) => total + fire.config.cols * fire.config.rows, 0) > (policy.maxFireCells ?? 0)) throw new Error("Scene exceeds fire budget");
    if ((simulation.habitats ?? []).reduce((total, habitat) => total + habitat.count, 0) > (policy.maxPopulation ?? 0)) throw new Error("Scene exceeds population budget");
  }
  const inspect = (item: unknown): void => {
    if (Array.isArray(item)) { for (const child of item) inspect(child); return; }
    if (item === null || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (["url", "modelUrl", "textureUrl", "urls"].includes(key)) throw new Error("Creator documents cannot import external asset URLs");
      if (["assetId", "modelId", "materialId"].includes(key) && (typeof child !== "string" || !assets.has(child))) throw new Error(`Unavailable asset: ${String(child)}`);
      if (key === "catalogId" && (typeof child !== "string" || !catalogs.has(child))) throw new Error(`Unavailable catalog entry: ${String(child)}`);
      inspect(child);
    }
  };
  inspect(document);
  policy.validate?.(document);
  return cloneEditorDocument(document);
}

/** Imports scene JSON using the same validation as commands and durable saves. */
export function importCreatorDocument(json: string, policy: CreatorPolicy): EditorDocument {
  if (byteSize(json) > policy.maxBytes) throw new Error("Scene exceeds byte budget");
  return validateCreatorDocument(JSON.parse(json), policy);
}

/** Exports validated, schema-versioned scene JSON.
 * @capability creator-export export validated player scenes with approved catalogs and finite budgets
 */
export function exportCreatorDocument(document: EditorDocument, policy: CreatorPolicy): string {
  return JSON.stringify(validateCreatorDocument(document, policy), null, 2);
}

function identity(value: CreatorDocument): void {
  if (value.version !== 1) throw new Error("Unsupported creator save version");
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(value.id)) throw new Error("Invalid scene id");
  if (typeof value.name !== "string" || value.name.trim().length === 0 || value.name.length > 80) throw new Error("Scene name must contain 1–80 characters");
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error("Invalid scene revision");
}

/** Durable browser-compatible adapter over injected key/value storage; one atomic catalog write.
 * @capability creator-storage save and reopen named versioned player creations through injected durable storage
 */
export function createCreatorDocumentStorage(config: { storage: KeyValueStorage; key: string; policy: CreatorPolicy }): CreatorDocumentStorage {
  const read = (): CreatorDocument[] => {
    const json = config.storage.getItem(config.key);
    if (json === null) return [];
    if (byteSize(json) > config.policy.maxDocuments * (config.policy.maxBytes + 1024) + 128) throw new Error("Creator catalog exceeds byte budget");
    const value: unknown = JSON.parse(json);
    if (value === null || typeof value !== "object" || (value as { version?: unknown }).version !== 1) throw new Error("Unsupported creator catalog version");
    const documents = (value as { documents?: unknown }).documents;
    if (!Array.isArray(documents) || documents.length > config.policy.maxDocuments) throw new Error("Creator catalog exceeds document budget");
    const ids = new Set<string>();
    return documents.map((item: CreatorDocument) => {
      identity(item);
      if (ids.has(item.id)) throw new Error("Duplicate scene id");
      ids.add(item.id);
      return { ...item, document: validateCreatorDocument(item.document, config.policy) };
    });
  };
  return {
    async list() { return read().map(({ document: _document, ...summary }) => summary); },
    async load(id) { return read().find((item) => item.id === id) ?? null; },
    async save(value, expectedRevision) {
      identity(value);
      const document = validateCreatorDocument(value.document, config.policy);
      const documents = read();
      const index = documents.findIndex((item) => item.id === value.id);
      const previous = documents[index];
      if ((previous?.revision ?? null) !== expectedRevision) throw new Error("Scene changed in storage; reopen it before saving");
      if (previous === undefined && documents.length >= config.policy.maxDocuments) throw new Error("Creator catalog is full");
      const next: CreatorDocument = { version: 1, id: value.id, name: value.name.trim(), revision: (previous?.revision ?? 0) + 1, document };
      if (index < 0) documents.push(next); else documents[index] = next;
      config.storage.setItem(config.key, JSON.stringify({ version: 1, documents }));
      return { ...next, document: cloneEditorDocument(document) };
    },
  };
}
