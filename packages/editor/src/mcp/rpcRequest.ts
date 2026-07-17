import type { EditorBridgeRequest } from "../session";

/** One field-level failure surfaced while decoding an untrusted RPC request. */
export interface RpcRequestDiagnostic {
  path: string;
  message: string;
}

/** Result of {@link decodeEditorBridgeRequest}: a request whose `method` is a real one, or the diagnostic that rejected it. */
export type DecodeRpcRequestResult =
  | { ok: true; request: EditorBridgeRequest }
  | { ok: false; errors: RpcRequestDiagnostic[] };

/** The value type a request field is expected to carry. */
type RpcFieldKind = "string" | "number" | "boolean" | "string[]" | "object" | "object[]" | "vec3" | "value";

/** One field's expected shape in a request; `oneOf`/`nullable` refine the check. */
interface RpcFieldSpec {
  name: string;
  kind: RpcFieldKind;
  nullable?: boolean;
  oneOf?: readonly string[];
}

// Terse builders so the per-method table below reads as a schema, not a wall of object literals.
const s = (name: string, oneOf?: readonly string[]): RpcFieldSpec => (oneOf === undefined ? { name, kind: "string" } : { name, kind: "string", oneOf });
const sn = (name: string): RpcFieldSpec => ({ name, kind: "string", nullable: true });
const n = (name: string): RpcFieldSpec => ({ name, kind: "number" });
const b = (name: string): RpcFieldSpec => ({ name, kind: "boolean" });
const sa = (name: string): RpcFieldSpec => ({ name, kind: "string[]" });
const o = (name: string): RpcFieldSpec => ({ name, kind: "object" });
const oa = (name: string): RpcFieldSpec => ({ name, kind: "object[]" });
const v3 = (name: string): RpcFieldSpec => ({ name, kind: "vec3" });
const val = (name: string): RpcFieldSpec => ({ name, kind: "value" });

const SHAPE = ["circle", "square"] as const;

/**
 * Per-method field type table. A field listed here is type-checked when present; existence is left
 * to `EditorHostApi.handle` (whose per-method guards already return honest `ok:false` diagnostics for
 * missing/unknown targets). Type-checking presented fields is what keeps a fuzzed value — a string
 * where a number belongs, a scalar where an object belongs — from reaching a live session uncoerced.
 * Unknown extra fields are ignored so a superset payload stays forward-compatible.
 *
 * The `Record<EditorBridgeRequest["method"], …>` type is the lockstep guarantee: adding a method to
 * the union in `session.ts` fails to compile here until it gets a schema, and a stale entry is a
 * compile error too — no hand-maintained parallel method list to drift.
 */
const RPC_FIELD_SCHEMAS: Record<EditorBridgeRequest["method"], readonly RpcFieldSpec[]> = {
  editor_status: [],
  set_mode: [s("mode", ["edit", "walk", "play"])],
  perf_report: [],
  list_layers: [],
  list_catalogs: [],
  get_catalog_entry: [s("catalogId"), s("entryId")],
  set_catalog_entry: [s("catalogId"), s("entryId"), o("patch"), s("label")],
  list_selection: [],
  get_marker: [s("id")],
  get_volume: [s("id")],
  set_transform: [s("id"), n("x"), n("y"), n("z"), n("rotationY")],
  set_volume: [s("id"), n("radius"), n("height"), n("x"), n("y"), n("z")],
  set_path: [s("id"), s("kind"), n("width"), s("color"), s("label"), o("meta")],
  set_marker: [s("id"), s("kind"), s("color"), s("label"), n("rotationY"), o("meta")],
  set_note: [s("id"), s("text"), o("meta")],
  set_meta: [s("id"), o("patch")],
  select: [sa("ids")],
  clear_selection: [],
  camera_goto: [s("id"), n("x"), n("y"), n("z")],
  camera_frame: [],
  scene_summary: [],
  export_document: [],
  import_document: [s("json")],
  dispatch: [o("command")],
  undo: [],
  redo: [],
  list_assets: [],
  place_asset: [s("id"), s("kind"), n("x"), n("y"), n("z")],
  create_terrain: [n("width"), n("depth"), n("cellSize"), n("centerX"), n("centerZ")],
  sculpt_terrain: [s("mode"), n("x"), n("z"), n("radius"), n("strength"), n("target"), n("toX"), n("toZ"), n("seed"), s("shape", SHAPE)],
  terrain_summary: [],
  paint_terrain: [s("surface"), n("x"), n("z"), n("radius"), s("shape", SHAPE)],
  fill_terrain: [sn("surface")],
  auto_paint: [s("surface"), n("minSlope"), n("maxSlope"), n("minHeight"), n("maxHeight")],
  terrain_materials: [],
  terrain_layers: [],
  set_terrain_layers: [oa("layers")],
  blend_terrain: [s("surface"), n("x"), n("z"), n("radius"), n("strength"), s("shape", SHAPE)],
  convert_scatter: [s("pathId")],
  add_foliage: [oa("points"), n("density"), s("item"), s("seed"), n("minSpacing")],
  scatter_summary: [],
  set_parent: [sa("ids"), sn("parentId")],
  hierarchy: [],
  list_prefabs: [],
  create_prefab: [s("id"), s("name"), sa("ids")],
  insert_prefab: [s("prefabId"), n("x"), n("y"), n("z")],
  detach_prefab_instance: [s("instanceId")],
  delete_prefab: [s("prefabId")],
  list_collections: [],
  create_collection: [s("id"), s("name"), sa("memberIds")],
  rename_collection: [s("id"), s("name")],
  delete_collection: [s("id")],
  set_collection_members: [s("id"), sa("memberIds")],
  add_to_collection: [s("id"), sa("ids")],
  remove_from_collection: [s("id"), sa("ids")],
  set_collection_flags: [s("id"), s("color"), b("locked"), b("visible")],
  select_collection: [s("id")],
  batch_set_properties: [sa("ids"), s("color"), s("label"), o("meta")],
  assign_material: [sa("ids"), s("materialId")],
  list_grids: [],
  get_grid_cell: [s("id"), n("col"), n("row")],
  add_grid_layer: [s("id"), s("kind"), n("cols"), n("rows"), s("label"), n("cellSize"), v3("origin"), s("axes", ["xz", "xy"]), s("empty"), oa("palette")],
  remove_grid_layer: [s("id")],
  set_grid_layer: [s("id"), s("label"), s("kind"), b("visible"), s("empty"), n("cellSize"), v3("origin"), s("axes", ["xz", "xy"]), oa("palette")],
  paint_grid_cells: [s("id"), oa("cells")],
  fill_grid_rect: [s("id"), n("col0"), n("row0"), n("col1"), n("row1"), s("value")],
  flood_fill_grid: [s("id"), n("col"), n("row"), s("value")],
  resize_grid_layer: [s("id"), n("cols"), n("rows")],
  import_grid: [s("id"), s("kind"), s("format", ["ascii", "csv"]), s("text"), s("empty"), n("cellSize"), v3("origin"), o("glyphMap"), oa("palette")],
  push_document_patch: [o("patch"), b("force")],
  pull_document_patches: [n("sinceRevision")],
  document_revision: [b("includeDocument")],
  push_runtime_delta: [n("at"), oa("entities"), sa("removeIds"), o("tunables")],
  pull_runtime_deltas: [n("sinceSeq"), b("includeSnapshot")],
  runtime_snapshot: [],
  runtime_summary: [],
  runtime_get: [s("id"), s("path")],
  runtime_set: [s("id"), s("path"), val("value"), o("position"), n("rotationY"), o("values"), b("writeBack")],
  runtime_pause: [],
  runtime_resume: [],
  runtime_step: [n("frames")],
  set_runtime_override: [o("entity")],
  clear_runtime_override: [s("id")],
  write_back_override: [s("id")],
};

/** Every `method` an {@link EditorBridgeRequest} may carry, derived from the schema table's keys. */
const EDITOR_BRIDGE_METHODS: ReadonlySet<string> = new Set(Object.keys(RPC_FIELD_SCHEMAS));

/** The set of known RPC method names — exported for meta/manifest tooling and tests. @internal */
export const EDITOR_BRIDGE_METHOD_NAMES: readonly string[] = Object.keys(RPC_FIELD_SCHEMAS).sort();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVec3(value: unknown): boolean {
  return isPlainObject(value) && typeof value.x === "number" && typeof value.y === "number" && typeof value.z === "number";
}

function validateField(value: unknown, spec: RpcFieldSpec, errors: RpcRequestDiagnostic[]): void {
  if (value === undefined) return; // presence is enforced by handle's per-method guards, not here
  const path = `$.${spec.name}`;
  if (value === null) {
    if (spec.nullable !== true) errors.push({ path, message: `expected a ${spec.kind}` });
    return;
  }
  switch (spec.kind) {
    case "string":
      if (typeof value !== "string") errors.push({ path, message: "expected a string" });
      else if (spec.oneOf !== undefined && !spec.oneOf.includes(value)) {
        errors.push({ path, message: `expected one of ${spec.oneOf.join(" | ")}` });
      }
      return;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) errors.push({ path, message: "expected a number" });
      return;
    case "boolean":
      if (typeof value !== "boolean") errors.push({ path, message: "expected a boolean" });
      return;
    case "string[]":
      if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
        errors.push({ path, message: "expected an array of strings" });
      }
      return;
    case "object":
      if (!isPlainObject(value)) errors.push({ path, message: "expected an object" });
      return;
    case "object[]":
      if (!Array.isArray(value) || value.some((entry) => !isPlainObject(entry))) {
        errors.push({ path, message: "expected an array of objects" });
      }
      return;
    case "vec3":
      if (!isVec3(value)) errors.push({ path, message: "expected {x,y,z} numbers" });
      return;
    case "value":
      return;
  }
}

/**
 * Validates an untrusted JSON-decoded RPC payload (from `--rpc`, the HTTP bridge, or an agent tool
 * call) before it reaches `EditorHostApi.handle`: confirms it is a plain object carrying a known
 * `method`, then type-checks every field the method understands against {@link RPC_FIELD_SCHEMAS}.
 * A garbled method, or a field whose value is the wrong type (a string where a number belongs, a
 * scalar where an object belongs), is rejected here with a path-specific diagnostic instead of
 * flowing into a live session on a blind cast. Missing fields and unknown extra fields are left for
 * `handle` to interpret so the boundary stays forward-compatible.
 */
export function decodeEditorBridgeRequest(raw: unknown): DecodeRpcRequestResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: [{ path: "$", message: "expected an RPC request object" }] };
  }
  const record = raw as Record<string, unknown>;
  const method = record.method;
  if (typeof method !== "string") {
    return { ok: false, errors: [{ path: "$.method", message: "expected a string" }] };
  }
  if (!EDITOR_BRIDGE_METHODS.has(method)) {
    return { ok: false, errors: [{ path: "$.method", message: `unknown method "${method}"` }] };
  }
  const errors: RpcRequestDiagnostic[] = [];
  for (const spec of RPC_FIELD_SCHEMAS[method as EditorBridgeRequest["method"]]) {
    validateField(record[spec.name], spec, errors);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, request: raw as EditorBridgeRequest };
}
