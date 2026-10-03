# Editor RPC/CLI and agent panel

## Headless CLI persistence

`bun packages/editor/src/mcp/cli.ts --game <id> --rpc '<json>' … --save` runs the RPC batch on one
in-memory session and, when every RPC succeeds, writes the session document to
`Games/<id>/src/editor.scene.json` (dev-save format: 2-space JSON + trailing newline, identical to
the GUI's Ctrl+S through `devSavePlugin`). Without `--save`, `--rpc` mutations are discarded on
exit — use it for read-only inspection only, or capture `export_document` yourself.

The source-only CLI writer validates the full document before replacing any saved bytes, matching the dev save endpoint. Validation failures report document paths and leave the existing file intact.

`dispatch` with `setEnvironment` validates only the candidate environment before changing the session, undo history, or live document revision. Supported presets are `day`, `dusk`, and `night`; custom palette, sun, intensity, and fog fields remain explicit authored values. Invalid inputs report `$.environment` paths. Validated nested fields are copied, so mutating the command afterward cannot change the document. Passing `environment: undefined` removes the bag and remains undoable. Repair unsupported authored values through an explicit editor command; preserve the author's palette and fog rather than substituting a default.

## Atomic authoring batches

Use `document_revision` to inspect the current revision, then send one `push_document_patch` for a complete placement operation. Commands use the `EditorCommand` shapes from `@jgengine/core/editor/commands`, rather than RPC verb shapes. Earlier commands' ids are available to later commands in the same batch:

```json
{
  "method": "push_document_patch",
  "patch": {
    "type": "commands",
    "baseRevision": 0,
    "commands": [
      { "type": "addMarker", "marker": { "id": "placed_a", "kind": "prop", "catalogId": "my-model", "position": { "x": 1, "y": 0, "z": 2 } } },
      { "type": "addPath", "path": { "id": "route_a", "kind": "route", "points": [{ "x": 0, "y": 0, "z": 0 }, { "x": 1, "y": 0, "z": 2 }] } },
      { "type": "createCollection", "id": "region_a", "name": "Region A", "memberIds": ["placed_a", "route_a"] }
    ]
  }
}
```

`my-model` is a model in the game's own catalog. Send this JSON through `--rpc-file <file> --save`, the live bridge, or the embedded agent's existing tool. Human code can use `session.transaction(commands)` with the same commands and undo contract.

- All commands stage before commit. A malformed command, missing/locked target, parent cycle, or cross-kind object-id collision rejects the whole batch, preserving the document, selection, undo/redo history, revision, and live subscribers. Errors include `commands[N]`; the RPC also returns `result.commandIndex` and the unchanged `result.revision`.
- A successful edit emits one session notification, publishes one document revision, and forms one undo/redo step. Selection-only changes do not publish or consume document history. `undo`/`redo` commands cannot run inside a transaction.
- Existing same-kind object ids upsert without automatic renaming. Repeating an already-current transform or stable-id placement succeeds without publishing another revision or consuming history. After a revision conflict, inspect the latest document before retrying against its revision. `force` skips only the revision check; validation and rollback still apply.
- Explicit copy operations such as `duplicate`, `addFragment`, and `insertPrefab` retain their existing generated-id behavior. Use direct `addMarker`/`addVolume`/`addPath`/`addNote` commands when gameplay needs caller-owned stable ids.

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
- **Command patches are atomic.** `push_document_patch` commands share `EditorSession.transaction` with core live sync: a bad command rolls back the entire batch, and an accepted batch has one undo step and document publication. See [atomic authoring batches](#atomic-authoring-batches).
- **One decode/migrate boundary.** `decodeEditorDocument` (`@jgengine/core/editor`) validates every field with a path-specific diagnostic (`$.markers[2].position`) and migrates forward; `import_document` and a `push_document_patch` **snapshot** both clear it, so a malformed or old document fails or migrates loudly rather than corrupting a live session.
- **Document-global id uniqueness.** Placeable ids (markers/volumes/paths/notes) are one namespace: adds re-id on collision, and a single imported document that reuses an id is rejected with its path — a duplicate-id import is impossible. Combine paths (`mergeEditorDocuments`, duplicate, overlay) re-id instead.
- **Schema-validated input.** `decodeEditorBridgeRequest` type-checks each field a method understands against the per-method schema before it reaches `handle` — a fuzzed value (string where a number belongs, scalar where an object belongs) is rejected at the `--rpc`/HTTP/stdio/agent-tool boundary, never cast in blind. Missing/unknown fields are left to `handle`'s guards so the boundary stays forward-compatible.
- **Guards name the expected param.** A required field left off (or supplied under the wrong key) is caught by the verb's own guard and answered with the param it wanted, not a downstream crash — e.g. `import_document` without `json` returns `import_document requires a \`json\` param …` instead of letting the missing value reach `JSON.parse` as the literal string `"undefined"`.

## Path / route authoring

Author a new path (route, road, patrol lane, scatter region outline) headlessly with **`add_path`** — no `export_document`/`import_document` roundtrip. It dispatches the `addPath` session command (one undoable edit) and mutates `EditorDocument.paths`:

```sh
bun packages/editor/src/mcp/cli.ts --game <id> \
  --rpc '{"method":"add_path","id":"patrol_1","points":[{"x":0,"z":0},{"x":10,"z":5},{"x":20,"z":0}],"label":"Patrol"}' --save
```

- **Required:** `id` and `points` (≥2 ordered `{x,z}`; `y` optional, defaults to `0`). Fewer than two points is rejected `ok:false`.
- **Optional:** `kind` (defaults to `route`), `width`, `color`, `label`, `meta` — `meta` is validated against the kind's registered schema, same as `set_path`.
- **Id collisions re-id.** Placeable ids are one document-global namespace, so a colliding `id` is minted a `_copy` suffix; the response's `result` carries the id the path actually landed under. Patch it afterwards with `set_path`/`set_meta`, or make gameplay reference the stable id/kind rather than copying coordinates.

## Marker authoring

Place a new point marker (a spawn, checkpoint, pickup, bounty, or a game's own custom kind) headlessly with **`add_marker`** — the one-shot counterpart to `add_path`, no `export_document`/`import_document` roundtrip and no hand-editing the JSON. It dispatches the `addMarker` session command (one undoable edit) and mutates `EditorDocument.markers`:

```sh
bun packages/editor/src/mcp/cli.ts --game <id> \
  --rpc '{"method":"add_marker","id":"stash_pier","kind":"stash","x":168,"z":232,"label":"Pier'\''s end","meta":{"value":300}}' --save
```

- **Required:** `id`, `kind`, and `x`/`z` (`y` optional, defaults to `0`). A game reads its own custom kinds off the document (`editorLayers.markers.filter(m => m.kind === "stash")`), so no engine change is needed to introduce one.
- **Optional:** `color`, `label`, `rotationY`, `catalogId`, `meta` — `catalogId` is the entity kind a `mob`/`boss` marker spawns (without it the marker spawns nothing); `set_marker` patches it too. `meta` is validated against the kind's registered schema when one exists (custom kinds skip validation), same as `set_marker`.
- **Id collisions re-id** exactly as `add_path`; the response's `result` carries the id the marker landed under. Use `place_asset` instead when the marker should carry a mesh (it stamps `catalogId`/`meta.assetId`); `add_marker` is for logical, mesh-free markers.

### Click-to-place custom kinds in the GUI

`add_marker` is the *scripted* path (an agent/CLI types coordinates). To let a **designer click the world to drop** a game's own logical kind (a stash, checkpoint, bounty…), register it as a placeable scene kind with **`definePlaceableMarkerKind`** (`@jgengine/core/scene/sceneKinds`) — the light path that skips a full studio's schema/resolver:

```ts
// Games/<id>/src/editorKinds.ts — imported for its side effect by the game's editorLayers.ts
import { definePlaceableMarkerKind } from "@jgengine/core/scene/sceneKinds";
export const STASH_KIND = definePlaceableMarkerKind({
  kind: "stash", label: "Stash", category: "My Game", accent: "#38d6c4",
  fields: [{ type: "number", key: "value", label: "Payout ($)", default: 300, min: 0, step: 50 }],
});
```

- The kind then appears as a click-to-place tool in the editor `+ Add` menu, grouped under its `category`: pick it, click the world to drop a marker, Shift-click to keep placing, tune the `fields` in the Inspector. The runtime is unchanged — the game still reads the kind off `editorLayers.markers`.
- **Load path:** register from a module the editor loads. Importing your `editorKinds.ts` (side effect) from `editorLayers.ts` covers it — `loadGameLayers` imports `editorLayers.ts` for every editor session, and the game runtime imports it too, so one registration serves both.
- `fields` also gives `add_marker`/`set_marker`/`set_meta` a schema to validate that kind's `meta` against; omit `fields` for a bare placeable marker.

## Placement animation

A placed rigged asset's animation override lives at `marker.meta.animation` and reaches the game through `markerAnimation` → `ModelConfig.animation`. It is `"auto"`, `"none"` or a config with `states`, `oneShots` and an optional stored `graph` (an `AnimGraph`, validated with `parseAnimGraph` on read).

- **Inspector → Animation** picks the mode and binds idle/walk/run and one-shot clips.
- **Animation workspace → Graph** (rail button, or the bottom dock's Animation tab) shows the graph the selected placement plays: layers, states and transitions, with the source (stored, built from states, or derived from clip roles).
  - The scrub slider replays the graph runtime from its entry states. Parameter sliders come from the graph's blend points and conditions.
  - Trigger buttons record a press at the playhead, so scrubbing back and forth replays it. The rig at the camera focus is posed from the runtime's output through the shell's `createGraphPose`.
  - Editing a crossfade, or **Store graph**, writes the graph to `meta.animation.graph` as one undoable edit. **Use derived graph** drops it.
- Scripted: `set_meta` with `{ "animation": { "graph": { ... } } }` on the marker; see the `jgengine-world` recipe `character-animation.md` for the graph shape.

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
(`EditorDocument.catalogs`). Two kinds of catalog feed the tab, merged by
`resolveCatalogDefinitions(document, gameDefinitions)`: **game-exported** catalogs whose schema lives
in code (a game's `editorCatalogs` export, `EditorCatalogDefinition[]`: `{ id, label, schema:
ParamSchema, entries }`, wired via a `defineGame`-sibling module export passed as the `catalogs` prop —
the scaffold's `main.tsx` passes `catalogs={editorCatalogs}`), and **editor-authored** catalogs created
entirely in the editor. A game def always wins on id collision; a document catalog is surfaced only when
it carries its own `schema`.

Beyond tuning existing rows the tab **authors catalogs and schemas**:
- **Create a catalog** — the `＋ New catalog` form takes an id (+ optional label) and dispatches
  `addCatalog` with an empty `schema: { fields: [] }`. The document now *carries the schema*
  (`EditorCatalogData.schema`/`label`), so an editor-only catalog round-trips through save/reload and
  drives the default `content.ts` path with no game code.
- **Author schema fields** — for document-authored catalogs (`data.schema !== undefined`; game-exported
  catalogs stay read-only since their schema is in code) the field editor adds/renames/removes fields
  (key, type over `ParamField["type"]`, default, min/max). Every field mutation rebuilds the whole
  `fields` array and dispatches one `setCatalogSchema`, whose reducer **re-parses every row's `meta`
  against the new schema** via `parseParams`: removed keys drop, added keys default in, range/number
  values clamp. One undoable step.
- **Author rows** — `+ Row` adds a schema-defaulted entry; each row has a remove (`×`).

Agents/CLI drive the same edits: `add_catalog` / `remove_catalog` / `set_catalog_schema` for the
catalog + schema, and `add_catalog_entry` / `remove_catalog_entry` / `set_catalog_entry` for rows
(alongside `list_catalogs`, `get_catalog_entry`). A catalog added via `add_catalog` is RPC-addressable
immediately (the host recomputes merged defs per request). New-row meta is seeded from the catalog
`ParamSchema` defaults and validated before it lands. Values and document-carried schemas save into
`editor.scene.json` → `catalogs`.

**Entity definitions** are a data catalog: the well-known `ENTITY_CATALOG_ID` (`"entities"`) catalog,
whose rows carry role/health/speed/scale per `entityDefinitionSchema`. `entityEntryFromCatalog(document,
catalogId, definitions?)` (`@jgengine/core/editor`) turns a row into the runtime
`GameContextEntityEntry` the default `content.ts#entityById` returns — so a `mob`/`boss` marker whose
`catalogId` names an entities row spawns with the stats/speed tuned in the editor, no game TS. It
prefers a document-carried `entities` schema over `entityDefinitionSchema` when the document authored
one, so a re-authored entity field set drives the parse.
`authoredEntitySpawns(document)` (`@jgengine/core/world/authoredEntities`) yields the spawn plan
(`{ markerId, catalogId, position, rotationY }`) the scaffold `loop.ts` feeds to
`ctx.scene.entity.spawn`. Author entities in the editor (place a marker → Data tab → tune the row →
save); never hardcode entity stats where the document should own them.

## Asset import

Dropping a `.glb`/`.gltf` into the editor persists it durably, but where depends on the project shape (`editorHostPlugin`, `@jgengine/node`). A **standalone folder workspace** copies the bytes into the scanned asset folder and re-lists them under a scan-stable id (`importEditorAsset`); the id comes from the file's workspace-relative path, so a placement referencing it resolves after reload. A **promoted game** (one with a typed `src/game/assets.ts` catalog — `isPromotedProject`) instead copies the bytes into `public/<basePath>/imported/` and rewrites `assets.ts` to add a durable `extras` entry to its `buildCatalog({ extras })` call (`importPromotedAsset` → `upsertCatalogExtra`), so the **shipped** game serves and resolves the asset through its own typed catalog rather than a dev-only route. The id matches what a folder rescan would produce, the rewrite is idempotent (re-import of the same id collapses to a single entry), and an unparseable or multi-`buildCatalog` source throws so the host falls back to the folder-scan import rather than corrupt the file.

## Material assets and named slots

The Materials workspace authors `document.materialAssets` through `upsert_material_asset {asset,coalesce?}`. Each versioned `MaterialAsset` has a stable ID, sparse surface fields, explicit capability declarations, texture metadata and provenance (`@jgengine/core/material/materialAsset`). `materialCapabilitiesForAsset(asset)` derives the shader requirements for its fields, maps and fabric/hair adapters; artist edits union those with existing declarations, while RPC validation still rejects undeclared requirements. Empty fields inherit the imported value; resetting a field removes its override. Renaming does not change the ID. Editable wool, cotton, silk, metal, glass, plastic, stone and hair-card starting points describe response; games own textures, models and art direction.

Use `assign_material_asset {ids,materialId,selector}` with a mesh name, material slot name or slot index. Every supplied selector field must match. Separate character skin, eyes, clothing and metal parts with separate assignments. Empty selectors fail rather than flatten a whole imported model. `list_material_assets` reads the library; `remove_material_asset {id}` removes unused assets; `clear_material_assets {ids}` removes selected objects' assignments and restores imported materials. Changes join the scene undo/redo and save path. The workspace exposes roughly six family-specific groups, full physical fields and per-map UV/sampler settings. Neutral and document-light previews use the runtime material renderer; the latter uses the authored environment and fixed sun, while game lighting can add other lights or motion.

Texture roles define the actual shader channels: roughness G, metalness B, AO R, sheen roughness A, clearcoat roughness G, specular intensity A, transmission R and thickness G. Anisotropy RG stores direction and B strength. Color/emissive/sheen-color/specular-color maps use sRGB; normal and numeric maps use linear data. Alpha maps use G; base-color alpha remains in its color map. Supply real runtime URLs and declare UV set, transform, normal convention, sampler, compression and physical size. Compression metadata does not transcode an image; physical size documents metres while UV transforms control rendering. Repack unsupported channels instead of silently relabelling them.

The installed renderer is Three r182. Its [physical material](https://threejs.org/docs/pages/MeshPhysicalMaterial.html) supports sheen, anisotropy, clearcoat, specular/IOR, transmission/volume and iridescence. Check the installed shader before adding controls: online docs can cover later releases. Transmission needs content behind the surface, adds rendering work and should use opacity 1. Alpha coverage cuts or blends the surface; it does not implement refraction. Directional response needs suitable UVs/normals or authored tangents, and must be reviewed after rotating the mesh or light.

[HDRP's fabric distinction](https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.0/manual/understand-fabrics.html) separates diffuse cotton/wool fuzz from directional silk. The fuzzy adapter uses native grazing sheen; the woven adapter adds UV-oriented thread normals and roughness variation. Thread scale is cycles per UV, weave direction is radians, normal strength changes slope and variation changes roughness. Neither creates fibre silhouettes, cloth deformation or collision. Explicit surface values override appearance-adapter defaults.

[Unreal shading models](https://dev.epicgames.com/documentation/en-us/unreal-engine/shading-models-in-unreal-engine) have dedicated hair and cloth responses, including hair scatter/tangent/backlit inputs. [Unreal's groom workflow](https://dev.epicgames.com/documentation/en-us/unreal-engine/hair-rendering-and-simulation-in-unreal-engine) also owns strand geometry and simulation. JGengine's hair cards/strand meshes use an explicit approximation: directional physical highlights, authored coverage and card backlighting. It provides no hair BSDF, multiple scattering, groom, collision or simulation, and its skin family does not supply subsurface scattering. Similar control names do not imply parity. Review front-lit, grazing and backlit views with the actual authored geometry.

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

## Minimap bake (#1036)

`bake_minimap` rasterizes the authored terrain into a top-down PNG stored on the document as
`EditorDocument.minimap: EditorMinimapBake` (`{ background: "data:image/png;…", bounds }`). The pure,
deterministic core rasterizer is `bakeMinimapFromDocument` (`@jgengine/core/editor/index`); the RPC
handler composes the live viewport's base ground field with `document.terrain` and dispatches the
undoable `setMinimapBake` command. Runtime feeds the stored `background`/`bounds` straight into the
`Minimap`/`WorldMap` props — **no re-rasterization at runtime** (see `jgengine-ui`).

- **Live-viewport only.** The bake needs the mounted editor world's composed height/normal sampler
  (`EditorHostApi.getTerrainSampler`, registered by `EditorWorldOverlay` while the viewport is
  mounted). It is **not** a headless CLI/MCP verb: with no viewport the sampler is null and
  `bake_minimap` returns `{ ok:false, error:"bake_minimap needs the live editor viewport" }`. To bake
  a committed scene offline, run a deterministic node script that rebuilds the base field with
  `groundFieldFor(world)` and calls `bakeMinimapFromDocument`.
- GUI: the Terrain panel's **Bake minimap** button calls `bake_minimap` and surfaces any `ok:false`
  error inline.
- RPC/CLI verb: `bake_minimap` (optional `padding`, `resolution`, `waterLevel`). The bake path uses
  no `Date`/`Math.random`, so the same scene + sampler always bakes byte-identical output.

## Terrain and viewport iteration

`create_terrain` rejects invalid dimensions and more than 1,000,000 vertices before allocation; increase `cellSize` for larger maps. Brush coordinates, radius and strength must be finite, radius positive, strength nonnegative. A ramp requires both `toX` and `toZ`; blend strength is 0–1.

`blend_terrain` adds a missing material layer and paints it as one authored action: one notification and one undo. A missed or invalid brush changes neither the layer stack nor undo/redo. `set_terrain_layers` and `EditableTerrain.setLayers` preserve blends by stable layer id across additions, reorder and material parameter edits. Removing a painted layer normalizes surviving weights; replacing every painted layer clears the obsolete buffer.

Viewport placement honors grid snap for marker, zone, note and path points on X/Z, then resamples the authored sculpt composed over the shared base ground field. Paths select along visible segments as well as vertices. Multi-selection gizmos translate the whole group; rotate/scale remain available for individual supported objects.

Terrain-only scenes work with `camera_frame` / Frame all: the authored footprint and sculpt relief contribute to document bounds without a temporary marker. Native runner captures use `drive editor --param editor=standalone` and the same editor RPCs.

Grid placement resamples the authored sculpt composed over the live base ground field at snapped XZ for markers, volumes, notes and draft path points. It uses the same terrain/path policy as the ground overlays (including the ground field’s off-map behavior), and flat Y=0 when no ground sampler is mounted. Nonfinite surface heights reject placement without changing the document or clearing the tool.

## Static prefab export

Keep source parts in `EditorPrefab.fragment` and author export settings with `set_prefab_static_bake`
(or the `setPrefabStaticBake` command): `prefabId` and `bake: { assetId, collisionBoxes?, clearances? }`.
`bake: null` clears settings. Save/reopen and undo/redo retain settings alongside the editable parts;
an invalid setting rejects the whole command without changing history. Each box uses local
`min`/`max` XYZ triples; clearances add a unique `id`. Clearances require explicit solid boxes and
may touch their edges but must not overlap them. These are authored constraints, not automatic
proof that an entrance is navigable for a particular character.

```json
{"method":"set_prefab_static_bake","prefabId":"courtyard-arch","bake":{"assetId":"own:arch","collisionBoxes":[{"min":[-2,0,-1],"max":[-1,3,1]},{"min":[1,0,-1],"max":[2,3,1]}],"clearances":[{"id":"entry","min":[-1,0,-1],"max":[1,2,1]}]}}
```

Export pinned source bytes offline with `bakeStaticPrefab` from
`@jgengine/assets/staticPrefabBake` (Node/Bun only; see `jgengine-assets`). Register the returned
`dims`, `collisionMesh` and `anchor: "origin"` with the output URL in the game's asset catalog.
The shared model resolver preserves that authored origin for rendering and collider consumption.
World placements remain catalog markers in `editor.scene.json`; baking never replaces or moves
them. Validate the game's real walker/route clearance before advertising walkable interiors.
