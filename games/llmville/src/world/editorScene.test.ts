import { expect, test } from "bun:test";

import { auditManifest, isSceneOwnershipManifest } from "@llmville/game/engine-local/scene/sceneOwnership";
import { isCommonsCell, isStructuralColumnCell } from "@llmville/game/datacenter/layout";
import { worldToCell } from "@llmville/game/datacenter/grid";

import { commonsPieces } from "./commons";
import { editorLayers } from "../editorLayers";
import ownership from "../scene-ownership.json";

test("the authored scene loads and places nothing on a structural column", () => {
  const document = editorLayers;
  for (const marker of document.markers) {
    expect(isStructuralColumnCell(worldToCell(marker.position.x, marker.position.z))).toBe(false);
  }
});

test("the Commons is furnished from the scene file, every piece a decor item inside the Commons", () => {
  const pieces = commonsPieces();
  expect(pieces.length).toBeGreaterThan(20);
  for (const piece of pieces) expect(isCommonsCell(worldToCell(piece.x, piece.z)), piece.id).toBe(true);
  const commons = editorLayers.volumes.find((volume) => volume.id === "commons");
  expect(commons?.label).toBe("The Commons");
});

test("runtime-owned world content is declared with a reason", () => {
  expect(isSceneOwnershipManifest(ownership)).toBe(true);
  if (!isSceneOwnershipManifest(ownership)) return;
  expect(auditManifest(ownership)).toEqual([]);
});
