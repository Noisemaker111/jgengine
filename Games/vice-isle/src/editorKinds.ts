import { definePlaceableMarkerKind } from "@jgengine/core/scene/sceneKinds";

/**
 * Vice Isle's own click-to-place marker kinds. Registering them here (imported for its side effect by
 * `editorLayers.ts`, which the editor always loads for this game) makes "Stash" and "Bounty" tools in
 * the editor's `+ Add` menu: pick one, click the world to drop it, Shift-click to keep placing a whole
 * run of them. The runtime still reads these off `editorLayers.markers` by `kind` — the registration
 * only teaches the editor how to place and inspect them.
 */
export const STASH_KIND = definePlaceableMarkerKind({
  kind: "stash",
  label: "Stash",
  category: "Vice Isle",
  accent: "#38d6c4",
  fields: [{ type: "number", key: "value", label: "Payout ($)", default: 300, min: 0, step: 50 }],
});

export const BOUNTY_KIND = definePlaceableMarkerKind({
  kind: "bounty",
  label: "Bounty spot",
  category: "Vice Isle",
  accent: "#6d2f8f",
});
