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
];
