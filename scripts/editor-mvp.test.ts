import { describe, expect, test } from "bun:test";

import {
  createEditorSession,
  createEmptyEditorDocument,
  type EditorDocument,
  importEditorDocumentJson,
} from "../packages/core/src/editor/index";
import { environment, terrain } from "../packages/core/src/world/features";
import { summarizeEnvironment } from "../packages/core/src/world/environmentSummary";
import { buildRoadRibbon } from "../packages/core/src/world/roads";
import { resolveScatter } from "../packages/core/src/world/scatterRegion";
import {
  applyDeltaToSnapshot,
  beginTerraformStroke,
  createTerrainSnapshot,
  editableTerrainFromSnapshot,
} from "../packages/core/src/world/terraform";

/**
 * Editor MVP loop, end to end and browserless: author a marker + a route path + a scatter region +
 * sculpted terrain through the programmatic editor session, save/load the document as JSON, then prove
 * the exact pure resolvers `<AuthoredScene>` renders from turn that one document into scene content.
 * This is the path every "hard-code the level → author it in the editor" migration (see
 * check-content-gate) depends on; if it breaks, the migrations have nowhere to land.
 */
describe("editor MVP → AuthoredScene parity", () => {
  const session = createEditorSession(createEmptyEditorDocument());
  const bounds = { minX: -50, minZ: -50, maxX: 50, maxZ: 50 } as const;
  const flat = createTerrainSnapshot({ bounds, cellSize: 2 });
  const live = editableTerrainFromSnapshot(flat);
  const stroke = beginTerraformStroke(live);
  stroke.stamp({ mode: "raise", center: [0, 0], radius: 20, strength: 4 });
  const sculpted = applyDeltaToSnapshot(flat, stroke.delta());

  session.dispatch({ type: "setTerrain", terrain: sculpted });
  session.dispatch({
    type: "addMarker",
    marker: { id: "spawn", kind: "player_spawn", position: { x: 0, y: 0, z: -30 } },
  });
  session.dispatch({
    type: "addPath",
    path: {
      id: "route",
      kind: "route",
      width: 4,
      points: [
        { x: -30, y: 0, z: -30 },
        { x: 0, y: 0, z: 0 },
        { x: 30, y: 0, z: 30 },
      ],
    },
  });
  session.dispatch({
    type: "addPath",
    path: {
      id: "grove",
      kind: "scatter",
      points: [
        { x: -40, y: 0, z: -40 },
        { x: 40, y: 0, z: -40 },
        { x: 40, y: 0, z: 40 },
        { x: -40, y: 0, z: 40 },
      ],
      meta: {
        density: 0.05,
        minSpacing: 3,
        seed: "editor-mvp",
        edgeFalloff: 3,
        palette: [
          { item: "tree", weight: 3 },
          { item: "bush", weight: 2 },
        ],
      },
    },
  });

  // Save → load: the editor's Ctrl+S writes editor.scene.json; a game imports it back as runtime data.
  const savedJson = session.exportJson();
  const doc: EditorDocument = importEditorDocumentJson(savedJson);
  test("save/load round-trips every authored object", () => {
    expect(doc.markers.length).toBe(1);
    expect(doc.paths.length).toBe(2);
  });

  test("document carries the authored marker, route, scatter region, and terrain", () => {
    expect(doc.markers.map((m) => m.id)).toContain("spawn");
    expect(doc.paths.map((p) => p.id)).toEqual(expect.arrayContaining(["route", "grove"]));
    expect(doc.terrain).toBeDefined();
    expect(doc.terrain?.offsets.some((o) => o !== 0)).toBe(true);
  });

  test("AuthoredScene scatter resolver instances foliage from the region", () => {
    const instances = resolveScatter(doc);
    expect(instances.length).toBeGreaterThan(0);
    expect(new Set(instances.map((i) => i.item))).toContain("tree");
  });

  test("AuthoredScene path resolver drapes the route into ribbon geometry", () => {
    const route = doc.paths.find((p) => p.id === "route");
    expect(route).toBeDefined();
    const ribbon = buildRoadRibbon(
      route!.points.map((p) => [p.x, p.z] as const),
      route!.width ?? 4,
      () => 0,
    );
    expect(ribbon.positions.length).toBeGreaterThan(0);
    expect(ribbon.indices.length).toBeGreaterThan(0);
  });

  test("authored terrain rebuilds into a live ground field with real relief", () => {
    const field = editableTerrainFromSnapshot(doc.terrain!);
    expect(field.sampleHeight(0, 0)).toBeGreaterThan(field.sampleHeight(48, 48));
  });

  test("environment() resolves the authored world for summarizeEnvironment", () => {
    const world = environment({
      terrain: terrain({ bounds: { w: 100, d: 100 }, seed: "editor-mvp", height: 6 }),
      sculpt: doc.terrain,
    });
    const summary = summarizeEnvironment(world);
    expect(summary.isEmpty).toBe(false);
    expect(summary.terrain?.height.finite).toBe(true);
  });
});
