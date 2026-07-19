import {
  editorDocumentBounds,
  listEditorKinds,
  summarizeEditorSession,
  type EditorDocument,
  type EditorMarker,
  type EditorPath,
} from "@jgengine/core/editor/index";
import { resolvePlaceAsset, toEditorMarker } from "@jgengine/core/world/placeAsset";
import { findSchemaPreset, getSceneKind, validateParams } from "@jgengine/core/scene/sceneKinds";

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

/** Which document collection an object lives in, plus its current kind + meta — for generic `set_meta`. */
function findMetaTarget(
  doc: EditorDocument,
  id: string,
): { target: "marker" | "volume" | "path" | "note"; kind: string; meta: Record<string, unknown> | undefined } | null {
  const marker = doc.markers.find((m) => m.id === id);
  if (marker !== undefined) return { target: "marker", kind: marker.kind, meta: marker.meta };
  const volume = doc.volumes.find((v) => v.id === id);
  if (volume !== undefined) return { target: "volume", kind: volume.kind, meta: volume.meta };
  const path = doc.paths.find((p) => p.id === id);
  if (path !== undefined) return { target: "path", kind: path.kind, meta: path.meta };
  const note = doc.annotations.find((n) => n.id === id);
  if (note !== undefined) return { target: "note", kind: "note", meta: note.meta };
  return null;
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
  | "select"
  | "clear_selection"
  | "camera_goto"
  | "camera_frame"
  | "scene_summary"
  | "export_document"
  | "import_document"
  | "dispatch"
  | "undo"
  | "redo"
  | "list_assets"
  | "place_asset"
  | "batch_set_properties"
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
    ctx.session.dispatch(
      target.target === "marker"
        ? { type: "setMarker", id: request.id, patch: { meta: merged } }
        : target.target === "volume"
          ? { type: "setVolume", id: request.id, patch: { meta: merged } }
          : target.target === "path"
            ? { type: "setPath", id: request.id, patch: { meta: merged } }
            : { type: "setNote", id: request.id, patch: { meta: merged } },
    );
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
    ctx.session.dispatch(
      target.target === "marker"
        ? { type: "setMarker", id: request.id, patch: { meta: merged } }
        : target.target === "volume"
          ? { type: "setVolume", id: request.id, patch: { meta: merged } }
          : target.target === "path"
            ? { type: "setPath", id: request.id, patch: { meta: merged } }
            : { type: "setNote", id: request.id, patch: { meta: merged } },
    );
    return { ok: true, result: { id: request.id, kind: target.kind, preset: preset.id, meta: merged } };
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
      knownUrl: asset?.url,
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
  assign_material: (ctx, request) => {
    if (!documentHasAnyId(ctx.session.getState().document, request.ids)) {
      return { ok: false, error: "assign_material matched no objects" };
    }
    ctx.session.dispatch({ type: "assignMaterial", ids: request.ids, materialId: request.materialId });
    return { ok: true, result: summarizeEditorSession(ctx.session.getState()) };
  },
};
