# Editor agent panel (embedded)

Toolbar **Agent** opens a dockable chat panel in `EditorChrome`. Tool calls use the same editor RPC verbs as the MCP/CLI bridge and the GUI — one session undo stack, interleaved with human edits.

## Env

| Variable | Role |
| --- | --- |
| `JGENGINE_EDITOR_AGENT_URL` | Remote agent HTTP endpoint (POST JSON). Unset → offline local command agent. |
| `JGENGINE_EDITOR_AGENT_KEY` | Optional Bearer token for the endpoint. |
| `ANTHROPIC_API_KEY` | Fallback when `JGENGINE_EDITOR_AGENT_KEY` is unset. |

Panel **Config** can also store URL/key in `localStorage` for browser sessions.

## Protocol

```
POST $JGENGINE_EDITOR_AGENT_URL
Authorization: Bearer $JGENGINE_EDITOR_AGENT_KEY   # optional
Content-Type: application/json

{
  "messages": [{ "role": "user"|"assistant"|"tool"|"system", "content": string, "toolCallId"?: string, "name"?: string }],
  "context": { "gameId", "mode", "selection", "focus", "canUndo", "canRedo", "summary" },
  "tools": [ /* EDITOR_MCP_TOOLS */ ]
}

→ { "message"?: string, "toolCalls"?: [{ "id", "name", "arguments" }] }
```

Each `toolCalls[].name` is an editor RPC method (`set_transform`, `select`, …). The panel runs them via `routeToolCall` → `EditorHostApi.handle`.

## Pure API (`@jgengine/editor`)

```ts
import {
  packAgentContext,
  routeToolCall,
  runAgentTurn,
  undoAgentPatch,
  createDefaultAgentEndpoint,
  createHttpAgentEndpoint,
  resolveAgentEndpointConfig,
} from "@jgengine/editor";

const context = packAgentContext(api);
const endpoint = createDefaultAgentEndpoint(resolveAgentEndpointConfig());
// or: createHttpAgentEndpoint({ url, apiKey })

const turn = await runAgentTurn({
  api,
  endpoint,
  history: [],
  userMessage: "move boss to 10,0,-5",
});
// turn.patches — document edits; human undoes top entry:
undoAgentPatch(api, turn.patches, turn.patches.at(-1)!.id);

routeToolCall(api, { id: "1", name: "set_transform", arguments: { id: "boss", x: 10, y: 0, z: -5 } });
```

## Local agent (no URL)

Commands: `/help`, `/status`, `/summary`, `/selection`, `/frame`, `/undo`, `/redo`, `/clear`, `/select <id…>`, `/goto <id>`, `move <id> <x> <y> <z>`.

## Grid / tile layers

Grid-addressed content (rooms, tactics maps, farms, nav/rule layers) lives on the scene document as
`EditorDocument.grids: EditorGridLayer[]` — a sparse `col,row → value-id` map with `origin`,
`cellSize`, `axes` (`"xz"` top-down / `"xy"` side view), `cols`/`rows` bounds, an `empty` value, and
a `palette` carrying each value's glyph/color/typed payload. Only non-empty cells are stored, so a
large mostly-empty grid stays small. Import from `@jgengine/core/editor/grid` (ops + queries) and
`@jgengine/core/editor/gridAdapters` (import/export). Do not hardcode tile arrays in game code —
author the grid and read it at runtime.

- Authoring ops (all immutable, undoable via the session): `setGridCell`/`eraseGridCell`,
  `paintGridCells` (batch stroke), `fillGridRect` (rectangle), `floodFillGrid` (bucket),
  `eyedropGridCell` (sample), `resizeGridLayer`, `createGridLayer`.
- Rendering-independent runtime queries: `getGridCell`, `getGridCellAtWorld`, `gridCellEntries`,
  `forEachGridCell`, `gridCellsOfValue`, `gridCellToWorld`/`worldToGridCell`. Renderers are adapters
  over these — never bake tiles into the grid model.
- Session commands: `addGridLayer`, `removeGridLayer`, `setGridLayer`, `paintGridCells`,
  `fillGridRect`, `floodFillGrid`, `resizeGridLayer` (snapshot history → undo/redo).
- RPC/CLI verbs: `list_grids`, `get_grid_cell`, `add_grid_layer`, `remove_grid_layer`,
  `set_grid_layer`, `paint_grid_cells`, `fill_grid_rect`, `flood_fill_grid`, `resize_grid_layer`,
  `import_grid` (ASCII or CSV).
- Import/export adapters: `importAsciiGrid`/`exportAsciiGrid` (glyph maps) and
  `importCsvGrid`/`exportCsvGrid` (value id per cell). ASCII/CSV are import paths **into** the grid
  document, never the canonical representation — `migrateGridLayer` normalizes and version-migrates
  any layer from disk or an adapter.
