/** One MCP tool descriptor — same verbs as the in-browser host RPC. */
export interface EditorMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Full set of MCP tools an agent can call to drive the live scene editor. */
export const EDITOR_MCP_TOOLS: readonly EditorMcpTool[] = [
  {
    name: "editor_status",
    description: "Connection status, selection, and layer counts for the active editor session.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_layers",
    description: "List marker/volume/path kinds, visibility, and the full editor document.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_catalogs",
    description: "List gameplay data catalogs exported by the game (id, label, schema, entry ids).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_catalog_entry",
    description: "Fetch one gameplay catalog entry by catalogId + entryId, including its schema and meta.",
    inputSchema: {
      type: "object",
      properties: { catalogId: { type: "string" }, entryId: { type: "string" } },
      required: ["catalogId", "entryId"],
      additionalProperties: false,
    },
  },
  {
    name: "set_catalog_entry",
    description: "Merge-patch a gameplay catalog entry's meta (and optional label). Validated against the catalog ParamSchema; coalesces undo like meta patches.",
    inputSchema: {
      type: "object",
      properties: {
        catalogId: { type: "string" },
        entryId: { type: "string" },
        patch: { type: "object" },
        label: { type: "string" },
      },
      required: ["catalogId", "entryId", "patch"],
      additionalProperties: false,
    },
  },
  {
    name: "add_catalog_entry",
    description: "Add a new row (entry) to a gameplay catalog — e.g. define a new entity in the `entities` catalog. Meta is seeded from the catalog ParamSchema defaults, then overlaid with any provided meta and validated.",
    inputSchema: {
      type: "object",
      properties: {
        catalogId: { type: "string" },
        entryId: { type: "string" },
        meta: { type: "object" },
        label: { type: "string" },
      },
      required: ["catalogId", "entryId"],
      additionalProperties: false,
    },
  },
  {
    name: "remove_catalog_entry",
    description: "Remove a row (entry) from a gameplay catalog by catalogId + entryId.",
    inputSchema: {
      type: "object",
      properties: { catalogId: { type: "string" }, entryId: { type: "string" } },
      required: ["catalogId", "entryId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_selection",
    description: "Return currently selected editor object ids.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_marker",
    description: "Fetch one marker by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_volume",
    description: "Fetch one volume by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_transform",
    description: "Move a marker or volume center by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
        rotationY: { type: "number" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_volume",
    description: "Patch a volume radius/height/center.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        radius: { type: "number" },
        height: { type: "number" },
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_path",
    description: "Patch a path's kind/width/color/label and merge-patch its meta (studio sliders: scatter density, pole spacing, …). Validated against the kind schema.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        kind: { type: "string" },
        width: { type: "number" },
        color: { type: "string" },
        label: { type: "string" },
        meta: { type: "object" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_marker",
    description: "Patch a marker's kind/color/label/rotationY and merge-patch its meta. Validated against the kind schema when registered.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        kind: { type: "string" },
        color: { type: "string" },
        label: { type: "string" },
        rotationY: { type: "number" },
        meta: { type: "object" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_note",
    description: "Patch a note's text and merge-patch its meta.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, text: { type: "string" }, meta: { type: "object" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_meta",
    description: "Merge-patch the meta bag of any document object (marker/volume/path/note) by id — the generic studio-slider primitive. Rejected if it violates the kind's param schema.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, patch: { type: "object" } },
      required: ["id", "patch"],
      additionalProperties: false,
    },
  },
  {
    name: "select",
    description: "Select editor object ids.",
    inputSchema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" } } },
      required: ["ids"],
      additionalProperties: false,
    },
  },
  {
    name: "camera_goto",
    description: "Focus the editor camera on an id or world x/z.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "camera_frame",
    description: "Frame the whole editor document.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "scene_summary",
    description: "Compact summary of the editor document and bounds.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "export_document",
    description: "Export the editor document as JSON text.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "import_document",
    description: "Replace the session document from JSON text.",
    inputSchema: {
      type: "object",
      properties: { json: { type: "string" } },
      required: ["json"],
      additionalProperties: false,
    },
  },
  {
    name: "push_document_patch",
    description:
      "Apply a versioned document patch (snapshot or commands) over the live-sync bus. Document is authoritative; force skips baseRevision checks.",
    inputSchema: {
      type: "object",
      properties: {
        patch: { type: "object" },
        force: { type: "boolean" },
      },
      required: ["patch"],
      additionalProperties: false,
    },
  },
  {
    name: "pull_document_patches",
    description: "Pull document patches after a known revision (live-sync stream for a running game).",
    inputSchema: {
      type: "object",
      properties: { sinceRevision: { type: "number" } },
      additionalProperties: false,
    },
  },
  {
    name: "document_revision",
    description: "Current live-sync document revision; optionally include the full document.",
    inputSchema: {
      type: "object",
      properties: { includeDocument: { type: "boolean" } },
      additionalProperties: false,
    },
  },
  {
    name: "push_runtime_delta",
    description:
      "Publish ephemeral runtime state (entities/tunables) on the reverse channel — does not mutate the document.",
    inputSchema: {
      type: "object",
      properties: {
        at: { type: "number" },
        entities: { type: "array" },
        removeIds: { type: "array", items: { type: "string" } },
        tunables: { type: "object" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "pull_runtime_deltas",
    description: "Pull runtime state deltas after a known seq (feeds play-mode inspector).",
    inputSchema: {
      type: "object",
      properties: {
        sinceSeq: { type: "number" },
        includeSnapshot: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "runtime_snapshot",
    description: "Full ephemeral runtime state snapshot from the reverse channel.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "runtime_summary",
    description: "Compact play-mode inspector summary: entities, tunables, overrides, pause/step state.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "runtime_get",
    description: "Read one live runtime entity (or path) or a tunable:id from the reverse channel.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        path: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "runtime_set",
    description:
      "Play-mode poke: set entity position/rotation/values or a tunable. writeBack (default true) promotes document-linked edits into an undoable scene patch.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        path: { type: "string" },
        value: {},
        position: { type: "object" },
        rotationY: { type: "number" },
        values: { type: "object" },
        writeBack: { type: "boolean" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "runtime_pause",
    description: "Pause simulation while in play mode (pause-and-poke).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "runtime_resume",
    description: "Resume simulation after a play-mode pause.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "runtime_step",
    description: "While paused, run N simulation frames (default 1) then re-pause.",
    inputSchema: {
      type: "object",
      properties: { frames: { type: "number" } },
      additionalProperties: false,
    },
  },
  {
    name: "set_runtime_override",
    description: "Set an ephemeral runtime override (play-mode poke). Document stays authoritative until write_back_override.",
    inputSchema: {
      type: "object",
      properties: { entity: { type: "object" } },
      required: ["entity"],
      additionalProperties: false,
    },
  },
  {
    name: "clear_runtime_override",
    description: "Drop an ephemeral runtime override without writing it into the document.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "write_back_override",
    description: "Promote an ephemeral runtime override into an undoable document edit (document becomes source of truth).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "undo",
    description: "Undo the last structural editor edit.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "redo",
    description: "Redo the last undone editor edit.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_assets",
    description: "List placeable assets registered with the editor session.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "place_asset",
    description: "Place an asset as a marker at focus or given coordinates.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        assetId: { type: "string" },
        kind: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
      },
      anyOf: [{ required: ["id"] }, { required: ["assetId"] }],
      additionalProperties: false,
    },
  },
  {
    name: "set_mode",
    description: "Switch the live editor between edit, walk, and play modes.",
    inputSchema: {
      type: "object",
      properties: { mode: { type: "string", enum: ["edit", "walk", "play"] } },
      required: ["mode"],
      additionalProperties: false,
    },
  },
  {
    name: "perf_report",
    description: "Frame-time breakdown from engine devtools: fps, sim phases, and lag culprit hints.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_terrain",
    description: "Create an editable sculpt heightfield over the scene (width/depth/cellSize).",
    inputSchema: {
      type: "object",
      properties: {
        width: { type: "number" },
        depth: { type: "number" },
        cellSize: { type: "number" },
        centerX: { type: "number" },
        centerZ: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "sculpt_terrain",
    description: "Apply one sculpt brush (raise/lower/smooth/flatten/noise/ramp) at x/z as an undoable stroke.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["raise", "lower", "smooth", "flatten", "noise", "ramp"] },
        x: { type: "number" },
        z: { type: "number" },
        radius: { type: "number" },
        strength: { type: "number" },
        target: { type: "number" },
        toX: { type: "number" },
        toZ: { type: "number" },
        seed: { type: "number" },
        shape: { type: "string", enum: ["circle", "square"] },
      },
      required: ["mode", "x", "z"],
      additionalProperties: false,
    },
  },
  {
    name: "terrain_summary",
    description: "Report the sculpt heightfield's grid size, bounds, min/max offset, edited vertices, and painted cells.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "paint_terrain",
    description: "Paint a terrain material (grass/dirt/rock/…) at x/z as an undoable stroke.",
    inputSchema: {
      type: "object",
      properties: {
        surface: { type: "string" },
        x: { type: "number" },
        z: { type: "number" },
        radius: { type: "number" },
        shape: { type: "string", enum: ["circle", "square"] },
      },
      required: ["surface", "x", "z"],
      additionalProperties: false,
    },
  },
  {
    name: "fill_terrain",
    description: "Fill the whole terrain with one material, or null to clear all painted surfaces.",
    inputSchema: {
      type: "object",
      properties: { surface: { type: ["string", "null"] } },
      required: ["surface"],
      additionalProperties: false,
    },
  },
  {
    name: "auto_paint",
    description: "Paint a material into every cell matching a slope/height rule (e.g. rock on steep, snow up high).",
    inputSchema: {
      type: "object",
      properties: {
        surface: { type: "string" },
        minSlope: { type: "number" },
        maxSlope: { type: "number" },
        minHeight: { type: "number" },
        maxHeight: { type: "number" },
      },
      required: ["surface"],
      additionalProperties: false,
    },
  },
  {
    name: "terrain_materials",
    description: "List the terrain paint palette (material id, label, color).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "terrain_layers",
    description: "List the terrain material layer stack (id, surface, roughness/tiling/triplanar/tint/opacity).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "set_terrain_layers",
    description: "Replace the reorderable terrain material layer stack; a params-only edit keeps painted blends.",
    inputSchema: {
      type: "object",
      properties: {
        layers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              surface: { type: "string" },
              roughness: { type: "number" },
              tiling: { type: "number" },
              triplanar: { type: "boolean" },
              tint: { type: "string" },
              opacity: { type: "number" },
            },
            required: ["id", "surface"],
            additionalProperties: false,
          },
        },
      },
      required: ["layers"],
      additionalProperties: false,
    },
  },
  {
    name: "blend_terrain",
    description: "Blend-paint a material layer's weight at x/z (weighted multi-layer blend); auto-adds the layer.",
    inputSchema: {
      type: "object",
      properties: {
        surface: { type: "string" },
        x: { type: "number" },
        z: { type: "number" },
        radius: { type: "number" },
        strength: { type: "number" },
        shape: { type: "string", enum: ["circle", "square"] },
      },
      required: ["surface", "x", "z"],
      additionalProperties: false,
    },
  },
  {
    name: "convert_scatter",
    description: "Detach a foliage/scatter region into individually-editable placed prop markers, removing the region.",
    inputSchema: {
      type: "object",
      properties: { pathId: { type: "string" } },
      required: ["pathId"],
      additionalProperties: false,
    },
  },
  {
    name: "add_foliage",
    description: "Add a foliage/scatter region from a closed polygon (≥3 x/z points) with density and item.",
    inputSchema: {
      type: "object",
      properties: {
        points: {
          type: "array",
          items: { type: "object", properties: { x: { type: "number" }, z: { type: "number" } }, required: ["x", "z"], additionalProperties: false },
        },
        density: { type: "number" },
        item: { type: "string" },
        seed: { type: "string" },
        minSpacing: { type: "number" },
      },
      required: ["points"],
      additionalProperties: false,
    },
  },
  {
    name: "scatter_summary",
    description: "Count foliage/scatter regions and their total deterministic instance placements.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "set_parent",
    description: "Parent objects under another (or null to unparent); cycles are refused. Moving a parent moves its subtree.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        parentId: { type: ["string", "null"] },
      },
      required: ["ids", "parentId"],
      additionalProperties: false,
    },
  },
  {
    name: "hierarchy",
    description: "The scene's parent/child tree: root ids and each root's direct children.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_prefabs",
    description: "List the document's reusable prefab stamps (id, name, fragment content).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_prefab",
    description: "Make a reusable prefab from selected ids, centered on their own bounds.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        ids: { type: "array", items: { type: "string" } },
      },
      required: ["id", "name", "ids"],
      additionalProperties: false,
    },
  },
  {
    name: "insert_prefab",
    description: "Insert a fresh, tagged instance of a prefab at the camera focus or given x/y/z.",
    inputSchema: {
      type: "object",
      properties: {
        prefabId: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
      },
      required: ["prefabId"],
      additionalProperties: false,
    },
  },
  {
    name: "detach_prefab_instance",
    description: "Strip the prefab link from every object in an instance, keeping its content.",
    inputSchema: {
      type: "object",
      properties: { instanceId: { type: "string" } },
      required: ["instanceId"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_prefab",
    description: "Remove a prefab from the library (placed instances are unaffected).",
    inputSchema: {
      type: "object",
      properties: { prefabId: { type: "string" } },
      required: ["prefabId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_collections",
    description: "List named collections / selection sets (id, name, memberIds, color, locked, visible).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_collection",
    description: "Create a named collection / selection set from member ids.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        memberIds: { type: "array", items: { type: "string" } },
      },
      required: ["id", "name"],
      additionalProperties: false,
    },
  },
  {
    name: "rename_collection",
    description: "Rename a collection.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_collection",
    description: "Delete a collection (its member objects are untouched).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_collection_members",
    description: "Replace a collection's member ids wholesale.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, memberIds: { type: "array", items: { type: "string" } } },
      required: ["id", "memberIds"],
      additionalProperties: false,
    },
  },
  {
    name: "add_to_collection",
    description: "Add ids to a collection's membership.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, ids: { type: "array", items: { type: "string" } } },
      required: ["id", "ids"],
      additionalProperties: false,
    },
  },
  {
    name: "remove_from_collection",
    description: "Remove ids from a collection's membership.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, ids: { type: "array", items: { type: "string" } } },
      required: ["id", "ids"],
      additionalProperties: false,
    },
  },
  {
    name: "set_collection_flags",
    description: "Patch a collection's color / locked / visible flags.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        color: { type: "string" },
        locked: { type: "boolean" },
        visible: { type: "boolean" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "select_collection",
    description: "Restore the current selection to a collection's member ids.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "batch_set_properties",
    description: "Patch color/label/meta across every listed id in one dispatch, regardless of kind.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        color: { type: "string" },
        label: { type: "string" },
        meta: { type: "object" },
      },
      required: ["ids"],
      additionalProperties: false,
    },
  },
  {
    name: "assign_material",
    description: "Stamp meta.materialId on every listed object — the drag-drop material assignment primitive.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        materialId: { type: "string" },
      },
      required: ["ids", "materialId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_grids",
    description: "List the scene document's grid/tile layers (id, kind, bounds, cell count, palette ids).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_grid_cell",
    description: "Eyedrop: read the value id at col,row of a grid layer (empty value for unset/out-of-bounds cells).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, col: { type: "number" }, row: { type: "number" } },
      required: ["id", "col", "row"],
      additionalProperties: false,
    },
  },
  {
    name: "add_grid_layer",
    description: "Create an empty grid/tile layer on the scene document with the given bounds, cell size, and palette.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        kind: { type: "string" },
        cols: { type: "number" },
        rows: { type: "number" },
        label: { type: "string" },
        cellSize: { type: "number" },
        origin: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } }, required: ["x", "y", "z"], additionalProperties: false },
        axes: { type: "string", enum: ["xz", "xy"] },
        empty: { type: "string" },
        palette: { type: "array", items: { type: "object" } },
      },
      required: ["id", "kind", "cols", "rows"],
      additionalProperties: false,
    },
  },
  {
    name: "remove_grid_layer",
    description: "Delete a grid/tile layer from the scene document by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_grid_layer",
    description: "Patch a grid layer's metadata — label, kind, visibility, empty value, cell size, origin, axes, or palette.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        kind: { type: "string" },
        visible: { type: "boolean" },
        empty: { type: "string" },
        cellSize: { type: "number" },
        origin: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } }, required: ["x", "y", "z"], additionalProperties: false },
        axes: { type: "string", enum: ["xz", "xy"] },
        palette: { type: "array", items: { type: "object" } },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "paint_grid_cells",
    description: "Paint or erase grid cells (value equal to the layer's empty value erases). One undo step for the whole batch.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        cells: {
          type: "array",
          items: {
            type: "object",
            properties: { col: { type: "number" }, row: { type: "number" }, value: { type: "string" } },
            required: ["col", "row", "value"],
            additionalProperties: false,
          },
        },
      },
      required: ["id", "cells"],
      additionalProperties: false,
    },
  },
  {
    name: "fill_grid_rect",
    description: "Rectangle tool: fill the inclusive col0,row0..col1,row1 rectangle of a grid layer with one value.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        col0: { type: "number" },
        row0: { type: "number" },
        col1: { type: "number" },
        row1: { type: "number" },
        value: { type: "string" },
      },
      required: ["id", "col0", "row0", "col1", "row1", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "flood_fill_grid",
    description: "Bucket tool: flood-fill the contiguous region sharing the seed cell's value with a new value.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        col: { type: "number" },
        row: { type: "number" },
        value: { type: "string" },
      },
      required: ["id", "col", "row", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "resize_grid_layer",
    description: "Resize a grid layer's bounds to cols x rows, trimming any cells outside the new extent.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, cols: { type: "number" }, rows: { type: "number" } },
      required: ["id", "cols", "rows"],
      additionalProperties: false,
    },
  },
  {
    name: "import_grid",
    description: "Import an ASCII/glyph map or CSV into a new grid layer (the ASCII/CSV is an import adapter, not the stored form).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        kind: { type: "string" },
        format: { type: "string", enum: ["ascii", "csv"] },
        text: { type: "string" },
        empty: { type: "string" },
        cellSize: { type: "number" },
        origin: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } }, required: ["x", "y", "z"], additionalProperties: false },
        glyphMap: { type: "object" },
        palette: { type: "array", items: { type: "object" } },
      },
      required: ["id", "kind", "format", "text"],
      additionalProperties: false,
    },
  },
];
