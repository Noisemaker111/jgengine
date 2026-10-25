import { normalizeEditorLayers, type EditorDocument, type EditorLayersInput } from "@jgengine/core/editor/index";

import sceneJson from "./editor.scene.json";

/**
 * The habitat's authored scene — every wall, decor prop, and starter furnishing placed in the 3D
 * editor and saved to `editor.scene.json`. Coordinates live here once; `setupWorld` reads the
 * placements below and drops the catalog objects into the scene, so the sim and the render share one
 * source of truth. Open F2+E to move a piece and Ctrl+S to save it back.
 */
export const editorLayers: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorLayersInput);

/** A static object placed from the authored document: catalog id, XZ, optional yaw, and its instance group. */
export interface ScenePlacement {
  object: string;
  x: number;
  z: number;
  rotation: number;
  group: string;
  instanceId: string;
}

function placementsForGroup(group: string): ScenePlacement[] {
  return editorLayers.markers
    .filter((marker) => marker.meta?.["group"] === group && typeof marker.meta?.["object"] === "string")
    .map((marker) => ({
      object: marker.meta!["object"] as string,
      x: marker.position.x,
      z: marker.position.z,
      rotation: marker.rotationY ?? 0,
      group,
      instanceId: marker.id,
    }));
}

/** Habitat shell pieces (walls, window, corner, gate) — read from the authored document. */
export const HABITAT_STRUCTURES: readonly ScenePlacement[] = placementsForGroup("hab");

/** Ambient decor props scattered around the habitat — read from the authored document. */
export const DECOR_PLACEMENTS: readonly ScenePlacement[] = placementsForGroup("decor");

/** The starter furniture set that satisfies member needs — read from the authored document. */
export const STARTER_FURNITURE: readonly ScenePlacement[] = placementsForGroup("starter");

/** Every authored static placement, in the original habitat → decor → furniture order. */
export const SCENE_PLACEMENTS: readonly ScenePlacement[] = [
  ...HABITAT_STRUCTURES,
  ...DECOR_PLACEMENTS,
  ...STARTER_FURNITURE,
];
