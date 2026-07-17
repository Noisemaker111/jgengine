import { describe, expect, it } from "bun:test";
import { createEmptyEditorDocument } from "./document";
import type { EditorDocument, EditorMarker } from "./types";
import {
  WORLD_BASE_SHARD_ID,
  WORLD_MANIFEST_KIND,
  decodeWorldManifest,
  loadWorldDocument,
  selectWorldShards,
  shardMatchesQuery,
  singleShardWorldManifest,
  splitEditorDocumentIntoShards,
  type WorldManifest,
  type WorldShardResolver,
} from "./world";

function marker(id: string, x: number, z: number, kind = "prop"): EditorMarker {
  return { id, kind, position: { x, y: 0, z } };
}

function docWith(markers: EditorMarker[]): EditorDocument {
  return { ...createEmptyEditorDocument(), markers };
}

function resolverFrom(shards: Record<string, EditorDocument>): WorldShardResolver {
  return (file) => shards[file] ?? null;
}

describe("selectWorldShards / shardMatchesQuery", () => {
  const manifest: WorldManifest = {
    kind: WORLD_MANIFEST_KIND,
    grid: { cellSize: 256 },
    shards: [
      { id: "terrain", file: "shards/terrain.json", residency: "always" },
      { id: "cell_0_0", file: "shards/cell_0_0.json", bounds: { min: [0, 0], max: [256, 256] } },
      { id: "cell_3_2", file: "shards/cell_3_2.json", bounds: { min: [768, 512], max: [1024, 768] } },
    ],
  };

  it("returns every shard when no query is given (monolith behavior)", () => {
    expect(selectWorldShards(manifest).map((s) => s.id)).toEqual(["terrain", "cell_0_0", "cell_3_2"]);
  });

  it("always keeps always-resident shards regardless of distance", () => {
    const far = { center: { x: 100000, z: 100000 }, radius: 10 };
    expect(selectWorldShards(manifest, far).map((s) => s.id)).toEqual(["terrain"]);
  });

  it("selects a bounded shard when the query disc overlaps its footprint", () => {
    const near = { center: { x: 100, z: 100 }, radius: 50 };
    expect(selectWorldShards(manifest, near).map((s) => s.id)).toEqual(["terrain", "cell_0_0"]);
  });

  it("uses the radius to reach an adjacent cell", () => {
    // center just outside cell_0_0's max edge, but radius 40 reaches into it.
    const spanning = { center: { x: 290, z: 100 }, radius: 40 };
    expect(shardMatchesQuery(manifest.shards[1]!, spanning)).toBe(true);
    const noReach = { center: { x: 290, z: 100 }, radius: 10 };
    expect(shardMatchesQuery(manifest.shards[1]!, noReach)).toBe(false);
  });

  it("treats a bounded shard as point-containment when radius is omitted", () => {
    const inside = { center: { x: 900, z: 600 } };
    expect(shardMatchesQuery(manifest.shards[2]!, inside)).toBe(true);
    const outside = { center: { x: 10, z: 10 } };
    expect(shardMatchesQuery(manifest.shards[2]!, outside)).toBe(false);
  });
});

describe("loadWorldDocument", () => {
  it("merges the selected shards into one document", () => {
    const shards = {
      "shards/terrain.json": docWith([marker("obelisk", 5, 5)]),
      "shards/cell_0_0.json": docWith([marker("rock-a", 10, 10)]),
      "shards/cell_3_2.json": docWith([marker("rock-b", 900, 600)]),
    };
    const manifest: WorldManifest = {
      kind: WORLD_MANIFEST_KIND,
      shards: [
        { id: "terrain", file: "shards/terrain.json", residency: "always" },
        { id: "cell_0_0", file: "shards/cell_0_0.json", bounds: { min: [0, 0], max: [256, 256] } },
        { id: "cell_3_2", file: "shards/cell_3_2.json", bounds: { min: [768, 512], max: [1024, 768] } },
      ],
    };
    const near = loadWorldDocument(manifest, resolverFrom(shards), { center: { x: 10, z: 10 }, radius: 20 });
    expect(near.markers.map((m) => m.id).sort()).toEqual(["obelisk", "rock-a"]);

    const all = loadWorldDocument(manifest, resolverFrom(shards));
    expect(all.markers.map((m) => m.id).sort()).toEqual(["obelisk", "rock-a", "rock-b"]);
  });

  it("applies a shard's overlay on top before merging", () => {
    const shards = {
      "shards/cell_0_0.json": docWith([marker("rock-a", 10, 10), marker("rock-b", 20, 20)]),
      "overlays/cell_0_0.patch.json": docWith([marker("rock-a", 11, 11)]),
    };
    const manifest: WorldManifest = {
      kind: WORLD_MANIFEST_KIND,
      shards: [
        {
          id: "cell_0_0",
          file: "shards/cell_0_0.json",
          overlay: "overlays/cell_0_0.patch.json",
          residency: "always",
        },
      ],
    };
    const loaded = loadWorldDocument(manifest, resolverFrom(shards));
    const rockA = loaded.markers.find((m) => m.id === "rock-a");
    expect(rockA?.position.x).toBe(11);
    expect(loaded.markers).toHaveLength(2);
  });

  it("skips shards that fail to resolve", () => {
    const manifest = singleShardWorldManifest("shards/missing.json");
    const loaded = loadWorldDocument(manifest, () => null);
    expect(loaded.markers).toHaveLength(0);
  });

  it("a single-shard world round-trips its document unchanged (backward compatibility)", () => {
    const doc = docWith([marker("a", 1, 1), marker("b", 2, 2)]);
    const manifest = singleShardWorldManifest("scene.json");
    const loaded = loadWorldDocument(manifest, resolverFrom({ "scene.json": doc }));
    expect(loaded.markers.map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("splitEditorDocumentIntoShards", () => {
  it("buckets objects into grid cells and round-trips through loadWorldDocument", () => {
    const doc = docWith([
      marker("near-origin", 10, 10),
      marker("also-origin", 200, 50),
      marker("far", 900, 600),
    ]);
    doc.catalogs = [{ id: "entities", entries: [{ id: "player" }] }];

    const { manifest, shards } = splitEditorDocumentIntoShards(doc, { cellSize: 256 });
    expect(manifest.grid?.cellSize).toBe(256);
    // base + cell_0_0 (two markers) + cell_3_2 (one marker)
    expect(manifest.shards.map((s) => s.id).sort()).toEqual(["base", "cell_0_0", "cell_3_2"]);

    const base = manifest.shards.find((s) => s.id === WORLD_BASE_SHARD_ID)!;
    expect(base.residency).toBe("always");
    expect(shards[base.file]!.catalogs).toEqual(doc.catalogs);

    const cell = manifest.shards.find((s) => s.id === "cell_0_0")!;
    expect(cell.bounds).toEqual({ min: [0, 0], max: [256, 256] });

    const reloaded = loadWorldDocument(manifest, resolverFrom(shards));
    expect(reloaded.markers.map((m) => m.id).sort()).toEqual(["also-origin", "far", "near-origin"]);
    expect(reloaded.catalogs).toEqual(doc.catalogs);
  });

  it("streams only the neighborhood after splitting", () => {
    const doc = docWith([marker("near", 10, 10), marker("far", 5000, 5000)]);
    const { manifest, shards } = splitEditorDocumentIntoShards(doc, { cellSize: 256 });
    const loaded = loadWorldDocument(manifest, resolverFrom(shards), { center: { x: 10, z: 10 }, radius: 5 });
    expect(loaded.markers.map((m) => m.id)).toEqual(["near"]);
  });
});

describe("decodeWorldManifest", () => {
  it("accepts a well-formed manifest", () => {
    const result = decodeWorldManifest({
      kind: "world",
      grid: { cellSize: 256 },
      shards: [
        { id: "terrain", file: "shards/terrain.json", residency: "always" },
        { id: "cell_3_2", file: "shards/cell_3_2.json", bounds: { min: [768, 512], max: [1024, 768] } },
      ],
      streaming: { loadRadius: 400, keepRadius: 700 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.shards).toHaveLength(2);
      expect(result.manifest.streaming).toEqual({ loadRadius: 400, keepRadius: 700 });
    }
  });

  it("rejects the wrong kind with a path diagnostic", () => {
    const result = decodeWorldManifest({ kind: "scene", shards: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.path === "$.kind")).toBe(true);
  });

  it("flags malformed shard fields and duplicate ids", () => {
    const dup = decodeWorldManifest({
      kind: "world",
      shards: [
        { id: "a", file: "a.json" },
        { id: "a", file: "b.json" },
        { id: "bad", file: 5, bounds: { min: [1], max: [2, 3] } },
      ],
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) {
      const paths = dup.errors.map((e) => e.path);
      expect(paths).toContain("$.shards[1].id");
      expect(paths).toContain("$.shards[2].file");
      expect(paths).toContain("$.shards[2].bounds.min");
    }
  });
});
