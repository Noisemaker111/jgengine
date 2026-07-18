import type { EditorBridgeRequest } from "../session";

/** The value type a request field is expected to carry. */
export type RpcFieldKind = "string" | "number" | "boolean" | "string[]" | "object" | "object[]" | "vec3" | "value";

/** One field's expected shape in a request; `oneOf`/`nullable`/`required`/`of` refine the check. */
export interface RpcFieldSpec {
  name: string;
  kind: RpcFieldKind;
  nullable?: boolean;
  oneOf?: readonly string[];
  /** True when the field is mandatory — surfaced in the generated MCP `required` array. */
  required?: boolean;
  /** For `object`/`object[]`: the element/object's own field specs, so nested schemas stay expressive. */
  of?: readonly RpcFieldSpec[];
}

// Terse builders so the per-method table below reads as a schema, not a wall of object literals.
const s = (name: string, oneOf?: readonly string[]): RpcFieldSpec => (oneOf === undefined ? { name, kind: "string" } : { name, kind: "string", oneOf });
const sn = (name: string): RpcFieldSpec => ({ name, kind: "string", nullable: true });
const n = (name: string): RpcFieldSpec => ({ name, kind: "number" });
const b = (name: string): RpcFieldSpec => ({ name, kind: "boolean" });
const sa = (name: string): RpcFieldSpec => ({ name, kind: "string[]" });
const o = (name: string): RpcFieldSpec => ({ name, kind: "object" });
const oa = (name: string, of?: readonly RpcFieldSpec[]): RpcFieldSpec => (of === undefined ? { name, kind: "object[]" } : { name, kind: "object[]", of });
const v3 = (name: string): RpcFieldSpec => ({ name, kind: "vec3" });
const val = (name: string): RpcFieldSpec => ({ name, kind: "value" });
/** Marks a field mandatory for MCP schema generation; presence itself is still checked by `handle`. */
const req = (spec: RpcFieldSpec): RpcFieldSpec => ({ ...spec, required: true });

const SHAPE = ["circle", "square"] as const;
const AXES = ["xz", "xy"] as const;

/**
 * Per-method field type table — the single source of truth for the RPC boundary. A field listed here
 * is type-checked when present (see `decodeEditorBridgeRequest`); existence is left to
 * `EditorHostApi.handle` (whose per-method guards return honest `ok:false` diagnostics for
 * missing/unknown targets). Type-checking presented fields is what keeps a fuzzed value — a string
 * where a number belongs, a scalar where an object belongs — from reaching a live session uncoerced.
 * Unknown extra fields are ignored so a superset payload stays forward-compatible.
 *
 * The same table generates the MCP tool `inputSchema`s (see `mcp/tools.ts`), so `required`/`oneOf`/
 * `of` here also shape what agents are told a tool accepts. The `Record<EditorBridgeRequest["method"],
 * …>` type is the lockstep guarantee: adding a method to the union in `session.ts` fails to compile
 * here until it gets a schema, and a stale entry is a compile error too.
 */
export const RPC_FIELD_SCHEMAS: Record<EditorBridgeRequest["method"], readonly RpcFieldSpec[]> = {
  editor_status: [],
  set_mode: [req(s("mode", ["edit", "walk", "play", "hud"]))],
  perf_report: [],
  list_layers: [],
  list_catalogs: [],
  get_catalog_entry: [req(s("catalogId")), req(s("entryId"))],
  set_catalog_entry: [req(s("catalogId")), req(s("entryId")), req(o("patch")), s("label")],
  add_catalog_entry: [req(s("catalogId")), req(s("entryId")), o("meta"), s("label")],
  remove_catalog_entry: [req(s("catalogId")), req(s("entryId"))],
  list_selection: [],
  get_marker: [req(s("id"))],
  get_volume: [req(s("id"))],
  set_transform: [req(s("id")), n("x"), n("y"), n("z"), n("rotationY")],
  set_volume: [req(s("id")), n("radius"), n("height"), n("x"), n("y"), n("z")],
  set_path: [req(s("id")), s("kind"), n("width"), s("color"), s("label"), o("meta")],
  set_marker: [req(s("id")), s("kind"), s("color"), s("label"), n("rotationY"), o("meta")],
  set_note: [req(s("id")), s("text"), o("meta")],
  set_meta: [req(s("id")), req(o("patch"))],
  select: [req(sa("ids"))],
  clear_selection: [],
  camera_goto: [s("id"), n("x"), n("y"), n("z")],
  camera_frame: [],
  scene_summary: [],
  export_document: [],
  import_document: [req(s("json"))],
  dispatch: [req(o("command"))],
  undo: [],
  redo: [],
  list_assets: [],
  place_asset: [req(s("id")), s("kind"), n("x"), n("y"), n("z")],
  create_terrain: [n("width"), n("depth"), n("cellSize"), n("centerX"), n("centerZ")],
  sculpt_terrain: [req(s("mode", ["raise", "lower", "smooth", "flatten", "noise", "ramp"])), req(n("x")), req(n("z")), n("radius"), n("strength"), n("target"), n("toX"), n("toZ"), n("seed"), s("shape", SHAPE)],
  terrain_summary: [],
  paint_terrain: [req(s("surface")), req(n("x")), req(n("z")), n("radius"), s("shape", SHAPE)],
  fill_terrain: [req(sn("surface"))],
  auto_paint: [req(s("surface")), n("minSlope"), n("maxSlope"), n("minHeight"), n("maxHeight")],
  terrain_materials: [],
  terrain_layers: [],
  set_terrain_layers: [req(oa("layers", [req(s("id")), req(s("surface")), n("roughness"), n("tiling"), b("triplanar"), s("tint"), n("opacity")]))],
  blend_terrain: [req(s("surface")), req(n("x")), req(n("z")), n("radius"), n("strength"), s("shape", SHAPE)],
  convert_scatter: [req(s("pathId"))],
  bake_minimap: [n("padding"), n("resolution"), n("waterLevel")],
  add_foliage: [req(oa("points", [req(n("x")), req(n("z"))])), n("density"), s("item"), s("seed"), n("minSpacing")],
  scatter_summary: [],
  set_parent: [req(sa("ids")), req(sn("parentId"))],
  hierarchy: [],
  list_prefabs: [],
  create_prefab: [req(s("id")), req(s("name")), req(sa("ids"))],
  insert_prefab: [req(s("prefabId")), n("x"), n("y"), n("z")],
  detach_prefab_instance: [req(s("instanceId"))],
  delete_prefab: [req(s("prefabId"))],
  list_collections: [],
  create_collection: [req(s("id")), req(s("name")), sa("memberIds")],
  rename_collection: [req(s("id")), req(s("name"))],
  delete_collection: [req(s("id"))],
  set_collection_members: [req(s("id")), req(sa("memberIds"))],
  add_to_collection: [req(s("id")), req(sa("ids"))],
  remove_from_collection: [req(s("id")), req(sa("ids"))],
  set_collection_flags: [req(s("id")), s("color"), b("locked"), b("visible")],
  select_collection: [req(s("id"))],
  batch_set_properties: [req(sa("ids")), s("color"), s("label"), o("meta")],
  assign_material: [req(sa("ids")), req(s("materialId"))],
  list_grids: [],
  get_grid_cell: [req(s("id")), req(n("col")), req(n("row"))],
  add_grid_layer: [req(s("id")), req(s("kind")), req(n("cols")), req(n("rows")), s("label"), n("cellSize"), v3("origin"), s("axes", AXES), s("empty"), oa("palette")],
  remove_grid_layer: [req(s("id"))],
  set_grid_layer: [req(s("id")), s("label"), s("kind"), b("visible"), s("empty"), n("cellSize"), v3("origin"), s("axes", AXES), oa("palette")],
  paint_grid_cells: [req(s("id")), req(oa("cells", [req(n("col")), req(n("row")), req(s("value"))]))],
  fill_grid_rect: [req(s("id")), req(n("col0")), req(n("row0")), req(n("col1")), req(n("row1")), req(s("value"))],
  flood_fill_grid: [req(s("id")), req(n("col")), req(n("row")), req(s("value"))],
  resize_grid_layer: [req(s("id")), req(n("cols")), req(n("rows"))],
  import_grid: [req(s("id")), req(s("kind")), req(s("format", ["ascii", "csv"])), req(s("text")), s("empty"), n("cellSize"), v3("origin"), o("glyphMap"), oa("palette")],
  push_document_patch: [req(o("patch")), b("force")],
  pull_document_patches: [n("sinceRevision")],
  document_revision: [b("includeDocument")],
  push_runtime_delta: [n("at"), oa("entities"), sa("removeIds"), o("tunables")],
  pull_runtime_deltas: [n("sinceSeq"), b("includeSnapshot")],
  runtime_snapshot: [],
  runtime_summary: [],
  runtime_get: [req(s("id")), s("path")],
  runtime_set: [req(s("id")), s("path"), val("value"), o("position"), n("rotationY"), o("values"), b("writeBack")],
  runtime_pause: [],
  runtime_resume: [],
  runtime_step: [n("frames")],
  set_runtime_override: [req(o("entity"))],
  clear_runtime_override: [req(s("id"))],
  write_back_override: [req(s("id"))],
};

/** The set of known RPC method names — exported for meta/manifest tooling and tests. @internal */
export const EDITOR_BRIDGE_METHOD_NAMES: readonly string[] = Object.keys(RPC_FIELD_SCHEMAS).sort();

/** JSON-Schema fragment for one field spec (no `required` — that is aggregated by the object builder). */
function fieldToJsonSchema(spec: RpcFieldSpec): Record<string, unknown> {
  switch (spec.kind) {
    case "string":
      return spec.oneOf !== undefined
        ? { type: "string", enum: [...spec.oneOf] }
        : spec.nullable === true
          ? { type: ["string", "null"] }
          : { type: "string" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "string[]":
      return { type: "array", items: { type: "string" } };
    case "object":
      return spec.of !== undefined ? objectSchema(spec.of) : { type: "object" };
    case "object[]":
      return { type: "array", items: spec.of !== undefined ? objectSchema(spec.of) : { type: "object" } };
    case "vec3":
      return {
        type: "object",
        properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } },
        required: ["x", "y", "z"],
        additionalProperties: false,
      };
    case "value":
      return {};
  }
}

/** Assembles a closed object schema (properties + required + additionalProperties:false) from field specs. */
function objectSchema(specs: readonly RpcFieldSpec[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const spec of specs) {
    properties[spec.name] = fieldToJsonSchema(spec);
    if (spec.required === true) required.push(spec.name);
  }
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

/** Generates the MCP tool `inputSchema` for a method from its {@link RPC_FIELD_SCHEMAS} entry. */
export function buildInputSchema(method: EditorBridgeRequest["method"]): Record<string, unknown> {
  return objectSchema(RPC_FIELD_SCHEMAS[method]);
}
