import { parseEditorMaterialAsset } from "@jgengine/core/editor/materialAuthoring";
import {
  editorDocumentBounds,
  listEditorKinds,
  summarizeEditorSession,
  type EditorCommand,
  type EditorDocument,
  type EditorMarker,
  type EditorNote,
  type EditorPath,
  type EditorVec3,
  type EditorVolume,
} from "@jgengine/core/editor/index";
import { resolvePlaceAsset, toEditorMarker } from "@jgengine/core/placement/placeAsset";
import { generatorForObject } from "@jgengine/core/scene/assetGenerator";
import { getSceneKind } from "@jgengine/core/scene/sceneKinds";
import {
  generatorSeed,
  generatorVariants,
  getGenerator,
  listGenerators,
  type GeneratorDefinition,
  type GeneratorVariantOptions,
} from "@jgengine/core/generator/generator";
import { findSchemaPreset, validateParams, type ParamSchema } from "@jgengine/core/generator/paramSchema";

import { EDITOR_RUN_MODES } from "../session";
import { boundsCenter, frameDistanceForBounds } from "../camera/orbitFraming";
import type { HandlerTable } from "./context";

/** Optional orbit-camera placement fields a `camera_goto`/`camera_frame` request may carry. */
interface CameraPlacementRequest {
  distance?: number;
  pitch?: number;
  yaw?: number;
  height?: number;
}

/** Collect the finite placement fields present on a camera request into a focus-target patch. */
function cameraPlacement(request: CameraPlacementRequest): {
  distance?: number;
  pitch?: number;
  yaw?: number;
  height?: number;
} {
  const placement: { distance?: number; pitch?: number; yaw?: number; height?: number } = {};
  if (typeof request.distance === "number" && Number.isFinite(request.distance)) placement.distance = request.distance;
  if (typeof request.pitch === "number" && Number.isFinite(request.pitch)) placement.pitch = request.pitch;
  if (typeof request.yaw === "number" && Number.isFinite(request.yaw)) placement.yaw = request.yaw;
  if (typeof request.height === "number" && Number.isFinite(request.height)) placement.height = request.height;
  return placement;
}

/** True when any of `ids` names a placeable object (marker/volume/path/note) in the document — used
 * to reject batch mutations that would match nothing, so the caller hears an honest `ok:false`. */
function documentHasAnyId(doc: EditorDocument, ids: readonly string[]): boolean {
  if (ids.length === 0) return false;
  const wanted = new Set(ids);
  return (
    doc.markers.some((m) => wanted.has(m.id)) ||
    doc.volumes.some((v) => wanted.has(v.id)) ||
    doc.paths.some((p) => wanted.has(p.id)) ||
    doc.annotations.some((n) => wanted.has(n.id))
  );
}

type MetaTarget =
  | { target: "marker"; object: EditorMarker; kind: string; meta: Record<string, unknown> | undefined }
  | { target: "volume"; object: EditorVolume; kind: string; meta: Record<string, unknown> | undefined }
  | { target: "path"; object: EditorPath; kind: string; meta: Record<string, unknown> | undefined }
  | { target: "note"; object: EditorNote; kind: string; meta: Record<string, unknown> | undefined };

/** Which document collection an object lives in, plus its current kind + meta — for generic `set_meta`. */
function findMetaTarget(doc: EditorDocument, id: string): MetaTarget | null {
  const marker = doc.markers.find((m) => m.id === id);
  if (marker !== undefined) return { target: "marker", object: marker, kind: marker.kind, meta: marker.meta };
  const volume = doc.volumes.find((v) => v.id === id);
  if (volume !== undefined) return { target: "volume", object: volume, kind: volume.kind, meta: volume.meta };
  const path = doc.paths.find((p) => p.id === id);
  if (path !== undefined) return { target: "path", object: path, kind: path.kind, meta: path.meta };
  const note = doc.annotations.find((n) => n.id === id);
  if (note !== undefined) return { target: "note", object: note, kind: "note", meta: note.meta };
  return null;
}

/** The one command that replaces an object's meta bag, whichever collection it lives in. */
function metaPatchCommand(target: MetaTarget["target"], id: string, meta: Record<string, unknown>): EditorCommand {
  switch (target) {
    case "marker":
      return { type: "setMarker", id, patch: { meta } };
    case "volume":
      return { type: "setVolume", id, patch: { meta } };
    case "path":
      return { type: "setPath", id, patch: { meta } };
    case "note":
      return { type: "setNote", id, patch: { meta } };
  }
}

const MAX_GENERATOR_VARIANTS = 64;

/** The variant-grid options shared by `generator_variants`, `apply_variant` and `place_variant`. */
interface VariantGridRequest {
  count?: number;
  explore?: number;
  seed?: string;
  keep?: Record<string, unknown>[];
}

/** A variant pick: a grid index, or a variant `meta` bag the caller already holds (wins over `index`). */
interface VariantPickRequest extends VariantGridRequest {
  index?: number;
  meta?: Record<string, unknown>;
}

function variantGridOptions(request: VariantGridRequest): GeneratorVariantOptions {
  const count =
    typeof request.count === "number" && Number.isFinite(request.count)
      ? Math.min(MAX_GENERATOR_VARIANTS, Math.max(1, Math.floor(request.count)))
      : 20;
  return {
    count,
    ...(typeof request.explore === "number" && Number.isFinite(request.explore) ? { explore: Math.min(1, Math.max(0, request.explore)) } : {}),
    ...(request.seed === undefined ? {} : { seed: request.seed }),
    ...(request.keep === undefined ? {} : { keep: request.keep }),
  };
}

function objectGenerator(doc: EditorDocument, id: string): { target: MetaTarget; definition: GeneratorDefinition } | { error: string } {
  const target = findMetaTarget(doc, id);
  if (target === null) return { error: `object not found: ${id}` };
  const definition = generatorForObject(target.kind, target.meta);
  if (definition !== undefined) return { target, definition };
  const kindGenerator = getSceneKind(target.kind)?.generator;
  return kindGenerator === undefined
    ? { error: `object "${id}" (kind "${target.kind}") has no generator: its kind names none and meta.assetId names no parts generator` }
    : { error: `kind "${target.kind}" names generator "${kindGenerator}", which is not registered` };
}

/** The schema-owned keys of a variant bag (every value field plus the seed), so non-schema meta like `assetId` stays put. */
function variantMetaPatch(schema: ParamSchema, meta: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const keys = schema.fields.filter((field) => field.type !== "action").map((field) => field.key);
  if (!schema.fields.some((field) => field.type === "seed")) keys.push("seed");
  const patch: Record<string, unknown> = {};
  for (const key of keys) if (meta[key] !== undefined) patch[key] = meta[key];
  return patch;
}

function chosenVariant(
  definition: GeneratorDefinition,
  base: Record<string, unknown> | undefined,
  request: VariantPickRequest,
): { meta: Record<string, unknown>; index: number | null } | { error: string } {
  if (request.meta !== undefined) return { meta: request.meta, index: null };
  if (request.index === undefined) return { error: "requires index (a variant from generator_variants) or meta" };
  const variants = generatorVariants(definition, base, variantGridOptions(request));
  const variant = Number.isInteger(request.index) ? variants[request.index] : undefined;
  if (variant === undefined) return { error: `variant index ${request.index} is outside 0..${variants.length - 1}` };
  return { meta: variant.meta, index: variant.index };
}

/** The object's meta with a picked variant's schema fields and seed written over it, validated. */
function variantMeta(
  definition: GeneratorDefinition,
  target: MetaTarget,
  base: Record<string, unknown>,
  request: VariantPickRequest,
): { meta: Record<string, unknown>; index: number | null } | { error: string } {
  const chosen = chosenVariant(definition, target.meta, request);
  if ("error" in chosen) return chosen;
  const meta = { ...base, ...variantMetaPatch(definition.schema, chosen.meta) };
  const issues = validateParams(definition.schema, meta);
  if (issues.length > 0) {
    return { error: `invalid ${definition.id} params: ${issues.map((issue) => `${issue.key} (${issue.message})`).join(", ")}` };
  }
  const invalid = validateMetaForKind(target.kind, meta);
  return invalid === null ? { meta, index: chosen.index } : { error: invalid };
}

function withoutPrefabLink(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  const copy = { ...meta };
  delete copy["prefabId"];
  delete copy["prefabInstanceId"];
  return copy;
}

/** A fresh copy of `target`'s geometry shifted by `offset`, carrying `meta`; null for notes. */
function placedVariantCommand(target: MetaTarget, id: string, offset: EditorVec3, meta: Record<string, unknown>): EditorCommand | null {
  const shift = (point: EditorVec3): EditorVec3 => ({ x: point.x + offset.x, y: point.y + offset.y, z: point.z + offset.z });
  switch (target.target) {
    case "marker": {
      const source = target.object;
      return {
        type: "addMarker",
        marker: {
          id,
          kind: source.kind,
          position: shift(source.position),
          ...(source.rotationY === undefined ? {} : { rotationY: source.rotationY }),
          ...(source.color === undefined ? {} : { color: source.color }),
          ...(source.label === undefined ? {} : { label: source.label }),
          ...(source.catalogId === undefined ? {} : { catalogId: source.catalogId }),
          meta,
        },
      };
    }
    case "volume": {
      const source = target.object;
      return {
        type: "addVolume",
        volume: {
          id,
          kind: source.kind,
          shape: source.shape,
          center: shift(source.center),
          ...(source.radius === undefined ? {} : { radius: source.radius }),
          ...(source.height === undefined ? {} : { height: source.height }),
          ...(source.halfExtents === undefined ? {} : { halfExtents: { ...source.halfExtents } }),
          ...(source.color === undefined ? {} : { color: source.color }),
          ...(source.label === undefined ? {} : { label: source.label }),
          meta,
        },
      };
    }
    case "path": {
      const source = target.object;
      return {
        type: "addPath",
        path: {
          id,
          kind: source.kind,
          points: source.points.map(shift),
          ...(source.width === undefined ? {} : { width: source.width }),
          ...(source.color === undefined ? {} : { color: source.color }),
          ...(source.label === undefined ? {} : { label: source.label }),
          meta,
        },
      };
    }
    case "note":
      return null;
  }
}

/** Validates a merged meta bag against a registered kind's schema; returns an error string or null. */
function validateMetaForKind(kind: string, meta: Record<string, unknown> | undefined): string | null {
  const definition = getSceneKind(kind);
  if (definition === undefined || meta === undefined) return null;
  const issues = validateParams(definition.schema, meta);
  if (issues.length === 0) return null;
  return `invalid ${kind} params: ${issues.map((issue) => `${issue.key} (${issue.message})`).join(", ")}`;
}

/** Document, selection, camera, mode, asset placement, and status verbs. */
export const documentHandlers: Pick<
  HandlerTable,
  | "editor_status"
  | "set_mode"
  | "perf_report"
  | "list_layers"
  | "list_selection"
  | "get_marker"
  | "get_volume"
  | "set_transform"
  | "set_volume"
  | "set_path"
  | "add_path"
  | "add_marker"
  | "set_marker"
  | "set_note"
  | "set_meta"
  | "apply_preset"
  | "list_generators"
  | "generator_variants"
  | "apply_variant"
  | "place_variant"
  | "select"
  | "clear_selection"
  | "camera_goto"
  | "camera_frame"
  | "scene_summary"
  | "get_simulation"
  | "set_simulation"
  | "export_document"
  | "import_document"
  | "dispatch"
  | "undo"
  | "redo"
  | "list_assets"
  | "place_asset"
  | "batch_set_properties"
  | "list_material_assets"
  | "list_material_slots"
  | "upsert_material_asset"
  | "remove_material_asset"
  | "assign_material_asset"
  | "clear_material_assets"
  | "assign_material"
  | "set_object_flags"
> = {
  editor_status: (ctx) => ({
    ok: true,
    result: {
      gameId: ctx.gameId,
      connected: true,
      ...summarizeEditorSession(ctx.session.getState()),
      canUndo: ctx.session.canUndo(),
      canRedo: ctx.session.canRedo(),
      perf: ctx.api.getPerf(),
      mode: ctx.api.getMode(),
    },
  }),
  set_mode: (ctx, request) => {
    if (!EDITOR_RUN_MODES.includes(request.mode)) {
      return { ok: false, error: `unknown mode: ${String(request.mode)} (edit | walk | play | hud)` };
    }
    ctx.api.setMode(request.mode);
    return { ok: true, result: { mode: request.mode } };
  },
  perf_report: (ctx) => {
    const devtoolsGlobal = (globalThis as { __JG_DEVTOOLS?: { snapshot?: () => unknown } }).__JG_DEVTOOLS;
    if (devtoolsGlobal?.snapshot === undefined) {
      return { ok: false, error: "engine devtools not mounted — open the browser editor (F2+D panel) first" };
    }
    return { ok: true, result: { perf: ctx.api.getPerf(), report: devtoolsGlobal.snapshot() } };
  },
  list_layers: (ctx) => {
    const state = ctx.session.getState();
    return { ok: true, result: { kinds: listEditorKinds(state.document), visibility: ctx.api.getVisibility(), document: state.document } };
  },
  list_selection: (ctx) => ({ ok: true, result: { selection: ctx.session.getState().selection } }),
  get_marker: (ctx, request) => {
    const marker = ctx.session.getState().document.markers.find((m) => m.id === request.id);
    return marker === undefined ? { ok: false, error: `marker not found: ${request.id}` } : { ok: true, result: marker };
  },
  get_volume: (ctx, request) => {
    const volume = ctx.session.getState().document.volumes.find((v) => v.id === request.id);
    return volume === undefined ? { ok: false, error: `volume not found: ${request.id}` } : { ok: true, result: volume };
  },
  set_transform: (ctx, request) => {
    const marker = ctx.session.getState().document.markers.find((m) => m.id === request.id);
    const volume = ctx.session.getState().document.volumes.find((v) => v.id === request.id);
    const base = marker?.position ?? volume?.center;
    if (base === undefined) return { ok: false, error: `id not found: ${request.id}` };
    const { applied, state } = ctx.dispatchGuarded({
      type: "setTransform",
      id: request.id,
      position: { x: request.x ?? base.x, y: request.y ?? base.y, z: request.z ?? base.z },
      ...(request.rotationY === undefined ? {} : { rotationY: request.rotationY }),
    });
    if (!applied) return { ok: false, error: `set_transform rejected: ${request.id} is locked` };
    return { ok: true, result: summarizeEditorSession(state) };
  },
  set_volume: (ctx, request) => {
    const volume = ctx.session.getState().document.volumes.find((v) => v.id === request.id);
    if (volume === undefined) return { ok: false, error: `volume not found: ${request.id}` };
    ctx.session.dispatch({
      type: "setVolume",
      id: request.id,
      patch: {
        ...(request.radius === undefined ? {} : { radius: request.radius }),
        ...(request.height === undefined ? {} : { height: request.height }),
        ...(request.x === undefined && request.y === undefined && request.z === undefined
          ? {}
          : { center: { x: request.x ?? volume.center.x, y: request.y ?? volume.center.y, z: request.z ?? volume.center.z } }),
      },
    });
    return { ok: true, result: ctx.session.getState().document.volumes.find((v) => v.id === request.id) };
  },
  set_path: (ctx, request) => {
    const path = ctx.session.getState().document.paths.find((p) => p.id === request.id);
    if (path === undefined) return { ok: false, error: `path not found: ${request.id}` };
    const merged = request.meta === undefined ? undefined : { ...path.meta, ...request.meta };
    const invalid = validateMetaForKind(request.kind ?? path.kind, merged);
    if (invalid !== null) return { ok: false, error: invalid };
    ctx.session.dispatch({
      type: "setPath",
      id: request.id,
      patch: {
        ...(request.kind === undefined ? {} : { kind: request.kind }),
        ...(request.width === undefined ? {} : { width: request.width }),
        ...(request.color === undefined ? {} : { color: request.color }),
        ...(request.label === undefined ? {} : { label: request.label }),
        ...(merged === undefined ? {} : { meta: merged }),
      },
    });
    return { ok: true, result: ctx.session.getState().document.paths.find((p) => p.id === request.id) };
  },
  add_path: (ctx, request) => {
    if (request.points.length < 2) return { ok: false, error: "add_path needs at least 2 points" };
    const kind = request.kind ?? "route";
    const invalid = validateMetaForKind(kind, request.meta);
    if (invalid !== null) return { ok: false, error: invalid };
    const path: EditorPath = {
      id: request.id,
      kind,
      points: request.points.map((point) => ({ x: point.x, y: point.y ?? 0, z: point.z })),
      ...(request.width === undefined ? {} : { width: request.width }),
      ...(request.color === undefined ? {} : { color: request.color }),
      ...(request.label === undefined ? {} : { label: request.label }),
      ...(request.meta === undefined ? {} : { meta: request.meta }),
    };
    // addPath re-ids on a document-global collision, so read the created id back from the selection.
    const { applied, state } = ctx.dispatchGuarded({ type: "addPath", path });
    if (!applied) return { ok: false, error: "add_path rejected: no effect" };
    const createdId = state.selection[0] ?? request.id;
    return { ok: true, result: state.document.paths.find((p) => p.id === createdId) };
  },
  add_marker: (ctx, request) => {
    const invalid = validateMetaForKind(request.kind, request.meta);
    if (invalid !== null) return { ok: false, error: invalid };
    const marker: EditorMarker = {
      id: request.id,
      kind: request.kind,
      position: { x: request.x, y: request.y ?? 0, z: request.z },
      ...(request.rotationY === undefined ? {} : { rotationY: request.rotationY }),
      ...(request.color === undefined ? {} : { color: request.color }),
      ...(request.label === undefined ? {} : { label: request.label }),
      ...(request.catalogId === undefined ? {} : { catalogId: request.catalogId }),
      ...(request.meta === undefined ? {} : { meta: request.meta }),
    };
    // addMarker re-ids on a document-global collision, so read the created id back from the selection.
    const { applied, state } = ctx.dispatchGuarded({ type: "addMarker", marker });
    if (!applied) return { ok: false, error: "add_marker rejected: no effect" };
    const createdId = state.selection[0] ?? request.id;
    return { ok: true, result: state.document.markers.find((m) => m.id === createdId) };
  },
  set_marker: (ctx, request) => {
    const marker = ctx.session.getState().document.markers.find((m) => m.id === request.id);
    if (marker === undefined) return { ok: false, error: `marker not found: ${request.id}` };
    const merged = request.meta === undefined ? undefined : { ...marker.meta, ...request.meta };
    const invalid = validateMetaForKind(request.kind ?? marker.kind, merged);
    if (invalid !== null) return { ok: false, error: invalid };
    ctx.session.dispatch({
      type: "setMarker",
      id: request.id,
      patch: {
        ...(request.kind === undefined ? {} : { kind: request.kind }),
        ...(request.color === undefined ? {} : { color: request.color }),
        ...(request.label === undefined ? {} : { label: request.label }),
        ...(request.rotationY === undefined ? {} : { rotationY: request.rotationY }),
        ...(request.catalogId === undefined ? {} : { catalogId: request.catalogId }),
        ...(merged === undefined ? {} : { meta: merged }),
      },
    });
    return { ok: true, result: ctx.session.getState().document.markers.find((m) => m.id === request.id) };
  },
  set_note: (ctx, request) => {
    const note = ctx.session.getState().document.annotations.find((n) => n.id === request.id);
    if (note === undefined) return { ok: false, error: `note not found: ${request.id}` };
    const merged = request.meta === undefined ? undefined : { ...note.meta, ...request.meta };
    ctx.session.dispatch({
      type: "setNote",
      id: request.id,
      patch: { ...(request.text === undefined ? {} : { text: request.text }), ...(merged === undefined ? {} : { meta: merged }) },
    });
    return { ok: true, result: ctx.session.getState().document.annotations.find((n) => n.id === request.id) };
  },
  set_meta: (ctx, request) => {
    const target = findMetaTarget(ctx.session.getState().document, request.id);
    if (target === null) return { ok: false, error: `object not found: ${request.id}` };
    const merged = { ...target.meta, ...request.patch };
    const invalid = validateMetaForKind(target.kind, merged);
    if (invalid !== null) return { ok: false, error: invalid };
    ctx.session.dispatch(metaPatchCommand(target.target, request.id, merged));
    return { ok: true, result: { id: request.id, kind: target.kind, meta: merged } };
  },
  apply_preset: (ctx, request) => {
    const target = findMetaTarget(ctx.session.getState().document, request.id);
    if (target === null) return { ok: false, error: `object not found: ${request.id}` };
    const definition = getSceneKind(target.kind);
    if (definition === undefined) return { ok: false, error: `kind "${target.kind}" has no registered schema` };
    const preset = findSchemaPreset(definition.schema, request.preset);
    if (preset === undefined) {
      const available = (definition.schema.presets ?? []).map((entry) => entry.id).join(", ") || "none";
      return { ok: false, error: `unknown preset "${request.preset}" for kind "${target.kind}" (available: ${available})` };
    }
    const merged = { ...target.meta, ...preset.values };
    const invalid = validateMetaForKind(target.kind, merged);
    if (invalid !== null) return { ok: false, error: invalid };
    ctx.session.dispatch(metaPatchCommand(target.target, request.id, merged));
    return { ok: true, result: { id: request.id, kind: target.kind, preset: preset.id, meta: merged } };
  },
  list_generators: (_ctx, request) => ({
    ok: true,
    result: {
      generators: listGenerators(request.output).map((definition) => ({
        id: definition.id,
        label: definition.label,
        output: definition.output,
        fields: definition.schema.fields.map((field) => ({
          key: field.key,
          type: field.type,
          ...(field.label === undefined ? {} : { label: field.label }),
          ...(field.group === undefined ? {} : { group: field.group }),
        })),
        presets: (definition.schema.presets ?? []).map((preset) => preset.id),
        lods: definition.lods !== undefined && definition.lods.length > 0 ? [...definition.lods] : [1],
      })),
    },
  }),
  generator_variants: (ctx, request) => {
    let definition: GeneratorDefinition;
    let base: Record<string, unknown> | undefined;
    if (request.id !== undefined) {
      const resolved = objectGenerator(ctx.session.getState().document, request.id);
      if ("error" in resolved) return { ok: false, error: resolved.error };
      if (request.generator !== undefined && request.generator !== resolved.definition.id) {
        return { ok: false, error: `object "${request.id}" uses generator "${resolved.definition.id}", not "${request.generator}"` };
      }
      definition = resolved.definition;
      base = resolved.target.meta;
    } else if (request.generator !== undefined) {
      const found = getGenerator(request.generator);
      if (found === undefined) {
        const available = listGenerators().map((entry) => entry.id).join(", ") || "none";
        return { ok: false, error: `unknown generator "${request.generator}" (available: ${available})` };
      }
      definition = found;
    } else {
      return { ok: false, error: "generator_variants requires id (an object) or generator (a generator id)" };
    }
    const variants = generatorVariants(definition, base, variantGridOptions(request));
    return {
      ok: true,
      result: {
        generator: definition.id,
        ...(request.id === undefined ? {} : { id: request.id }),
        variants: variants.map((variant) => ({ index: variant.index, seed: variant.seed, meta: variant.meta })),
      },
    };
  },
  apply_variant: (ctx, request) => {
    const resolved = objectGenerator(ctx.session.getState().document, request.id);
    if ("error" in resolved) return { ok: false, error: resolved.error };
    const { target, definition } = resolved;
    const picked = variantMeta(definition, target, { ...target.meta }, request);
    if ("error" in picked) return { ok: false, error: `apply_variant ${picked.error}` };
    ctx.session.dispatch(metaPatchCommand(target.target, request.id, picked.meta));
    return {
      ok: true,
      result: {
        id: request.id,
        kind: target.kind,
        generator: definition.id,
        index: picked.index,
        seed: generatorSeed(definition.schema, picked.meta, definition.id),
        meta: picked.meta,
      },
    };
  },
  place_variant: (ctx, request) => {
    const resolved = objectGenerator(ctx.session.getState().document, request.id);
    if ("error" in resolved) return { ok: false, error: resolved.error };
    const { target, definition } = resolved;
    const picked = variantMeta(definition, target, withoutPrefabLink(target.meta), request);
    if ("error" in picked) return { ok: false, error: `place_variant ${picked.error}` };
    const newId = request.newId ?? `${request.id}_v${picked.index ?? "meta"}`;
    const offset = { x: request.dx ?? 0, y: request.dy ?? 0, z: request.dz ?? 0 };
    const command = placedVariantCommand(target, newId, offset, picked.meta);
    if (command === null) return { ok: false, error: `place_variant cannot copy a ${target.target}` };
    // The add commands re-id on a document-global collision, so read the created id back from the selection.
    const { applied, state } = ctx.dispatchGuarded(command);
    if (!applied) return { ok: false, error: "place_variant rejected: no effect" };
    const createdId = state.selection[0] ?? newId;
    return {
      ok: true,
      result: {
        id: createdId,
        source: request.id,
        target: target.target,
        generator: definition.id,
        index: picked.index,
        seed: generatorSeed(definition.schema, picked.meta, definition.id),
        meta: picked.meta,
      },
    };
  },
  select: (ctx, request) => {
    ctx.session.dispatch({ type: "select", ids: request.ids });
    return { ok: true, result: { selection: ctx.session.getState().selection } };
  },
  clear_selection: (ctx) => {
    ctx.session.dispatch({ type: "clearSelection" });
    return { ok: true, result: { selection: [] } };
  },
  camera_goto: (ctx, request) => {
    const placement = cameraPlacement(request);
    if (request.id !== undefined) {
      const state = ctx.session.getState();
      const marker = state.document.markers.find((m) => m.id === request.id);
      const volume = state.document.volumes.find((v) => v.id === request.id);
      const point = marker?.position ?? volume?.center;
      if (point === undefined) return { ok: false, error: `id not found: ${request.id}` };
      const target = { x: point.x, y: point.y, z: point.z, ...placement };
      ctx.api.setFocusTarget(target);
      ctx.session.dispatch({ type: "select", ids: [request.id] });
      return { ok: true, result: { target } };
    }
    if (request.x === undefined || request.z === undefined) {
      return { ok: false, error: "camera_goto requires id or x/z" };
    }
    const target = { x: request.x, y: request.y ?? 0, z: request.z, ...placement };
    ctx.api.setFocusTarget(target);
    return { ok: true, result: { target } };
  },
  camera_frame: (ctx, request) => {
    const bounds = editorDocumentBounds(ctx.session.getState().document);
    if (bounds === null) return { ok: false, error: "document is empty" };
    const center = boundsCenter(bounds);
    const placement = cameraPlacement(request);
    // An aerial is requested when the caller supplies any camera placement. Fit the region into the
    // camera's FOV when no explicit distance is given, so one call frames a whole district from
    // above instead of burying the camera at the last-used distance.
    const wantsAerial = Object.keys(placement).length > 0;
    const resolved =
      wantsAerial && placement.distance === undefined
        ? { ...placement, distance: frameDistanceForBounds(bounds, { fovDeg: 50 }) }
        : placement;
    const target = { ...center, ...resolved };
    ctx.api.setFocusTarget(target);
    return { ok: true, result: { target, bounds } };
  },
  get_simulation: (ctx) => ({ ok: true, result: { simulation: structuredClone(ctx.session.getState().document.simulation ?? {}) } }),
  set_simulation: (ctx, request) => {
    ctx.session.dispatch({ type: "setSimulation", simulation: request.simulation === null ? undefined : request.simulation });
    return { ok: true, result: { simulation: structuredClone(ctx.session.getState().document.simulation ?? {}) } };
  },
  scene_summary: (ctx) => ({
    ok: true,
    result: {
      gameId: ctx.gameId,
      kinds: listEditorKinds(ctx.session.getState().document),
      ...summarizeEditorSession(ctx.session.getState()),
      bounds: editorDocumentBounds(ctx.session.getState().document),
    },
  }),
  export_document: (ctx) => ({ ok: true, result: { json: ctx.session.exportJson(true) } }),
  import_document: (ctx, request) => {
    // Name the expected param instead of letting a missing/mis-keyed value fall into JSON.parse as
    // the literal string "undefined" and surface a cryptic "JSON Parse error: Unexpected identifier".
    if (typeof request.json !== "string") {
      return { ok: false, error: "import_document requires a `json` param — the document JSON text (as export_document returns in result.json)" };
    }
    ctx.session.dispatch({ type: "importJson", json: request.json });
    return { ok: true, result: summarizeEditorSession(ctx.session.getState()) };
  },
  dispatch: (ctx, request) => {
    const { applied, state } = ctx.dispatchGuarded(request.command);
    if (!applied) return { ok: false, error: `${request.command.type} rejected: no effect` };
    return { ok: true, result: summarizeEditorSession(state) };
  },
  undo: (ctx) => {
    const { applied, state } = ctx.dispatchGuarded({ type: "undo" });
    if (!applied) return { ok: false, error: "nothing to undo" };
    return { ok: true, result: summarizeEditorSession(state) };
  },
  redo: (ctx) => {
    const { applied, state } = ctx.dispatchGuarded({ type: "redo" });
    if (!applied) return { ok: false, error: "nothing to redo" };
    return { ok: true, result: summarizeEditorSession(state) };
  },
  list_assets: (ctx) => ({ ok: true, result: { assets: ctx.api.getAssets() } }),
  place_asset: (ctx, request) => {
    const focus = ctx.api.getFocusTarget() ?? { x: 0, y: 0, z: 0 };
    const asset = ctx.api.getAssets().find((entry) => entry.id === request.id);
    const placed = resolvePlaceAsset({
      assetId: request.id,
      position: { x: request.x ?? focus.x, y: request.y ?? focus.y, z: request.z ?? focus.z },
      kind: request.kind,
      knownKind: asset?.kind,
      knownLabel: asset?.label,
      knownUrl: ctx.persistAssetUrls === false ? undefined : asset?.url,
    });
    const placedMarker = toEditorMarker(placed);
    // URL-backed catalog models need a first-class catalogId so AuthoredObjects places the mesh;
    // generator assets keep meta.assetId only (no url) and render through AuthoredGenerators.
    const marker =
      typeof asset?.url === "string" && asset.url.length > 0
        ? { ...placedMarker, catalogId: request.id }
        : placedMarker;
    ctx.session.dispatch({ type: "addMarker", marker });
    return {
      ok: true,
      result: {
        id: marker.id,
        position: marker.position,
        marker: ctx.session.getState().document.markers.find((entry) => entry.id === marker.id),
      },
    };
  },
  batch_set_properties: (ctx, request) => {
    if (!documentHasAnyId(ctx.session.getState().document, request.ids)) {
      return { ok: false, error: "batch_set_properties matched no objects" };
    }
    ctx.session.dispatch({
      type: "batchSetProperties",
      ids: request.ids,
      patch: {
        ...(request.color === undefined ? {} : { color: request.color }),
        ...(request.label === undefined ? {} : { label: request.label }),
        ...(request.meta === undefined ? {} : { meta: request.meta }),
      },
    });
    return { ok: true, result: summarizeEditorSession(ctx.session.getState()) };
  },
  set_object_flags: (ctx, request) => {
    if (!documentHasAnyId(ctx.session.getState().document, request.ids)) {
      return { ok: false, error: "set_object_flags matched no objects" };
    }
    if (request.locked === undefined && request.hidden === undefined) {
      return { ok: false, error: "set_object_flags requires locked and/or hidden" };
    }
    ctx.session.dispatch({
      type: "setObjectFlags",
      ids: request.ids,
      patch: {
        ...(request.locked === undefined ? {} : { locked: request.locked }),
        ...(request.hidden === undefined ? {} : { hidden: request.hidden }),
      },
    });
    return { ok: true, result: summarizeEditorSession(ctx.session.getState()) };
  },
  list_material_assets: (ctx) => ({ ok: true, result: { assets: ctx.session.getState().document.materialAssets ?? [], assignments: ctx.session.getState().document.markers.filter((marker) => marker.meta?.["materialAssignments"] !== undefined).map((marker) => ({ id: marker.id, assignments: marker.meta!["materialAssignments"] })) } }),
  list_material_slots: (ctx, request) => {
    const inventory = ctx.api.getMaterialSlots(request.id);
    return inventory.status === "ready" ? { ok: true, result: inventory } : { ok: false, result: inventory, error: inventory.status === "loading" ? "Material slots are still loading." : inventory.reason };
  },
  upsert_material_asset: (ctx, request) => {
    const asset = parseEditorMaterialAsset(request.asset);
    ctx.session.dispatch({ type: "upsertMaterialAsset", asset }, request.coalesce === undefined ? undefined : { coalesce: request.coalesce });
    return { ok: true, result: { asset } };
  },
  remove_material_asset: (ctx, request) => {
    const result = ctx.session.transaction([{ type: "removeMaterialAsset", id: request.id }]);
    return result.ok ? { ok: true, result: summarizeEditorSession(result.state) } : { ok: false, error: result.error };
  },
  assign_material_asset: (ctx, request) => {
    const result = ctx.session.transaction([{ type: "assignMaterialAsset", ids: request.ids, materialId: request.materialId, selector: request.selector }]);
    return result.ok ? { ok: true, result: summarizeEditorSession(result.state) } : { ok: false, error: result.error };
  },
  clear_material_assets: (ctx, request) => {
    const result = ctx.session.transaction([{ type: "clearMaterialAssets", ids: request.ids }]);
    return result.ok ? { ok: true, result: summarizeEditorSession(result.state) } : { ok: false, error: result.error };
  },
  assign_material: (ctx, request) => {
    if (!documentHasAnyId(ctx.session.getState().document, request.ids)) {
      return { ok: false, error: "assign_material matched no objects" };
    }
    ctx.session.dispatch({ type: "assignMaterial", ids: request.ids, materialId: request.materialId });
    return { ok: true, result: summarizeEditorSession(ctx.session.getState()) };
  },
};
