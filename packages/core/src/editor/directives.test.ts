import { describe, expect, it } from "bun:test";
import {
  cloneEditorDocument,
  createEmptyEditorDocument,
  decodeEditorDocument,
  exportEditorDocumentJson,
  importEditorDocumentJson,
  mergeEditorDocuments,
} from "./document";
import {
  applyDirectiveOverlay,
  materializeDirective,
  materializeDirectives,
  resolveDirectiveFootprint,
  type EditorDirectiveOverlay,
} from "./directives";
import type { EditorDocument, EditorPath, EditorScatterDirective, EditorVolume } from "./types";

function boxVolume(id: string, cx: number, cz: number, hx: number, hz: number): EditorVolume {
  return {
    id,
    kind: "zone",
    shape: "box",
    center: { x: cx, y: 0, z: cz },
    halfExtents: { x: hx, y: 10, z: hz },
  };
}

function scatterPath(id: string, points: [number, number][]): EditorPath {
  return { id, kind: "scatter", points: points.map(([x, z]) => ({ x, y: 0, z })) };
}

function docWith(partial: Partial<EditorDocument>): EditorDocument {
  return { ...createEmptyEditorDocument(), ...partial };
}

const rocks: EditorScatterDirective = {
  id: "rocks-nr",
  kind: "scatter",
  asset: "rock_metal",
  region: "north-ridge",
  density: 0.05,
  seed: "42",
  minScale: 1,
  maxScale: 3,
};

describe("resolveDirectiveFootprint", () => {
  it("uses an explicit area", () => {
    const doc = createEmptyEditorDocument();
    const footprint = resolveDirectiveFootprint(doc, {
      id: "d",
      kind: "scatter",
      asset: "rock",
      density: 0.1,
      area: { min: [0, 0], max: [10, 20] },
    });
    expect(footprint).toEqual({ area: { minX: 0, minZ: 0, maxX: 10, maxZ: 20 } });
  });

  it("resolves a scatter path region as a clip polygon", () => {
    const doc = docWith({ paths: [scatterPath("north-ridge", [[0, 0], [100, 0], [100, 100], [0, 100]])] });
    const footprint = resolveDirectiveFootprint(doc, rocks);
    expect(footprint?.area).toEqual({ minX: 0, minZ: 0, maxX: 100, maxZ: 100 });
    expect(footprint?.polygon).toHaveLength(4);
  });

  it("resolves a box volume region as its XZ AABB", () => {
    const doc = docWith({ volumes: [boxVolume("north-ridge", 50, 50, 40, 30)] });
    const footprint = resolveDirectiveFootprint(doc, rocks);
    expect(footprint?.area).toEqual({ minX: 10, minZ: 20, maxX: 90, maxZ: 80 });
    expect(footprint?.polygon).toBeUndefined();
  });

  it("returns null when the region does not resolve", () => {
    expect(resolveDirectiveFootprint(createEmptyEditorDocument(), rocks)).toBeNull();
  });
});

describe("materializeScatterDirective", () => {
  const doc = docWith({ volumes: [boxVolume("north-ridge", 50, 50, 50, 50)], directives: [rocks] });

  it("mints stable ids and is fully deterministic", () => {
    const a = materializeDirective(doc, rocks);
    const b = materializeDirective(doc, rocks);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    for (const inst of a) {
      expect(inst.id.startsWith("rocks-nr#")).toBe(true);
      expect(inst.asset).toBe("rock_metal");
      expect(inst.scale).toBeGreaterThanOrEqual(1);
      expect(inst.scale).toBeLessThanOrEqual(3);
    }
  });

  it("clips to the region polygon", () => {
    const polyDoc = docWith({
      paths: [scatterPath("north-ridge", [[0, 0], [20, 0], [20, 20], [0, 20]])],
      directives: [{ ...rocks, density: 0.2 }],
    });
    const instances = materializeDirective(polyDoc, { ...rocks, density: 0.2 });
    for (const inst of instances) {
      expect(inst.x).toBeGreaterThanOrEqual(0);
      expect(inst.x).toBeLessThanOrEqual(20);
      expect(inst.z).toBeGreaterThanOrEqual(0);
      expect(inst.z).toBeLessThanOrEqual(20);
    }
  });
});

describe("materializePopulationDirective", () => {
  it("respects per-species caps", () => {
    const doc = docWith({
      volumes: [boxVolume("ridge", 0, 0, 200, 200)],
      directives: [
        {
          id: "spawns",
          kind: "population",
          region: "ridge",
          seed: "71",
          species: [
            { id: "rex", cap: 3 },
            { id: "sabertooth", weight: 2, cap: 6 },
          ],
        },
      ],
    });
    const instances = materializeDirectives(doc);
    const counts = instances.reduce<Record<string, number>>((acc, inst) => {
      acc[inst.asset] = (acc[inst.asset] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts.rex ?? 0).toBeLessThanOrEqual(3);
    expect(counts.sabertooth ?? 0).toBeLessThanOrEqual(6);
    expect(instances.length).toBeLessThanOrEqual(9);
    expect(instances.every((i) => i.kind === "population")).toBe(true);
  });
});

describe("applyDirectiveOverlay (bake/patch seam)", () => {
  const doc = docWith({ volumes: [boxVolume("north-ridge", 50, 50, 50, 50)], directives: [rocks] });

  it("patches and deletes instances by stable id, leaving others untouched", () => {
    const baked = materializeDirective(doc, rocks);
    const first = baked[0]!;
    const second = baked[1]!;
    const overlay: EditorDirectiveOverlay = {
      over: "rocks-nr",
      patches: {
        [first.id]: { position: { x: 999, z: 888 }, scale: 2.5 },
        [second.id]: { deleted: true },
      },
    };
    const patched = applyDirectiveOverlay(baked, overlay);
    expect(patched).toHaveLength(baked.length - 1);
    const movedFirst = patched.find((i) => i.id === first.id)!;
    expect(movedFirst.x).toBe(999);
    expect(movedFirst.z).toBe(888);
    expect(movedFirst.scale).toBe(2.5);
    expect(patched.find((i) => i.id === second.id)).toBeUndefined();
  });

  it("re-materialize + overlay is stable across bakes (edits are not orphaned)", () => {
    const overlay: EditorDirectiveOverlay = {
      over: "rocks-nr",
      patches: { [materializeDirective(doc, rocks)[0]!.id]: { scale: 9 } },
    };
    const a = materializeDirectives(doc, [overlay]);
    const b = materializeDirectives(doc, [overlay]);
    expect(a).toEqual(b);
    expect(a.find((i) => i.scale === 9)).toBeDefined();
  });
});

describe("empty documents", () => {
  it("materializes nothing without directives", () => {
    expect(materializeDirectives(createEmptyEditorDocument())).toEqual([]);
  });
});

describe("directive document round-trip", () => {
  it("decodes, clones, and merges directives through the document primitives", () => {
    const doc = docWith({
      directives: [
        { ...rocks },
        { id: "spawns", kind: "population", region: "ridge", species: [{ id: "rex", cap: 2 }] },
      ],
    });
    const json = exportEditorDocumentJson(doc);
    const decoded = importEditorDocumentJson(json);
    expect(decoded.directives).toHaveLength(2);
    expect(decoded.directives?.[0]).toEqual(rocks);

    // clone is a deep copy: mutating the clone does not touch the source
    const cloned = cloneEditorDocument(decoded);
    cloned.directives![0]!.id = "changed";
    expect(decoded.directives?.[0]?.id).toBe("rocks-nr");

    // merge upserts directives by id (later doc wins)
    const merged = mergeEditorDocuments(
      docWith({ directives: [{ ...rocks, density: 1 }] }),
      docWith({ directives: [{ ...rocks, density: 2 }] }),
    );
    expect(merged.directives).toHaveLength(1);
    expect((merged.directives?.[0] as EditorScatterDirective).density).toBe(2);
  });

  it("rejects a malformed directive with a path diagnostic", () => {
    const result = decodeEditorDocument({
      markers: [],
      directives: [{ id: "bad", kind: "scatter", density: "lots" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.errors.map((e) => e.path);
      expect(paths).toContain("$.directives[0].asset");
      expect(paths).toContain("$.directives[0].density");
    }
  });
});
