import { expect, test } from "bun:test";

import { normalizeEditorLayers } from "@jgengine/core/editor/document";
import { auditManifest, isSceneOwnershipManifest } from "@jgengine/core/scene/sceneOwnership";
import { isStructuralColumnCell } from "@llmville/game/datacenter/layout";
import { worldToCell } from "@llmville/game/datacenter/grid";

import sceneDocument from "../editor.scene.json";
import ownership from "../scene-ownership.json";

test("the authored scene loads and places nothing on a structural column", () => {
  const document = normalizeEditorLayers(sceneDocument);
  for (const marker of document.markers) {
    expect(isStructuralColumnCell(worldToCell(marker.position.x, marker.position.z))).toBe(false);
  }
});

test("runtime-owned world content is declared with a reason", () => {
  expect(isSceneOwnershipManifest(ownership)).toBe(true);
  if (!isSceneOwnershipManifest(ownership)) return;
  expect(auditManifest(ownership)).toEqual([]);
});
