import { expect, test } from "bun:test";
import { createEditorSession } from "./commands";
import { editorDocumentBounds, normalizeEditorLayers } from "./document";
import { createTerrainSnapshot, editableTerrainFromSnapshot } from "../world/terraform";

test("terrain-only documents frame their footprint and authored relief", () => {
  const terrain = editableTerrainFromSnapshot(createTerrainSnapshot({ bounds: { minX: -12, minZ: -8, maxX: 12, maxZ: 8 }, cellSize: 2 }));
  terrain.editDelta({ mode: "raise", center: [0, 0], radius: 4, strength: 3 });
  expect(editorDocumentBounds(normalizeEditorLayers({ terrain: terrain.snapshot() }))).toEqual({ min: { x: -12, y: 0, z: -8 }, max: { x: 12, y: 3, z: 8 } });
});

test("normal layer commands preserve blend identities and undo/redo", () => {
  const terrain = editableTerrainFromSnapshot(createTerrainSnapshot({ bounds: { minX: -8, minZ: -8, maxX: 8, maxZ: 8 }, cellSize: 2 }));
  terrain.fillSurfaceDelta("grass");
  terrain.setLayers([{ id: "grass", surface: "grass" }, { id: "dirt", surface: "dirt" }]);
  terrain.blendPaintDelta({ mode: "paint", center: [0, 0], radius: 4, surface: "dirt", strength: 0.5 });
  const before = terrain.snapshot();
  const weights = terrain.weightsAt(0, 0);
  const session = createEditorSession(normalizeEditorLayers({ terrain: before }));
  session.dispatch({ type: "setTerrainLayers", layers: [{ id: "dirt", surface: "dirt" }, { id: "grass", surface: "grass" }, { id: "rock", surface: "rock" }] });
  const after = session.getState().document.terrain!;
  expect(editableTerrainFromSnapshot(after).weightsAt(0, 0)).toEqual([weights[1]!, weights[0]!, 0]);
  session.dispatch({ type: "undo" });
  expect(session.getState().document.terrain).toEqual(before);
  session.dispatch({ type: "redo" });
  expect(session.getState().document.terrain).toEqual(after);
});
