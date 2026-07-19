import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EditorDocument, EditorPath } from "@jgengine/core/editor/index";

import { saveSceneDocument } from "../mcp/cli";
import { createEditorHost } from "../session";

/** A host seeded with a box volume the generator can fill, plus one hand-authored path to preserve. */
function hostWithVolume() {
  return createEditorHost({
    gameId: "pathnet-test",
    layers: {
      volumes: [
        {
          id: "vol_box",
          kind: "zone",
          shape: "box",
          center: { x: 100, y: 5, z: -50 },
          halfExtents: { x: 200, y: 20, z: 160 },
        },
      ],
      paths: [{ id: "manual-1", kind: "route", points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }] }],
    },
  });
}

function paths(doc: EditorDocument): readonly EditorPath[] {
  return doc.paths;
}

function genPaths(doc: EditorDocument, seed = "s1"): EditorPath[] {
  return doc.paths.filter((p) => p.id.startsWith(`gen-${seed}-`));
}

describe("generate_streets", () => {
  test("bakes deterministic world-frame paths for a fixed seed", () => {
    const a = hostWithVolume();
    const b = hostWithVolume();

    const resA = a.api.handle({ method: "generate_streets", volumeId: "vol_box", seed: "s1", mode: "net" });
    const resB = b.api.handle({ method: "generate_streets", volumeId: "vol_box", seed: "s1", mode: "net" });
    expect(resA.ok).toBe(true);
    expect(resB.ok).toBe(true);

    const docA = a.api.getSession().getState().document;
    const docB = b.api.getSession().getState().document;
    const genA = genPaths(docA);
    const genB = genPaths(docB);

    expect(genA.length).toBeGreaterThan(0);
    // Byte-identical bakes: same seed + bounds ⇒ same ids, kinds, and every world point.
    expect(JSON.stringify(genA)).toBe(JSON.stringify(genB));

    // Nets bake `road`s and points are offset into the volume's world origin (center 100,-50).
    expect(genA.every((p) => p.kind === "road")).toBe(true);
    expect(genA.every((p) => p.meta?.generator === "streetGenerator" && p.meta?.seed === "s1")).toBe(true);
    const first = genA[0]!.points[0]!;
    expect(first.y).toBe(5); // baked at the volume center height
    // A point must land inside the volume footprint (center ± half-extents).
    expect(first.x).toBeGreaterThanOrEqual(100 - 200 - 1);
    expect(first.x).toBeLessThanOrEqual(100 + 200 + 1);
    expect(first.z).toBeGreaterThanOrEqual(-50 - 160 - 1);
    expect(first.z).toBeLessThanOrEqual(-50 + 160 + 1);

    // Pre-existing hand-authored content survives the bake.
    expect(paths(docA).some((p) => p.id === "manual-1")).toBe(true);

    a.dispose();
    b.dispose();
  });

  test("save round-trips the baked paths through editor.scene.json", () => {
    const { api, dispose } = hostWithVolume();
    api.handle({ method: "generate_streets", volumeId: "vol_box", seed: "s1", mode: "net" });
    const doc = api.getSession().getState().document;
    const baked = genPaths(doc);
    expect(baked.length).toBeGreaterThan(0);

    const root = mkdtempSync(join(tmpdir(), "pathnet-save-"));
    mkdirSync(join(root, "pathnet-test", "src"), { recursive: true });
    const saved = saveSceneDocument("pathnet-test", doc, root);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const onDisk = JSON.parse(readFileSync(saved.saved, "utf8")) as EditorDocument;
    const reloaded = genPaths(onDisk);
    // The file carries the same baked paths verbatim.
    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(baked));

    // And re-importing the saved JSON into a fresh session reproduces them.
    const fresh = createEditorHost({ gameId: "pathnet-test", layers: {} });
    const imported = fresh.api.handle({ method: "import_document", json: JSON.stringify(onDisk) });
    expect(imported.ok).toBe(true);
    expect(genPaths(fresh.api.getSession().getState().document).length).toBe(baked.length);
    fresh.dispose();
    dispose();
  });

  test("re-running the same seed replaces its prior output rather than duplicating", () => {
    const { api, dispose } = hostWithVolume();
    const first = api.handle({ method: "generate_streets", volumeId: "vol_box", seed: "s1", mode: "net" });
    expect(first.ok).toBe(true);
    const firstCount = (first.result as { pathCount: number }).pathCount;
    const firstIds = (first.result as { ids: string[] }).ids;
    expect(firstCount).toBeGreaterThan(0);

    const second = api.handle({ method: "generate_streets", volumeId: "vol_box", seed: "s1", mode: "net" });
    expect(second.ok).toBe(true);
    const secondResult = second.result as { pathCount: number; removed: number; ids: string[] };
    // Idempotent: same id set, and it removed exactly the prior baked set (no duplication).
    expect(secondResult.pathCount).toBe(firstCount);
    expect(secondResult.removed).toBe(firstCount);
    expect(secondResult.ids).toEqual(firstIds);

    const doc = api.getSession().getState().document;
    expect(genPaths(doc).length).toBe(firstCount);
    // Manual path is still preserved after the re-run.
    expect(doc.paths.some((p) => p.id === "manual-1")).toBe(true);

    // A different seed coexists rather than replacing s1's output.
    const other = api.handle({ method: "generate_streets", volumeId: "vol_box", seed: "s2", mode: "net" });
    expect(other.ok).toBe(true);
    expect((other.result as { removed: number }).removed).toBe(0);
    expect(genPaths(api.getSession().getState().document, "s1").length).toBe(firstCount);

    dispose();
  });

  test("circuit mode emits a closed route (first ≈ last point)", () => {
    const { api, dispose } = hostWithVolume();
    const res = api.handle({ method: "generate_streets", volumeId: "vol_box", seed: "track", mode: "circuit" });
    expect(res.ok).toBe(true);
    const result = res.result as { mode: string; kind: string };
    expect(result.mode).toBe("circuit");
    expect(result.kind).toBe("route");

    const doc = api.getSession().getState().document;
    const loops = genPaths(doc, "track").filter((p) => p.meta?.loop === true);
    expect(loops.length).toBeGreaterThan(0);
    for (const loop of loops) {
      expect(loop.kind).toBe("route");
      const head = loop.points[0]!;
      const tail = loop.points[loop.points.length - 1]!;
      expect(Math.hypot(head.x - tail.x, head.z - tail.z)).toBeLessThan(1e-6);
    }
    dispose();
  });

  test("bakes into explicit center + half-extents when no volume is named", () => {
    const { api, dispose } = createEditorHost({ gameId: "pathnet-test", layers: {} });
    const res = api.handle({
      method: "generate_streets",
      center: { x: 0, y: 3, z: 0 },
      halfX: 180,
      halfZ: 180,
      seed: "s1",
    });
    expect(res.ok).toBe(true);
    expect((res.result as { pathCount: number }).pathCount).toBeGreaterThan(0);
    dispose();
  });

  test("rejects a bake with neither a volume nor explicit bounds", () => {
    const { api, dispose } = createEditorHost({ gameId: "pathnet-test", layers: {} });
    const res = api.handle({ method: "generate_streets", seed: "s1" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("volumeId");
    dispose();
  });

  test("the bake is a single undoable edit", () => {
    const { api, dispose } = hostWithVolume();
    api.handle({ method: "generate_streets", volumeId: "vol_box", seed: "s1", mode: "net" });
    expect(genPaths(api.getSession().getState().document).length).toBeGreaterThan(0);
    const undo = api.handle({ method: "undo" });
    expect(undo.ok).toBe(true);
    // One undo removes the whole baked set and restores the manual path only.
    expect(genPaths(api.getSession().getState().document).length).toBe(0);
    expect(api.getSession().getState().document.paths.some((p) => p.id === "manual-1")).toBe(true);
    dispose();
  });
});
