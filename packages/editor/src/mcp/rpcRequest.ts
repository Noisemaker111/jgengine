import type { EditorBridgeRequest } from "../session";

/** Every `method` an {@link EditorBridgeRequest} may carry — kept in lockstep with the union in `session.ts`. */
const EDITOR_BRIDGE_METHODS: ReadonlySet<EditorBridgeRequest["method"]> = new Set([
  "add_foliage",
  "add_to_collection",
  "assign_material",
  "auto_paint",
  "batch_set_properties",
  "blend_terrain",
  "camera_frame",
  "camera_goto",
  "clear_runtime_override",
  "clear_selection",
  "convert_scatter",
  "create_collection",
  "create_prefab",
  "create_terrain",
  "delete_collection",
  "delete_prefab",
  "detach_prefab_instance",
  "dispatch",
  "document_revision",
  "editor_status",
  "export_document",
  "fill_terrain",
  "get_marker",
  "get_volume",
  "hierarchy",
  "import_document",
  "insert_prefab",
  "get_catalog_entry",
  "list_assets",
  "list_catalogs",
  "list_collections",
  "list_layers",
  "list_prefabs",
  "list_selection",
  "paint_terrain",
  "perf_report",
  "place_asset",
  "pull_document_patches",
  "pull_runtime_deltas",
  "push_document_patch",
  "push_runtime_delta",
  "redo",
  "remove_from_collection",
  "rename_collection",
  "runtime_snapshot",
  "scatter_summary",
  "scene_summary",
  "sculpt_terrain",
  "select",
  "select_collection",
  "set_catalog_entry",
  "set_collection_flags",
  "set_collection_members",
  "set_marker",
  "set_meta",
  "set_mode",
  "set_note",
  "set_parent",
  "set_path",
  "set_runtime_override",
  "set_terrain_layers",
  "set_transform",
  "set_volume",
  "terrain_layers",
  "terrain_materials",
  "terrain_summary",
  "undo",
  "write_back_override",
]);

/** One field-level failure surfaced while decoding an untrusted RPC request. */
export interface RpcRequestDiagnostic {
  path: string;
  message: string;
}

/** Result of {@link decodeEditorBridgeRequest}: a request whose `method` is a real one, or the diagnostic that rejected it. */
export type DecodeRpcRequestResult =
  | { ok: true; request: EditorBridgeRequest }
  | { ok: false; errors: RpcRequestDiagnostic[] };

/**
 * Validates an untrusted JSON-decoded RPC payload (from `--rpc` or the HTTP bridge) before it
 * reaches `EditorHostApi.handle`: confirms it is a plain object carrying a known `method` name.
 * Per-method field shape is still enforced by `handle`'s own dispatch, but a garbled or
 * unknown-method payload is rejected here with a path-specific diagnostic instead of flowing
 * through on a blind cast.
 */
export function decodeEditorBridgeRequest(raw: unknown): DecodeRpcRequestResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: [{ path: "$", message: "expected an RPC request object" }] };
  }
  const method = (raw as Record<string, unknown>).method;
  if (typeof method !== "string") {
    return { ok: false, errors: [{ path: "$.method", message: "expected a string" }] };
  }
  if (!EDITOR_BRIDGE_METHODS.has(method as EditorBridgeRequest["method"])) {
    return { ok: false, errors: [{ path: "$.method", message: `unknown method "${method}"` }] };
  }
  return { ok: true, request: raw as EditorBridgeRequest };
}
