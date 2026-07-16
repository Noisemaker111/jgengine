import { createEditorSession, type EditorCommand } from "./commands";
import { cloneEditorDocument } from "./document";
import type { EditorDocument, EditorVec3 } from "./types";

/**
 * One versioned document mutation on the live-sync stream. `snapshot` replaces the whole
 * document; `commands` replays structural editor commands onto the current document.
 * `baseRevision` must match the receiver's current revision unless `force` is set (document
 * authority from the editor).
 */
export type DocumentPatch =
  | {
      type: "snapshot";
      revision?: number;
      baseRevision: number;
      document: EditorDocument;
    }
  | {
      type: "commands";
      revision?: number;
      baseRevision: number;
      commands: readonly EditorCommand[];
    };

/** Result of applying a {@link DocumentPatch} to a document + revision pair. */
export type ApplyDocumentPatchResult =
  | { ok: true; document: EditorDocument; revision: number; patch: DocumentPatch }
  | { ok: false; error: string };

/** One live entity row the runtime may stream to the editor (play-mode inspector feed). */
export interface RuntimeEntityState {
  id: string;
  position?: EditorVec3;
  rotationY?: number;
  values?: Record<string, unknown>;
}

/** Full ephemeral runtime view held on the reverse channel — never mutates the document. */
export interface RuntimeStateSnapshot {
  seq: number;
  entities: Record<string, RuntimeEntityState>;
  tunables: Record<string, unknown>;
}

/**
 * Incremental runtime state for the reverse channel. Entity rows upsert by id; `removeIds`
 * drop rows; `tunables` shallow-merge. Ephemeral unless written back as a document patch.
 */
export interface RuntimeStateDelta {
  seq: number;
  at: number;
  entities?: readonly RuntimeEntityState[];
  removeIds?: readonly string[];
  tunables?: Record<string, unknown>;
}

/** Event emitted when the authoritative document changes on a {@link DocumentLiveSync}. */
export interface DocumentLiveEvent {
  document: EditorDocument;
  revision: number;
  patch: DocumentPatch;
}

const MAX_PATCH_LOG = 64;
const MAX_RUNTIME_LOG = 128;

/**
 * Applies a versioned document patch. Rejects base-revision mismatches unless `force` (document
 * is authoritative — the editor forces when publishing its own session state).
 * @capability editor-live-sync apply a versioned document patch onto a live scene document
 */
export function applyDocumentPatch(
  document: EditorDocument,
  revision: number,
  patch: DocumentPatch,
  options?: { force?: boolean },
): ApplyDocumentPatchResult {
  if (!options?.force && patch.baseRevision !== revision) {
    return {
      ok: false,
      error: `baseRevision mismatch: patch=${patch.baseRevision} current=${revision}`,
    };
  }
  if (patch.type === "snapshot") {
    const nextDoc = cloneEditorDocument(patch.document);
    const nextRevision = revision + 1;
    return {
      ok: true,
      document: nextDoc,
      revision: nextRevision,
      patch: { ...patch, revision: nextRevision, document: nextDoc },
    };
  }
  if (patch.commands.length === 0) {
    return { ok: false, error: "commands patch is empty" };
  }
  const session = createEditorSession(cloneEditorDocument(document));
  for (const command of patch.commands) {
    session.dispatch(command);
  }
  const nextDoc = session.getState().document;
  const nextRevision = revision + 1;
  return {
    ok: true,
    document: nextDoc,
    revision: nextRevision,
    patch: { ...patch, revision: nextRevision },
  };
}

/**
 * Merges a runtime delta into a snapshot without touching the scene document — runtime overrides
 * stay ephemeral until an explicit write-back produces a document patch.
 * @capability editor-live-sync merge a runtime state delta into the reverse-channel snapshot
 */
export function applyRuntimeStateDelta(
  snapshot: RuntimeStateSnapshot,
  delta: Omit<RuntimeStateDelta, "seq"> & { seq?: number },
): { snapshot: RuntimeStateSnapshot; delta: RuntimeStateDelta } {
  const entities = { ...snapshot.entities };
  if (delta.removeIds !== undefined) {
    for (const id of delta.removeIds) delete entities[id];
  }
  if (delta.entities !== undefined) {
    for (const row of delta.entities) {
      const prev = entities[row.id];
      entities[row.id] = {
        id: row.id,
        position: row.position ?? prev?.position,
        rotationY: row.rotationY ?? prev?.rotationY,
        values:
          row.values === undefined && prev?.values === undefined
            ? undefined
            : { ...prev?.values, ...row.values },
      };
    }
  }
  const tunables =
    delta.tunables === undefined ? snapshot.tunables : { ...snapshot.tunables, ...delta.tunables };
  const seq = snapshot.seq + 1;
  const applied: RuntimeStateDelta = {
    seq,
    at: delta.at,
    ...(delta.entities === undefined ? {} : { entities: delta.entities }),
    ...(delta.removeIds === undefined ? {} : { removeIds: delta.removeIds }),
    ...(delta.tunables === undefined ? {} : { tunables: delta.tunables }),
  };
  return { snapshot: { seq, entities, tunables }, delta: applied };
}

/**
 * Builds an undoable document command from an ephemeral runtime entity row (write-back). Returns
 * null when there is nothing to promote. Does not mutate document or clear the override — the
 * caller dispatches the command and then clears the override.
 * @capability editor-live-sync promote a runtime entity override into a document write-back command
 */
export function runtimeEntityWriteBackCommand(
  document: EditorDocument,
  entity: RuntimeEntityState,
): EditorCommand | null {
  const marker = document.markers.find((entry) => entry.id === entity.id);
  if (marker !== undefined) {
    if (entity.position === undefined && entity.rotationY === undefined) return null;
    return {
      type: "setTransform",
      id: entity.id,
      ...(entity.position === undefined ? {} : { position: { ...entity.position } }),
      ...(entity.rotationY === undefined ? {} : { rotationY: entity.rotationY }),
    };
  }
  const volume = document.volumes.find((entry) => entry.id === entity.id);
  if (volume !== undefined) {
    if (entity.position === undefined) return null;
    return { type: "setTransform", id: entity.id, position: { ...entity.position } };
  }
  const note = document.annotations.find((entry) => entry.id === entity.id);
  if (note !== undefined) {
    if (entity.position === undefined) return null;
    return { type: "setTransform", id: entity.id, position: { ...entity.position } };
  }
  return null;
}

/** Two-way live-sync bus: document patches out, runtime state deltas back. */
export interface DocumentLiveSync {
  getDocument(): EditorDocument;
  getRevision(): number;
  applyPatch(
    patch: DocumentPatch,
    options?: { force?: boolean },
  ): ApplyDocumentPatchResult;
  /** Document-authoritative full replace (editor session mirror). */
  replaceDocument(document: EditorDocument): DocumentLiveEvent;
  pullPatches(sinceRevision: number): DocumentPatch[];
  subscribeDocument(listener: (event: DocumentLiveEvent) => void): () => void;
  getRuntimeState(): RuntimeStateSnapshot;
  pushRuntimeDelta(delta: Omit<RuntimeStateDelta, "seq">): RuntimeStateDelta;
  pullRuntimeDeltas(sinceSeq: number): RuntimeStateDelta[];
  subscribeRuntime(listener: (delta: RuntimeStateDelta, snapshot: RuntimeStateSnapshot) => void): () => void;
  setRuntimeOverride(entity: RuntimeEntityState): void;
  clearRuntimeOverride(id: string): void;
  getRuntimeOverrides(): Readonly<Record<string, RuntimeEntityState>>;
  /**
   * Promote an ephemeral override into a document command patch when the id exists in the
   * document. Clears the override only after a successful apply.
   */
  writeBackOverride(id: string): ApplyDocumentPatchResult | { ok: false; error: string };
}

/**
 * Creates an in-memory two-way live-sync bus seeded from an initial document. Document is
 * authoritative; runtime overrides are ephemeral until {@link DocumentLiveSync.writeBackOverride}.
 * @capability editor-live-sync two-way document/runtime live-sync bus for editor↔game
 */
export function createDocumentLiveSync(initial: EditorDocument): DocumentLiveSync {
  let document = cloneEditorDocument(initial);
  let revision = 0;
  let runtime: RuntimeStateSnapshot = { seq: 0, entities: {}, tunables: {} };
  const overrides: Record<string, RuntimeEntityState> = {};
  const patchLog: DocumentPatch[] = [];
  const runtimeLog: RuntimeStateDelta[] = [];
  const documentListeners = new Set<(event: DocumentLiveEvent) => void>();
  const runtimeListeners = new Set<(delta: RuntimeStateDelta, snapshot: RuntimeStateSnapshot) => void>();

  const emitDocument = (event: DocumentLiveEvent) => {
    for (const listener of documentListeners) listener(event);
  };

  const commit = (result: Extract<ApplyDocumentPatchResult, { ok: true }>): DocumentLiveEvent => {
    document = result.document;
    revision = result.revision;
    patchLog.push(result.patch);
    if (patchLog.length > MAX_PATCH_LOG) patchLog.splice(0, patchLog.length - MAX_PATCH_LOG);
    const event: DocumentLiveEvent = {
      document,
      revision,
      patch: result.patch,
    };
    emitDocument(event);
    return event;
  };

  return {
    getDocument: () => document,
    getRevision: () => revision,
    applyPatch(patch, options) {
      const result = applyDocumentPatch(document, revision, patch, options);
      if (!result.ok) return result;
      commit(result);
      return result;
    },
    replaceDocument(next) {
      const result = applyDocumentPatch(
        document,
        revision,
        { type: "snapshot", baseRevision: revision, document: next },
        { force: true },
      );
      if (!result.ok) {
        throw new Error(result.error);
      }
      return commit(result);
    },
    pullPatches(sinceRevision) {
      return patchLog.filter((patch) => (patch.revision ?? 0) > sinceRevision);
    },
    subscribeDocument(listener) {
      documentListeners.add(listener);
      return () => {
        documentListeners.delete(listener);
      };
    },
    getRuntimeState: () => runtime,
    pushRuntimeDelta(delta) {
      const applied = applyRuntimeStateDelta(runtime, delta);
      runtime = applied.snapshot;
      runtimeLog.push(applied.delta);
      if (runtimeLog.length > MAX_RUNTIME_LOG) runtimeLog.splice(0, runtimeLog.length - MAX_RUNTIME_LOG);
      for (const listener of runtimeListeners) listener(applied.delta, runtime);
      return applied.delta;
    },
    pullRuntimeDeltas(sinceSeq) {
      return runtimeLog.filter((delta) => delta.seq > sinceSeq);
    },
    subscribeRuntime(listener) {
      runtimeListeners.add(listener);
      return () => {
        runtimeListeners.delete(listener);
      };
    },
    setRuntimeOverride(entity) {
      const prev = overrides[entity.id];
      overrides[entity.id] = {
        id: entity.id,
        position: entity.position ?? prev?.position,
        rotationY: entity.rotationY ?? prev?.rotationY,
        values:
          entity.values === undefined && prev?.values === undefined
            ? undefined
            : { ...prev?.values, ...entity.values },
      };
    },
    clearRuntimeOverride(id) {
      delete overrides[id];
    },
    getRuntimeOverrides: () => ({ ...overrides }),
    writeBackOverride(id) {
      const entity = overrides[id];
      if (entity === undefined) return { ok: false, error: `no runtime override for "${id}"` };
      const command = runtimeEntityWriteBackCommand(document, entity);
      if (command === null) {
        return { ok: false, error: `override "${id}" has nothing to write back into the document` };
      }
      const result = applyDocumentPatch(
        document,
        revision,
        { type: "commands", baseRevision: revision, commands: [command] },
        { force: true },
      );
      if (!result.ok) return result;
      commit(result);
      delete overrides[id];
      return result;
    },
  };
}

const GLOBAL_KEY = "__jgengineDocumentLiveSync";
const INSTALL_LISTENERS = new Set<() => void>();

/** Publishes a live-sync bus globally so AuthoredScene / games can subscribe without prop drilling. */
export function installDocumentLiveSync(sync: DocumentLiveSync): () => void {
  const root = globalThis as typeof globalThis & { [GLOBAL_KEY]?: DocumentLiveSync };
  root[GLOBAL_KEY] = sync;
  for (const listener of INSTALL_LISTENERS) listener();
  return () => {
    if (root[GLOBAL_KEY] === sync) delete root[GLOBAL_KEY];
    for (const listener of INSTALL_LISTENERS) listener();
  };
}

/** Returns the globally installed live-sync bus, or null when none is mounted. */
export function getDocumentLiveSync(): DocumentLiveSync | null {
  const root = globalThis as typeof globalThis & { [GLOBAL_KEY]?: DocumentLiveSync };
  return root[GLOBAL_KEY] ?? null;
}

/**
 * Subscribe to install/uninstall of the global live-sync bus (AuthoredScene re-attaches when the
 * editor host mounts over a running game).
 */
export function subscribeDocumentLiveSyncInstall(listener: () => void): () => void {
  INSTALL_LISTENERS.add(listener);
  return () => {
    INSTALL_LISTENERS.delete(listener);
  };
}
