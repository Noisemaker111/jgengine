import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { validateLibrary } from "./assetLibrary";
import { assetLibrary } from "./libraryIndex";
import { pullLibraryEntry } from "./libraryPull";
import { libraryServedPath } from "./libraryServed";
import { ingestSmithsonian, smithsonianRecords } from "./librarySmithsonian";

const UUID = "732d123d-7a35-411b-a4e1-5e355adcacf8";
const OTHER = "c0bc58e6-b172-4543-ad58-50261aea523c";

function glb(filename: string, size?: number) {
  return { filename, url: `https://3d-api.si.edu/x/${filename}`, attributes: [{ FILE_TYPE: "glb" }, ...(size === undefined ? [] : [{ FILE_SIZE: size }])] };
}

function row(title: string, media: unknown[]) {
  return {
    title,
    content: {
      descriptiveNonRepeating: { data_source: "Smithsonian Astrophysical Observatory", online_media: { media } },
      indexedStructured: { topic: ["Astronomy"], object_type: ["Models"] },
    },
  };
}

describe("Smithsonian Open Access", () => {
  test("only CC0 3D packages with a GLB are listed, each taking its Draco GLB", () => {
    const records = smithsonianRecords(
      row("Cassiopeia A", [
        { id: `3d_package:${UUID}`, type: "3d_voyager", usage: { access: "CC0" }, resources: [glb("A-150k-4096_std.glb", 9_000_000), glb("A-100k-2048_std_draco.glb"), { filename: "A.usdz", attributes: [] }] },
        { id: `3d_package:${OTHER}`, type: "3d_voyager", usage: { access: "Usage conditions apply" }, resources: [glb("B.glb", 1000)] },
        { id: "image:1", type: "Images", usage: { access: "CC0" }, resources: [] },
      ]),
    );
    expect(records).toEqual([
      {
        id: UUID,
        title: "Cassiopeia A (part 1)",
        kind: "model",
        tags: ["scan", "museum", "smithsonian", "astronomy", "models", "cassiopeia"],
        author: "Smithsonian Astrophysical Observatory, Smithsonian Institution",
        license: "CC0-1.0",
        file: "A-100k-2048_std_draco.glb",
      },
    ]);
    expect(smithsonianRecords(row("No GLB", [{ id: `3d_package:${UUID}`, type: "3d_voyager", usage: { access: "CC0" }, resources: [{ filename: "A.zip" }] }]))).toEqual([]);
    expect(smithsonianRecords(row("Too big", [{ id: `3d_package:${UUID}`, type: "3d_voyager", usage: { access: "CC0" }, resources: [glb("A.glb", 90_000_000)] }]))).toEqual([]);
  });

  test("ingest pages through the search with the configured key", async () => {
    const urls: string[] = [];
    const page = (rows: unknown[]) => ({ ok: true, status: 200, json: async () => ({ response: { rowCount: 1001, rows } }), text: async () => "" });
    const records = await ingestSmithsonian({
      apiKey: "k",
      fetchImpl: async (url) => {
        urls.push(url);
        return page(url.includes("start=0") ? [row("A", [{ id: `3d_package:${UUID}`, type: "3d_voyager", usage: { access: "CC0" }, resources: [glb("a.glb", 1)] }])] : [row("B", [{ id: `3d_package:${OTHER}`, type: "3d_voyager", usage: { access: "CC0" }, resources: [glb("b.glb", 1)] }])]);
      },
    });
    expect(records.map((record) => record.id)).toEqual([UUID, OTHER]);
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("start=1000");
    expect(urls[0]).toContain("api_key=k");
  });

  test("the committed scans are valid CC0 library models served as one GLB each", () => {
    const scans = assetLibrary().filter((entry) => entry.source === "smithsonian");
    expect(scans.length).toBeGreaterThan(500);
    expect(validateLibrary(scans)).toEqual([]);
    for (const entry of scans) {
      expect(entry.license).toBe("CC0-1.0");
      expect(entry.file).toMatch(/\.glb$/i);
    }
    const first = scans[0];
    expect(first === undefined ? undefined : libraryServedPath(first).url).toBe(`/models/library/smithsonian/${first?.id}/model.glb`);
    expect(first?.thumbnail).toBe(`https://3d-api.si.edu/content/document/3d_package:${first?.id}/scene-image-thumb.jpg`);
  });

  test("a pull writes the package's GLB to its served folder", async () => {
    const entry = assetLibrary().find((candidate) => candidate.source === "smithsonian");
    if (entry === undefined) throw new Error("no Smithsonian entry");
    const scratch = join(import.meta.dir, "../../../../.scratch");
    mkdirSync(scratch, { recursive: true });
    const outRoot = mkdtempSync(join(scratch, "si-pull-"));
    try {
      const asked: string[] = [];
      await pullLibraryEntry(entry, {
        outRoot,
        pullPack: async () => {},
        fetchImpl: Object.assign(async (url: string | URL | Request) => {
          asked.push(String(url));
          return new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
        }, { preconnect: () => {} }),
      });
      expect(asked).toEqual([`https://3d-api.si.edu/content/document/3d_package:${entry.id}/resources/${encodeURIComponent(entry.file ?? "")}`]);
      const file = join(outRoot, "models", "library", "smithsonian", entry.id, "model.glb");
      expect(existsSync(file)).toBe(true);
      expect([...readFileSync(file)]).toEqual([0x67, 0x6c, 0x54, 0x46]);
    } finally {
      rmSync(outRoot, { recursive: true, force: true });
    }
  });
});
