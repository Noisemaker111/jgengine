import type { EditorCommand } from "./commands";
import type { EditorDocument } from "./types";
import {
  runtimeEntityWriteBackCommand,
  type RuntimeEntityState,
  type RuntimeStateSnapshot,
} from "./liveSync";

/** Play-mode sim gate held by the editor host — pause freezes ticks; step runs N frames then re-pauses. */
export interface RuntimePlayControl {
  paused: boolean;
  pendingSteps: number;
}

/** Compact reverse-channel view for the play-mode inspector and `runtime_summary` RPC. */
export interface RuntimeInspectorSummary {
  seq: number;
  entityCount: number;
  entities: readonly {
    id: string;
    hasPosition: boolean;
    rotationY?: number;
    valueKeys: readonly string[];
  }[];
  tunableKeys: readonly string[];
  overrideIds: readonly string[];
  play: RuntimePlayControl;
}

/** One resolved runtime field returned by `runtime_get`. */
export interface RuntimeInspectorGetResult {
  id: string;
  kind: "entity" | "tunable" | "missing";
  entity?: RuntimeEntityState;
  path?: string;
  value?: unknown;
  override?: RuntimeEntityState;
}

/** Desired mutation from `runtime_set` before the host applies it. */
export interface RuntimeInspectorSetPlan {
  entity?: RuntimeEntityState;
  tunable?: { key: string; value: unknown };
  writeBackCommands: readonly EditorCommand[];
  error?: string;
}

/**
 * Builds the compact reverse-channel summary used by the play-mode inspector panel and the
 * `runtime_summary` bridge RPC.
 * @capability editor-runtime-inspector summarize live runtime entities and tunables for play mode
 */
export function summarizeRuntimeInspector(
  snapshot: RuntimeStateSnapshot,
  overrides: Readonly<Record<string, RuntimeEntityState>>,
  play: RuntimePlayControl,
): RuntimeInspectorSummary {
  const entities = Object.values(snapshot.entities)
    .map((entity) => ({
      id: entity.id,
      hasPosition: entity.position !== undefined,
      ...(entity.rotationY === undefined ? {} : { rotationY: entity.rotationY }),
      valueKeys: entity.values === undefined ? [] : Object.keys(entity.values).sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    seq: snapshot.seq,
    entityCount: entities.length,
    entities,
    tunableKeys: Object.keys(snapshot.tunables).sort(),
    overrideIds: Object.keys(overrides).sort(),
    play: { paused: play.paused, pendingSteps: play.pendingSteps },
  };
}

/**
 * Resolves one entity, entity field, or tunable from the reverse-channel snapshot (with overrides
 * layered on top for entity rows).
 * @capability editor-runtime-inspector read one live runtime entity field or tunable
 */
export function getRuntimeInspectorValue(
  snapshot: RuntimeStateSnapshot,
  overrides: Readonly<Record<string, RuntimeEntityState>>,
  id: string,
  path?: string,
): RuntimeInspectorGetResult {
  if (id.startsWith("tunable:")) {
    const key = id.slice("tunable:".length);
    if (key.length === 0) return { id, kind: "missing" };
    if (!(key in snapshot.tunables) && path === undefined) return { id, kind: "missing", path: key };
    return {
      id,
      kind: "tunable",
      path: key,
      value: snapshot.tunables[key],
    };
  }

  const base = snapshot.entities[id];
  const override = overrides[id];
  if (base === undefined && override === undefined) {
    if (path !== undefined && path in snapshot.tunables) {
      return { id: `tunable:${path}`, kind: "tunable", path, value: snapshot.tunables[path] };
    }
    return { id, kind: "missing", path };
  }

  const entity: RuntimeEntityState = {
    id,
    position: override?.position ?? base?.position,
    rotationY: override?.rotationY ?? base?.rotationY,
    values:
      override?.values === undefined && base?.values === undefined
        ? undefined
        : { ...base?.values, ...override?.values },
  };

  if (path === undefined || path === "") {
    return { id, kind: "entity", entity, ...(override === undefined ? {} : { override }) };
  }

  if (path === "position") {
    return { id, kind: "entity", entity, path, value: entity.position, ...(override === undefined ? {} : { override }) };
  }
  if (path === "rotationY") {
    return { id, kind: "entity", entity, path, value: entity.rotationY, ...(override === undefined ? {} : { override }) };
  }
  if (path.startsWith("values.")) {
    const key = path.slice("values.".length);
    return {
      id,
      kind: "entity",
      entity,
      path,
      value: entity.values?.[key],
      ...(override === undefined ? {} : { override }),
    };
  }
  return {
    id,
    kind: "entity",
    entity,
    path,
    value: entity.values?.[path],
    ...(override === undefined ? {} : { override }),
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asPosition(value: unknown): { x: number; y: number; z: number } | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!isFiniteNumber(record.x) || !isFiniteNumber(record.y) || !isFiniteNumber(record.z)) return null;
  return { x: record.x, y: record.y, z: record.z };
}

/**
 * Plans a play-mode poke: builds the ephemeral entity/tunable override and, when `writeBack` is
 * true, the undoable document commands that promote it into the scene document.
 * @capability editor-runtime-inspector plan a play-mode runtime_set with optional document write-back
 */
export function planRuntimeInspectorSet(
  document: EditorDocument,
  input: {
    id: string;
    path?: string;
    value?: unknown;
    position?: { x: number; y: number; z: number };
    rotationY?: number;
    values?: Record<string, unknown>;
    writeBack?: boolean;
  },
): RuntimeInspectorSetPlan {
  const writeBack = input.writeBack !== false;
  const writeBackCommands: EditorCommand[] = [];

  if (input.id.startsWith("tunable:")) {
    const key = input.id.slice("tunable:".length);
    if (key.length === 0) return { writeBackCommands, error: "tunable id is empty" };
    if (input.value === undefined) return { writeBackCommands, error: "tunable set requires value" };
    return { tunable: { key, value: input.value }, writeBackCommands };
  }

  if (input.path !== undefined && input.path.startsWith("tunable:")) {
    const key = input.path.slice("tunable:".length);
    if (key.length === 0) return { writeBackCommands, error: "tunable path is empty" };
    if (input.value === undefined) return { writeBackCommands, error: "tunable set requires value" };
    return { tunable: { key, value: input.value }, writeBackCommands };
  }

  const entity: RuntimeEntityState = { id: input.id };
  let touched = false;

  if (input.position !== undefined) {
    entity.position = { ...input.position };
    touched = true;
  }
  if (input.rotationY !== undefined) {
    if (!isFiniteNumber(input.rotationY)) return { writeBackCommands, error: "rotationY must be finite" };
    entity.rotationY = input.rotationY;
    touched = true;
  }
  if (input.values !== undefined) {
    entity.values = { ...input.values };
    touched = true;
  }

  if (input.path === "position") {
    const position = asPosition(input.value);
    if (position === null) return { writeBackCommands, error: "position value must be {x,y,z}" };
    entity.position = position;
    touched = true;
  } else if (input.path === "rotationY") {
    if (!isFiniteNumber(input.value)) return { writeBackCommands, error: "rotationY value must be finite" };
    entity.rotationY = input.value;
    touched = true;
  } else if (input.path !== undefined && input.path.startsWith("values.")) {
    const key = input.path.slice("values.".length);
    if (key.length === 0) return { writeBackCommands, error: "values path is empty" };
    entity.values = { [key]: input.value };
    touched = true;
  } else if (input.path !== undefined && input.path.length > 0 && input.value !== undefined) {
    entity.values = { [input.path]: input.value };
    touched = true;
  }

  if (!touched) {
    return { writeBackCommands, error: `runtime_set "${input.id}" has no position, rotationY, values, or path` };
  }

  if (writeBack) {
    const transform = runtimeEntityWriteBackCommand(document, entity);
    if (transform !== null) writeBackCommands.push(transform);
    if (entity.values !== undefined) {
      const metaCommand = runtimeEntityMetaWriteBackCommand(document, entity);
      if (metaCommand !== null) writeBackCommands.push(metaCommand);
    }
  }

  return { entity, writeBackCommands };
}

/**
 * Promotes ephemeral runtime `values` into an undoable meta patch on a document-linked object.
 * Returns null when the id is not in the document or there are no values.
 * @capability editor-runtime-inspector promote runtime entity values into a document meta write-back
 */
export function runtimeEntityMetaWriteBackCommand(
  document: EditorDocument,
  entity: RuntimeEntityState,
): EditorCommand | null {
  if (entity.values === undefined || Object.keys(entity.values).length === 0) return null;
  const marker = document.markers.find((entry) => entry.id === entity.id);
  if (marker !== undefined) {
    return {
      type: "setMarker",
      id: entity.id,
      patch: { meta: { ...marker.meta, ...entity.values } },
    };
  }
  const volume = document.volumes.find((entry) => entry.id === entity.id);
  if (volume !== undefined) {
    return {
      type: "setVolume",
      id: entity.id,
      patch: { meta: { ...volume.meta, ...entity.values } },
    };
  }
  const path = document.paths.find((entry) => entry.id === entity.id);
  if (path !== undefined) {
    return {
      type: "setPath",
      id: entity.id,
      patch: { meta: { ...path.meta, ...entity.values } },
    };
  }
  const note = document.annotations.find((entry) => entry.id === entity.id);
  if (note !== undefined) {
    return {
      type: "setNote",
      id: entity.id,
      patch: { meta: { ...note.meta, ...entity.values } },
    };
  }
  return null;
}

/**
 * Advances the play-control step counter: when paused with pending steps, consumes one and reports
 * whether the sim should run this frame. When not paused, always runs.
 * @capability editor-runtime-inspector gate a play-mode frame against pause/step control
 */
export function consumeRuntimePlayStep(play: RuntimePlayControl): {
  runFrame: boolean;
  next: RuntimePlayControl;
} {
  if (!play.paused) return { runFrame: true, next: play };
  if (play.pendingSteps <= 0) return { runFrame: false, next: play };
  return {
    runFrame: true,
    next: { paused: true, pendingSteps: play.pendingSteps - 1 },
  };
}

/** Default play-control state when entering play mode (running). */
export function createRuntimePlayControl(paused = false): RuntimePlayControl {
  return { paused, pendingSteps: 0 };
}
