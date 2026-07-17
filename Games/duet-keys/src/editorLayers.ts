import type { EditorDocument } from "@jgengine/core/editor/index";

import { ROOM_GRIDS } from "./game/rooms/catalog";

/**
 * Scene document for duet-keys: every room's geometry (floors, walls, hazards, spawns, gates,
 * exits) as an editor-owned grid layer. The ASCII maps in `game/rooms/catalog.ts` are only the
 * import adapter that produces these grids; the grid document is the canonical representation the
 * room parser, gameplay, and rendering all read. Loaded by the editor via `loadGameLayers`.
 */
export function buildDuetKeysEditorLayers(): EditorDocument {
  return {
    version: 1,
    markers: [],
    volumes: [],
    paths: [],
    annotations: [],
    prefabs: [],
    collections: [],
    catalogs: [],
    grids: ROOM_GRIDS.map((layer) => ({ ...layer })),
  };
}

export const editorLayers = buildDuetKeysEditorLayers;
