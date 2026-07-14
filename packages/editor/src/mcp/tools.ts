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
    description: "Report the sculpt heightfield's grid size, bounds, min/max offset, and edited vertex count.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];
