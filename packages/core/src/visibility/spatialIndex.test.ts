import { describe, expect, test } from "bun:test";
import type { RenderBounds } from "@jgengine/core/visibility/bounds";
import { resolveBounds } from "@jgengine/core/visibility/bounds";
import type { CameraView } from "@jgengine/core/visibility/frustum";
import { createFrustum, updateFrustum } from "@jgengine/core/visibility/frustum";
import { createSpatialIndex } from "@jgengine/core/visibility/spatialIndex";

function boxAt(cx: number, cy: number, cz: number, half = 1): RenderBounds {
  return resolveBounds({ kind: "aabb", half: [half, half, half] }, [cx, cy, cz]);
}

const perspective: CameraView = {
  kind: "perspective",
  position: [0, 0, 0],
  target: [0, 0, 10],
  fovDeg: 55,
  aspect: 1,
  near: 0.1,
  far: 100,
};

describe("spatialIndex", () => {
  test("insert/has/size", () => {
    const idx = createSpatialIndex();
    expect(idx.has("a")).toBe(false);
    expect(idx.size()).toBe(0);
    idx.insert("a", boxAt(0, 0, 0));
    expect(idx.has("a")).toBe(true);
    expect(idx.size()).toBe(1);
  });

  test("queryBox returns objects inside the box and excludes far ones", () => {
    const idx = createSpatialIndex();
    idx.insert("near", boxAt(0, 0, 0));
    idx.insert("far", boxAt(1000, 1000, 1000));
    const out: string[] = [];
    idx.queryBox(-5, -5, -5, 5, 5, 5, out);
    expect(out).toContain("near");
    expect(out).not.toContain("far");
  });

  test("querySphere returns objects inside the radius and excludes far ones", () => {
    const idx = createSpatialIndex();
    idx.insert("near", boxAt(0, 0, 0));
    idx.insert("far", boxAt(1000, 1000, 1000));
    const out: string[] = [];
    idx.querySphere(0, 0, 0, 10, out);
    expect(out).toContain("near");
    expect(out).not.toContain("far");
  });

  test("queryFrustum returns objects the camera can see and excludes those outside", () => {
    const idx = createSpatialIndex();
    idx.insert("ahead", boxAt(0, 0, 20));
    idx.insert("behind", boxAt(0, 0, -20));
    const f = updateFrustum(createFrustum(), perspective);
    const out: string[] = [];
    idx.queryFrustum(f, out);
    expect(out).toContain("ahead");
    expect(out).not.toContain("behind");
  });

  test("update moves an object out of its old cell and into the new one", () => {
    const idx = createSpatialIndex();
    idx.insert("mover", boxAt(0, 0, 0), true);
    let out: string[] = [];
    idx.queryBox(-5, -5, -5, 5, 5, 5, out);
    expect(out).toContain("mover");

    idx.update("mover", boxAt(1000, 1000, 1000));

    out = [];
    idx.queryBox(-5, -5, -5, 5, 5, 5, out);
    expect(out).not.toContain("mover");

    out = [];
    idx.queryBox(995, 995, 995, 1005, 1005, 1005, out);
    expect(out).toContain("mover");
  });

  test("remove drops an object from subsequent queries", () => {
    const idx = createSpatialIndex();
    idx.insert("a", boxAt(0, 0, 0));
    idx.remove("a");
    expect(idx.has("a")).toBe(false);
    expect(idx.size()).toBe(0);
    const out: string[] = [];
    idx.queryBox(-5, -5, -5, 5, 5, 5, out);
    expect(out).not.toContain("a");
  });

  test("oversized objects are returned by every query", () => {
    const idx = createSpatialIndex({ cellSize: 1, maxCellSpan: 2 });
    idx.insert("huge", boxAt(0, 0, 0, 10));

    const boxOut: string[] = [];
    idx.queryBox(500, 500, 500, 505, 505, 505, boxOut);
    expect(boxOut).toContain("huge");

    const sphereOut: string[] = [];
    idx.querySphere(-500, -500, -500, 1, sphereOut);
    expect(sphereOut).toContain("huge");
  });

  test("cells reports occupied partitions", () => {
    const idx = createSpatialIndex({ cellSize: 10 });
    idx.insert("a", boxAt(5, 5, 5, 0));
    idx.insert("b", boxAt(105, 105, 105, 0));
    const cells = idx.cells();
    expect(cells.length).toBe(2);
    const totalCount = cells.reduce((sum, c) => sum + c.count, 0);
    expect(totalCount).toBe(2);
  });

  test("dedups an object spanning multiple cells within one query result", () => {
    const idx = createSpatialIndex({ cellSize: 4 });
    idx.insert("wide", boxAt(0, 0, 0, 10));
    const out: string[] = [];
    idx.queryBox(-20, -20, -20, 20, 20, 20, out);
    expect(out.filter((id) => id === "wide").length).toBe(1);
  });
});
