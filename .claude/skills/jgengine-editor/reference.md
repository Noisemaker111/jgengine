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

## Bridge reliability

The bridge is trustworthy so agents author instead of hardcoding — every path is honest about failure:

- **Rejected mutations return `ok:false` with a reason.** A locked/cyclic `set_transform`, a `set_parent` that would form a cycle, a collection/prefab verb targeting a missing id, and a batch verb that matches nothing all fail loudly — never a phantom `{ok:true}`.
- **One decode/migrate boundary.** `decodeEditorDocument` (`@jgengine/core/editor`) validates every field with a path-specific diagnostic (`$.markers[2].position`) and migrates forward; `import_document` and a `push_document_patch` **snapshot** both clear it, so a malformed or old document fails or migrates loudly rather than corrupting a live session.
- **Document-global id uniqueness.** Placeable ids (markers/volumes/paths/notes) are one namespace: adds re-id on collision, and a single imported document that reuses an id is rejected with its path — a duplicate-id import is impossible. Combine paths (`mergeEditorDocuments`, duplicate, overlay) re-id instead.
- **Schema-validated input.** `decodeEditorBridgeRequest` type-checks each field a method understands against the per-method schema before it reaches `handle` — a fuzzed value (string where a number belongs, scalar where an object belongs) is rejected at the `--rpc`/HTTP/stdio/agent-tool boundary, never cast in blind. Missing/unknown fields are left to `handle`'s guards so the boundary stays forward-compatible.

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

## Data catalogs & entity definitions

The **Data** tab (`CatalogsPanel`) edits gameplay tuning rows that persist on the scene document
(`EditorDocument.catalogs`) — schemas come from a game's `editorCatalogs` export
(`EditorCatalogDefinition[]`: `{ id, label, schema: ParamSchema, entries }`), wired to the editor via
`defineGame`-sibling module export and passed as the `catalogs` prop (the scaffold's `main.tsx` passes
`catalogs={editorCatalogs}`). Beyond tuning existing rows, the tab now **authors rows**: the `+ Row`
control adds a schema-defaulted entry and each row has a remove (`×`). Agents/CLI drive the same edits
with the `add_catalog_entry` / `remove_catalog_entry` RPC verbs (alongside `list_catalogs`,
`get_catalog_entry`, `set_catalog_entry`); new-row meta is seeded from the catalog `ParamSchema`
defaults and validated before it lands. Values save into `editor.scene.json` → `catalogs`.

**Entity definitions** are a data catalog: the well-known `ENTITY_CATALOG_ID` (`"entities"`) catalog,
whose rows carry role/health/speed/scale per `entityDefinitionSchema`. `entityEntryFromCatalog(document,
catalogId, definitions?)` (`@jgengine/core/editor`) turns a row into the runtime
`GameContextEntityEntry` the default `content.ts#entityById` returns — so a `mob`/`boss` marker whose
`catalogId` names an entities row spawns with the stats/speed tuned in the editor, no game TS.
`authoredEntitySpawns(document)` (`@jgengine/core/world/authoredEntities`) yields the spawn plan
(`{ markerId, catalogId, position, rotationY }`) the scaffold `loop.ts` feeds to
`ctx.scene.entity.spawn`. Author entities in the editor (place a marker → Data tab → tune the row →
save); never hardcode entity stats where the document should own them.

## Asset import

Dropping a `.glb`/`.gltf` into the editor persists it durably, but where depends on the project shape (`editorHostPlugin`, `@jgengine/node`). A **standalone folder workspace** copies the bytes into the scanned asset folder and re-lists them under a scan-stable id (`importEditorAsset`); the id comes from the file's workspace-relative path, so a placement referencing it resolves after reload. A **promoted game** (one with a typed `src/game/assets.ts` catalog — `isPromotedProject`) instead copies the bytes into `public/<basePath>/imported/` and rewrites `assets.ts` to add a durable `extras` entry to its `buildCatalog({ extras })` call (`importPromotedAsset` → `upsertCatalogExtra`), so the **shipped** game serves and resolves the asset through its own typed catalog rather than a dev-only route. The id matches what a folder rescan would produce, the rewrite is idempotent (re-import of the same id collapses to a single entry), and an unparseable or multi-`buildCatalog` source throws so the host falls back to the folder-scan import rather than corrupt the file.

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
