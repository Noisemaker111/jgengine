import type { EditorBridgeRequest } from "../session";
import { buildInputSchema } from "./fieldSpec";

/** One MCP tool descriptor — same verbs as the in-browser host RPC. */
export interface EditorMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Which host verbs are exposed as agent-facing MCP tools, and how each is described. This is a
 * curated subset of the RPC union (internal verbs like `dispatch`/`clear_selection` are omitted);
 * every `inputSchema` is generated from the shared field-schema table in `./fieldSpec` so the schema
 * an agent sees can never drift from what the boundary validates.
 */
const TOOL_DESCRIPTIONS: { name: EditorBridgeRequest["method"]; description: string }[] = [
  { name: "editor_status", description: "Connection status, selection, and layer counts for the active editor session." },
  { name: "list_layers", description: "List marker/volume/path kinds, visibility, and the full editor document." },
  { name: "list_catalogs", description: "List gameplay data catalogs exported by the game (id, label, schema, entry ids)." },
  { name: "get_catalog_entry", description: "Fetch one gameplay catalog entry by catalogId + entryId, including its schema and meta." },
  { name: "set_catalog_entry", description: "Merge-patch a gameplay catalog entry's meta (and optional label). Validated against the catalog ParamSchema; coalesces undo like meta patches." },
  { name: "add_catalog_entry", description: "Add a new row (entry) to a gameplay catalog — e.g. define a new entity in the `entities` catalog. Meta is seeded from the catalog ParamSchema defaults, then overlaid with any provided meta and validated." },
  { name: "remove_catalog_entry", description: "Remove a row (entry) from a gameplay catalog by catalogId + entryId." },
  { name: "add_catalog", description: "Create a brand-new editor-authored gameplay catalog carried on the scene document (id, optional label, optional ParamSchema). Its schema round-trips through save/reload; the catalog becomes row-addressable immediately." },
  { name: "remove_catalog", description: "Remove a catalog from the scene document by catalogId (only affects document-carried catalogs)." },
  { name: "set_catalog_schema", description: "Set or replace a document-authored catalog's ParamSchema (and optional label). Every existing row's meta is re-parsed against the new schema: removed keys drop, added keys default in, range/number values clamp." },
  { name: "list_selection", description: "Return currently selected editor object ids." },
  { name: "get_marker", description: "Fetch one marker by id." },
  { name: "get_volume", description: "Fetch one volume by id." },
  { name: "set_transform", description: "Move a marker or volume center by id." },
  { name: "set_volume", description: "Patch a volume radius/height/center." },
  { name: "set_path", description: "Patch a path's kind/width/color/label and merge-patch its meta (studio sliders: scatter density, pole spacing, …). Validated against the kind schema." },
  { name: "set_marker", description: "Patch a marker's kind/color/label/rotationY and merge-patch its meta. Validated against the kind schema when registered." },
  { name: "set_note", description: "Patch a note's text and merge-patch its meta." },
  { name: "set_meta", description: "Merge-patch the meta bag of any document object (marker/volume/path/note) by id — the generic studio-slider primitive. Rejected if it violates the kind's param schema." },
  { name: "select", description: "Select editor object ids." },
  { name: "camera_goto", description: "Focus the editor camera on an id or world x/z." },
  { name: "camera_frame", description: "Frame the whole editor document." },
  { name: "scene_summary", description: "Compact summary of the editor document and bounds." },
  { name: "export_document", description: "Export the editor document as JSON text." },
  { name: "import_document", description: "Replace the session document from JSON text." },
  { name: "push_document_patch", description: "Apply a versioned document patch (snapshot or commands) over the live-sync bus. Document is authoritative; force skips baseRevision checks." },
  { name: "pull_document_patches", description: "Pull document patches after a known revision (live-sync stream for a running game)." },
  { name: "document_revision", description: "Current live-sync document revision; optionally include the full document." },
  { name: "push_runtime_delta", description: "Publish ephemeral runtime state (entities/tunables) on the reverse channel — does not mutate the document." },
  { name: "pull_runtime_deltas", description: "Pull runtime state deltas after a known seq (feeds play-mode inspector)." },
  { name: "runtime_snapshot", description: "Full ephemeral runtime state snapshot from the reverse channel." },
  { name: "runtime_summary", description: "Compact play-mode inspector summary: entities, tunables, overrides, pause/step state." },
  { name: "runtime_get", description: "Read one live runtime entity (or path) or a tunable:id from the reverse channel." },
  { name: "runtime_set", description: "Play-mode poke: set entity position/rotation/values or a tunable. writeBack (default true) promotes document-linked edits into an undoable scene patch." },
  { name: "runtime_pause", description: "Pause simulation while in play mode (pause-and-poke)." },
  { name: "runtime_resume", description: "Resume simulation after a play-mode pause." },
  { name: "runtime_step", description: "While paused, run N simulation frames (default 1) then re-pause." },
  { name: "set_runtime_override", description: "Set an ephemeral runtime override (play-mode poke). Document stays authoritative until write_back_override." },
  { name: "clear_runtime_override", description: "Drop an ephemeral runtime override without writing it into the document." },
  { name: "write_back_override", description: "Promote an ephemeral runtime override into an undoable document edit (document becomes source of truth)." },
  { name: "undo", description: "Undo the last structural editor edit." },
  { name: "redo", description: "Redo the last undone editor edit." },
  { name: "list_assets", description: "List placeable assets registered with the editor session." },
  { name: "place_asset", description: "Place an asset as a marker at focus or given coordinates." },
  { name: "set_mode", description: "Switch the live editor between edit, walk, play, and hud (HUD-layout authoring) modes." },
  { name: "perf_report", description: "Frame-time breakdown from engine devtools: fps, sim phases, and lag culprit hints." },
  { name: "create_terrain", description: "Create an editable sculpt heightfield over the scene (width/depth/cellSize)." },
  { name: "sculpt_terrain", description: "Apply one sculpt brush (raise/lower/smooth/flatten/noise/ramp) at x/z as an undoable stroke." },
  { name: "terrain_summary", description: "Report the sculpt heightfield's grid size, bounds, min/max offset, edited vertices, and painted cells." },
  { name: "paint_terrain", description: "Paint a terrain material (grass/dirt/rock/…) at x/z as an undoable stroke." },
  { name: "fill_terrain", description: "Fill the whole terrain with one material, or null to clear all painted surfaces." },
  { name: "auto_paint", description: "Paint a material into every cell matching a slope/height rule (e.g. rock on steep, snow up high)." },
  { name: "terrain_materials", description: "List the terrain paint palette (material id, label, color)." },
  { name: "terrain_layers", description: "List the terrain material layer stack (id, surface, roughness/tiling/triplanar/tint/opacity)." },
  { name: "set_terrain_layers", description: "Replace the reorderable terrain material layer stack; a params-only edit keeps painted blends." },
  { name: "blend_terrain", description: "Blend-paint a material layer's weight at x/z (weighted multi-layer blend); auto-adds the layer." },
  { name: "convert_scatter", description: "Detach a foliage/scatter region into individually-editable placed prop markers, removing the region." },
  { name: "add_foliage", description: "Add a foliage/scatter region from a closed polygon (≥3 x/z points) with density and item." },
  { name: "scatter_summary", description: "Count foliage/scatter regions and their total deterministic instance placements." },
  { name: "set_parent", description: "Parent objects under another (or null to unparent); cycles are refused. Moving a parent moves its subtree." },
  { name: "hierarchy", description: "The scene's parent/child tree: root ids and each root's direct children." },
  { name: "list_prefabs", description: "List the document's reusable prefab stamps (id, name, fragment content)." },
  { name: "create_prefab", description: "Make a reusable prefab from selected ids, centered on their own bounds." },
  { name: "insert_prefab", description: "Insert a fresh, tagged instance of a prefab at the camera focus or given x/y/z." },
  { name: "detach_prefab_instance", description: "Strip the prefab link from every object in an instance, keeping its content." },
  { name: "delete_prefab", description: "Remove a prefab from the library (placed instances are unaffected)." },
  { name: "list_collections", description: "List named collections / selection sets (id, name, memberIds, color, locked, visible)." },
  { name: "create_collection", description: "Create a named collection / selection set from member ids." },
  { name: "rename_collection", description: "Rename a collection." },
  { name: "delete_collection", description: "Delete a collection (its member objects are untouched)." },
  { name: "set_collection_members", description: "Replace a collection's member ids wholesale." },
  { name: "add_to_collection", description: "Add ids to a collection's membership." },
  { name: "remove_from_collection", description: "Remove ids from a collection's membership." },
  { name: "set_collection_flags", description: "Patch a collection's color / locked / visible flags." },
  { name: "select_collection", description: "Restore the current selection to a collection's member ids." },
  { name: "batch_set_properties", description: "Patch color/label/meta across every listed id in one dispatch, regardless of kind." },
  { name: "assign_material", description: "Stamp meta.materialId on every listed object — the drag-drop material assignment primitive." },
  { name: "list_grids", description: "List the scene document's grid/tile layers (id, kind, bounds, cell count, palette ids)." },
  { name: "get_grid_cell", description: "Eyedrop: read the value id at col,row of a grid layer (empty value for unset/out-of-bounds cells)." },
  { name: "add_grid_layer", description: "Create an empty grid/tile layer on the scene document with the given bounds, cell size, and palette." },
  { name: "remove_grid_layer", description: "Delete a grid/tile layer from the scene document by id." },
  { name: "set_grid_layer", description: "Patch a grid layer's metadata — label, kind, visibility, empty value, cell size, origin, axes, or palette." },
  { name: "paint_grid_cells", description: "Paint or erase grid cells (value equal to the layer's empty value erases). One undo step for the whole batch." },
  { name: "fill_grid_rect", description: "Rectangle tool: fill the inclusive col0,row0..col1,row1 rectangle of a grid layer with one value." },
  { name: "flood_fill_grid", description: "Bucket tool: flood-fill the contiguous region sharing the seed cell's value with a new value." },
  { name: "resize_grid_layer", description: "Resize a grid layer's bounds to cols x rows, trimming any cells outside the new extent." },
  { name: "import_grid", description: "Import an ASCII/glyph map or CSV into a new grid layer (the ASCII/CSV is an import adapter, not the stored form)." },
];

/** Full set of MCP tools an agent can call to drive the live scene editor. */
export const EDITOR_MCP_TOOLS: readonly EditorMcpTool[] = TOOL_DESCRIPTIONS.map(({ name, description }) => ({
  name,
  description,
  inputSchema: buildInputSchema(name),
}));
