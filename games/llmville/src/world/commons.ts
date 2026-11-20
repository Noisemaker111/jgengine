import type { EditorDocument } from "@jgengine/core/editor/index";
import type { BuildDirection, PlaceableBuildItemId } from "@llmville/game/build/catalog";
import { DECOR_BUILD_ITEM_ID_VALUES } from "@llmville/game/store/decorCatalog";

import { editorLayers } from "../editorLayers";

/** One piece of the Commons' furniture, as the scene file places it. */
export interface CommonsPiece {
  id: string;
  itemId: PlaceableBuildItemId;
  x: number;
  y: number;
  z: number;
  direction: BuildDirection;
}

/** The marker kind the scene file furnishes the Commons with: `meta.itemId` names a decor item, `meta.direction` its quarter turn. */
export const COMMONS_DECOR_KIND = "llmville-decor";

const DECOR_IDS: ReadonlySet<string> = new Set(DECOR_BUILD_ITEM_ID_VALUES);

/** Every decor marker the scene file places; a marker naming no decor item, or no quarter turn, is an authoring error. */
export function commonsPieces(document: EditorDocument = editorLayers): CommonsPiece[] {
  return document.markers.filter((marker) => marker.kind === COMMONS_DECOR_KIND).map((marker) => {
    const itemId = marker.meta?.["itemId"];
    const direction = marker.meta?.["direction"];
    if (typeof itemId !== "string" || !DECOR_IDS.has(itemId)) throw new Error(`editor.scene.json: ${marker.id} names no decor item (${String(itemId)})`);
    if (direction !== 0 && direction !== 1 && direction !== 2 && direction !== 3) throw new Error(`editor.scene.json: ${marker.id} needs meta.direction 0-3`);
    return { id: marker.id, itemId: itemId as PlaceableBuildItemId, x: marker.position.x, y: marker.position.y, z: marker.position.z, direction };
  });
}
