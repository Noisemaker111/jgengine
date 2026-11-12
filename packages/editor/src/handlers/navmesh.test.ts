import { describe, expect, test } from "bun:test";
import { initNavBake } from "@jgengine/navbake";
import type { EditorDocument } from "@jgengine/core/editor/types";
import { navAuthoringFromDocument } from "@jgengine/core/nav/navAuthoring";
import { navMeshFromBake } from "@jgengine/core/nav/navRuntime";

import { createEditorHost } from "../session";
import { navLinkArrows } from "../DebugDraw";

const agent = { agentRadius: 0.4, agentHeight: 1.8, maxSlope: 45, maxClimb: 0.4 };

describe("bakeNavMesh", () => {
  test("stores the baked mesh as a named nav bake", async () => {
    const host = createEditorHost({ gameId: "navbake-test", layers: undefined });
    await initNavBake();
    const response = host.api.handle({
      method: "bakeNavMesh",
      id: "ground",
      positions: [0, 0, 0, 6, 0, 0, 6, 0, 6, 0, 0, 6],
      indices: [0, 2, 1, 0, 3, 2],
      ...agent,
    });
    expect(response.ok).toBe(true);
    const bake = host.api.getSession().getState().document.bakes?.find((entry) => entry.id === "ground");
    expect(bake?.kind).toBe("nav");
    expect((response.result as { polygons: number }).polygons).toBeGreaterThan(0);
    host.dispose();
  });

  test("bakes the authored nav areas when no geometry is passed, and the authoring survives a save", async () => {
    await initNavBake();
    const host = createEditorHost({ gameId: "navbake-authored", layers: undefined });
    const baseRevision = (host.api.handle({ method: "document_revision" }).result as { revision: number }).revision;
    const patched = host.api.handle({
      method: "push_document_patch",
      patch: {
        type: "commands",
        baseRevision,
        commands: [
          { type: "addVolume", volume: { id: "yard", kind: "nav_area", shape: "box", center: { x: 5, y: 0, z: 5 }, halfExtents: { x: 5, y: 1, z: 5 }, meta: { mode: "walkable" } } },
          { type: "addVolume", volume: { id: "stack", kind: "nav_area", shape: "box", center: { x: 5, y: 0.5, z: 5 }, halfExtents: { x: 1, y: 1.5, z: 1 }, meta: { mode: "blocked" } } },
          { type: "addPath", path: { id: "gate", kind: "nav_link", points: [{ x: 1, y: 0, z: 1 }, { x: 9, y: 0, z: 9 }], meta: { linkKind: "door", bidirectional: false } } },
        ],
      },
    });
    expect(patched.ok).toBe(true);
    const response = host.api.handle({ method: "bakeNavMesh", id: "main", ...agent });
    expect(response.ok).toBe(true);
    expect(response.result).toMatchObject({ id: "main", areas: 2, links: 1, issues: [] });

    const saved = JSON.parse((host.api.handle({ method: "export_document" }).result as { json: string }).json) as EditorDocument;
    host.dispose();
    const reopened = createEditorHost({ gameId: "navbake-authored", layers: saved });
    const document = reopened.api.getSession().getState().document;
    expect(navAuthoringFromDocument(document)).toEqual(navAuthoringFromDocument(saved));
    expect(navAuthoringFromDocument(document).links).toEqual([{ id: "gate", kind: "door", from: [1, 0, 1], to: [9, 0, 9], bidirectional: false }]);
    const mesh = navMeshFromBake(document.bakes)!;
    expect(mesh.polys.length).toBeGreaterThan(0);
    reopened.dispose();
  });

  test("refuses to bake nothing", async () => {
    await initNavBake();
    const host = createEditorHost({ gameId: "navbake-empty", layers: undefined });
    const response = host.api.handle({ method: "bakeNavMesh", id: "main", ...agent });
    expect(response.ok).toBe(false);
    expect(host.api.handle({ method: "bakeNavMesh", id: "main", positions: [0, 0, 0], ...agent }).ok).toBe(false);
    host.dispose();
  });
});

describe("nav link gizmo", () => {
  const points = [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 3, z: 0 }];

  test("points an arrow at the landing end, and at both ends when the link runs both ways", () => {
    expect(navLinkArrows({ id: "a", kind: "nav_link", points, meta: { bidirectional: false } })).toEqual([{ at: points[2]!, toward: points[1]! }]);
    expect(navLinkArrows({ id: "b", kind: "nav_link", points, meta: {} })).toEqual([
      { at: points[2]!, toward: points[1]! },
      { at: points[0]!, toward: points[1]! },
    ]);
    expect(navLinkArrows({ id: "c", kind: "road", points })).toEqual([]);
  });
});
