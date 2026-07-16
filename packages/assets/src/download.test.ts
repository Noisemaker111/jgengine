import { describe, expect, test } from "bun:test";
import { zipSync, type UnzipFileInfo } from "fflate";

import {
  boundedExtractFilter,
  defaultReleaseUrl,
  downloadArchive,
  downloadPackArchive,
  extractGlbs,
  extractSpriteFiles,
  MAX_ARCHIVE_COMPRESSION_RATIO,
  MAX_ARCHIVE_DOWNLOAD_BYTES,
  MAX_ARCHIVE_ENTRY_COUNT,
  MAX_ARCHIVE_UNCOMPRESSED_BYTES,
  mirrorOverrideUrl,
  packGltfToGlb,
  sha256Hex,
  type FetchLike,
} from "./download";
import type { AssetSource } from "./manifest";

const PRIMARY_URL = "https://kenney.nl/pinned/pack.zip";
const MIRROR_BASE = "https://mirror.example.com";
const PACK_MIRROR_URL = "https://backup.example.com/kenney-nature-archive.zip";

function noDefaultMirror<T>(run: () => Promise<T>): Promise<T> {
  const prior = process.env.JGENGINE_ASSETS_NO_DEFAULT_MIRROR;
  process.env.JGENGINE_ASSETS_NO_DEFAULT_MIRROR = "1";
  return run().finally(() => {
    if (prior === undefined) delete process.env.JGENGINE_ASSETS_NO_DEFAULT_MIRROR;
    else process.env.JGENGINE_ASSETS_NO_DEFAULT_MIRROR = prior;
  });
}

const baseSource: AssetSource = {
  id: "kenney-nature",
  provider: "kenney",
  title: "Nature Kit",
  license: "CC0-1.0",
  author: "Kenney",
  categories: ["nature"],
  download: { url: PRIMARY_URL },
};

function zipWithGlb(content = "stub-glb-bytes"): Uint8Array {
  return zipSync({ "model.glb": new TextEncoder().encode(content) });
}

function fetchFrom(table: Record<string, () => Response>, calls: string[] = []): FetchLike {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const respond = table[url];
    if (respond === undefined) return new Response("not found", { status: 404 });
    return respond();
  }) as FetchLike;
}

describe("packGltfToGlb / extractGlbs", () => {
  test("packs a gltf + bin pair into a glb", () => {
    const gltf = new TextEncoder().encode(
      JSON.stringify({
        asset: { version: "2.0" },
        buffers: [{ uri: "Alien.bin", byteLength: 4 }],
      }),
    );
    const bin = new Uint8Array([1, 2, 3, 4]);
    const glb = packGltfToGlb(gltf, bin);
    const magic = new TextDecoder().decode(glb.slice(0, 4));
    expect(magic).toBe("glTF");
    expect(glb.byteLength).toBeGreaterThan(12);
  });

  test("extractGlbs converts co-located gltf+bin and prefers native glb", () => {
    const gltf = new TextEncoder().encode(
      JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "prop.bin", byteLength: 2 }] }),
    );
    const archive = zipSync({
      "pack/glTF/prop.gltf": gltf,
      "pack/glTF/prop.bin": new Uint8Array([9, 8]),
      "pack/GLB/hero.glb": new TextEncoder().encode("native-glb"),
      "pack/glTF/hero.gltf": gltf,
      "pack/glTF/hero.bin": new Uint8Array([1, 1]),
    });
    const files = extractGlbs(archive);
    const byName = Object.fromEntries(files.map((entry) => [entry.file, entry.bytes]));
    expect(Object.keys(byName).sort()).toEqual(["hero.glb", "prop.glb"]);
    expect(new TextDecoder().decode(byName["hero.glb"]!)).toBe("native-glb");
    expect(new TextDecoder().decode(byName["prop.glb"]!.slice(0, 4))).toBe("glTF");
  });
});

describe("extractSpriteFiles", () => {
  test("pulls svg and png files out of a nested archive, deduped by basename", () => {
    const bytes = new TextEncoder().encode("stub");
    const archive = zipSync({
      "icons-abc123/icons/lorc/sword.svg": bytes,
      "icons-abc123/icons/delapouite/backpack.svg": bytes,
      "icons-abc123/icons/lorc/license.txt": bytes,
      "icons-abc123/README.md": bytes,
    });
    const files = extractSpriteFiles(archive).map((entry) => entry.file);
    expect(files).toEqual(["backpack.svg", "sword.svg"]);
  });

  test("ignores archives with no sprite files", () => {
    const archive = zipSync({ "model.glb": new TextEncoder().encode("stub") });
    expect(extractSpriteFiles(archive)).toEqual([]);
  });

  test("keeps the first file seen when two entries share a basename", () => {
    const archive = zipSync({
      "a/icon.png": new TextEncoder().encode("first"),
      "b/icon.png": new TextEncoder().encode("second"),
    });
    const [entry] = extractSpriteFiles(archive);
    expect(new TextDecoder().decode(entry!.bytes)).toBe("first");
  });
});

function fileInfo(overrides: Partial<UnzipFileInfo>): UnzipFileInfo {
  return { name: "entry", size: 100, originalSize: 100, compression: 8, ...overrides };
}

describe("boundedExtractFilter", () => {
  test("passes through entries within every cap", () => {
    const filter = boundedExtractFilter(() => true);
    expect(filter(fileInfo({ size: 10, originalSize: 20 }))).toBe(true);
  });

  test("rejects entries the inner matcher doesn't select, without counting them", () => {
    const filter = boundedExtractFilter((file) => file.name.endsWith(".glb"));
    expect(filter(fileInfo({ name: "readme.txt" }))).toBe(false);
  });

  test("throws on a zip-bomb-shaped compression ratio", () => {
    const filter = boundedExtractFilter(() => true);
    expect(() =>
      filter(fileInfo({ size: 10, originalSize: 10 * MAX_ARCHIVE_COMPRESSION_RATIO + 1 })),
    ).toThrow(/compression ratio/);
  });

  test("throws once accepted entries exceed the total uncompressed-size cap", () => {
    const filter = boundedExtractFilter(() => true);
    expect(
      filter(fileInfo({ size: MAX_ARCHIVE_UNCOMPRESSED_BYTES, originalSize: MAX_ARCHIVE_UNCOMPRESSED_BYTES })),
    ).toBe(true);
    expect(() => filter(fileInfo({ name: "second", size: 10, originalSize: 10 }))).toThrow(
      /uncompressed-size cap/,
    );
  });

  test("throws once accepted entries exceed the entry-count cap", () => {
    const filter = boundedExtractFilter(() => true);
    for (let i = 0; i < MAX_ARCHIVE_ENTRY_COUNT; i++) {
      expect(filter(fileInfo({ name: `f${i}`, size: 1, originalSize: 1 }))).toBe(true);
    }
    expect(() => filter(fileInfo({ name: "overflow", size: 1, originalSize: 1 }))).toThrow(/entry cap/);
  });
});

describe("extractGlbs zip-bomb guard", () => {
  test("refuses an entry whose compression ratio blows past the cap", () => {
    const bomb = zipSync({ "model.glb": new Uint8Array(2_000_000) }, { level: 9 });
    expect(() => extractGlbs(bomb)).toThrow(/compression ratio/);
  });
});

describe("downloadArchive size cap", () => {
  test("rejects a response whose declared content-length exceeds the cap", async () => {
    const fetchImpl: FetchLike = (async () =>
      new Response(new Uint8Array(4), {
        status: 200,
        headers: { "content-length": String(MAX_ARCHIVE_DOWNLOAD_BYTES + 1) },
      })) as FetchLike;
    await expect(downloadArchive("https://example.com/pack.zip", fetchImpl)).rejects.toThrow(
      /exceeds the .* byte cap/,
    );
  });
});

describe("mirrorOverrideUrl", () => {
  test("lays out the archive at <baseUrl>/<provider>/<packId>.zip", () => {
    expect(mirrorOverrideUrl(MIRROR_BASE, baseSource)).toBe(`${MIRROR_BASE}/kenney/kenney-nature.zip`);
  });

  test("trims trailing slashes from the base url", () => {
    expect(mirrorOverrideUrl(`${MIRROR_BASE}/`, baseSource)).toBe(`${MIRROR_BASE}/kenney/kenney-nature.zip`);
  });
});

describe("downloadPackArchive", () => {
  test("uses the mirror base override first when one is set", async () => {
    const calls: string[] = [];
    const archive = zipWithGlb("from-mirror-override");
    const fetchImpl = fetchFrom(
      { [mirrorOverrideUrl(MIRROR_BASE, baseSource)]: () => new Response(archive, { status: 200 }) },
      calls,
    );

    const result = await downloadPackArchive(baseSource, { mirrorBase: MIRROR_BASE, fetchImpl });

    expect(result.url).toBe(mirrorOverrideUrl(MIRROR_BASE, baseSource));
    expect(calls).toEqual([mirrorOverrideUrl(MIRROR_BASE, baseSource)]);
    expect(extractGlbs(result.archive)).toHaveLength(1);
  });

  test("falls back to the primary provider url when the mirror override fails", () =>
    noDefaultMirror(async () => {
      const calls: string[] = [];
      const archive = zipWithGlb("from-primary");
      const fetchImpl = fetchFrom({ [PRIMARY_URL]: () => new Response(archive, { status: 200 }) }, calls);

      const result = await downloadPackArchive(baseSource, { mirrorBase: MIRROR_BASE, fetchImpl });

      expect(result.url).toBe(PRIMARY_URL);
      expect(calls).toEqual([mirrorOverrideUrl(MIRROR_BASE, baseSource), PRIMARY_URL]);
    }));

  test("falls back to the pack's own mirror when the mirror override and primary both fail", () =>
    noDefaultMirror(async () => {
      const calls: string[] = [];
      const archive = zipWithGlb("from-pack-mirror");
      const source: AssetSource = { ...baseSource, mirror: PACK_MIRROR_URL };
      const fetchImpl = fetchFrom({ [PACK_MIRROR_URL]: () => new Response(archive, { status: 200 }) }, calls);

      const result = await downloadPackArchive(source, { mirrorBase: MIRROR_BASE, fetchImpl });

      expect(result.url).toBe(PACK_MIRROR_URL);
      expect(calls).toEqual([mirrorOverrideUrl(MIRROR_BASE, source), PRIMARY_URL, PACK_MIRROR_URL]);
    }));

  test("tries the primary url straight away when no mirror base override is set", () =>
    noDefaultMirror(async () => {
      const calls: string[] = [];
      const archive = zipWithGlb();
      const fetchImpl = fetchFrom({ [PRIMARY_URL]: () => new Response(archive, { status: 200 }) }, calls);

      const result = await downloadPackArchive(baseSource, { fetchImpl });

      expect(result.url).toBe(PRIMARY_URL);
      expect(calls).toEqual([PRIMARY_URL]);
    }));

  test("resolves a scrape-type primary source through its page before falling back", () =>
    noDefaultMirror(async () => {
      const scrapeSource: AssetSource = {
        ...baseSource,
        download: { scrape: "https://kenney.nl/assets/nature-kit" },
        mirror: PACK_MIRROR_URL,
      };
      const calls: string[] = [];
      const archive = zipWithGlb("from-pack-mirror-after-scrape");
      const fetchImpl = fetchFrom(
        {
          "https://kenney.nl/assets/nature-kit": () =>
            new Response("<html>no zip link here</html>", { status: 200 }),
          [PACK_MIRROR_URL]: () => new Response(archive, { status: 200 }),
        },
        calls,
      );

      const result = await downloadPackArchive(scrapeSource, { fetchImpl });

      expect(result.url).toBe(PACK_MIRROR_URL);
      expect(calls).toEqual(["https://kenney.nl/assets/nature-kit", PACK_MIRROR_URL]);
    }));

  test("rejects bytes from a mirror that don't match the pinned sha256 and falls through to a source that does", () =>
    noDefaultMirror(async () => {
      const goodArchive = zipWithGlb("good-bytes");
      const badArchive = zipWithGlb("tampered-bytes");
      const sha256 = await sha256Hex(goodArchive);
      const source: AssetSource = { ...baseSource, download: { url: PRIMARY_URL, sha256 } };
      const calls: string[] = [];
      const fetchImpl = fetchFrom(
        {
          [mirrorOverrideUrl(MIRROR_BASE, source)]: () => new Response(badArchive, { status: 200 }),
          [PRIMARY_URL]: () => new Response(goodArchive, { status: 200 }),
        },
        calls,
      );

      const result = await downloadPackArchive(source, { mirrorBase: MIRROR_BASE, fetchImpl });

      expect(result.url).toBe(PRIMARY_URL);
      expect(new TextDecoder().decode(extractGlbs(result.archive)[0]!.bytes)).toBe("good-bytes");
      expect(calls).toEqual([mirrorOverrideUrl(MIRROR_BASE, source), PRIMARY_URL]);
    }));

  test("throws an aggregated error naming every attempted url when all sources fail", () =>
    noDefaultMirror(async () => {
      const source: AssetSource = { ...baseSource, mirror: PACK_MIRROR_URL };
      const fetchImpl = fetchFrom({});

      await expect(downloadPackArchive(source, { mirrorBase: MIRROR_BASE, fetchImpl })).rejects.toThrow(
        /failed to download kenney-nature from all 3 source\(s\)/,
      );

      try {
        await downloadPackArchive(source, { mirrorBase: MIRROR_BASE, fetchImpl });
        throw new Error("expected downloadPackArchive to reject");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toContain(mirrorOverrideUrl(MIRROR_BASE, source));
        expect(message).toContain(PRIMARY_URL);
        expect(message).toContain(PACK_MIRROR_URL);
      }
    }));

  test("tries the default GitHub-release mirror after the override and before the provider", async () => {
    const calls: string[] = [];
    const archive = zipWithGlb("from-default-release");
    const fetchImpl = fetchFrom(
      { [defaultReleaseUrl(baseSource)]: () => new Response(archive, { status: 200 }) },
      calls,
    );

    const result = await downloadPackArchive(baseSource, { mirrorBase: MIRROR_BASE, fetchImpl });

    expect(result.url).toBe(defaultReleaseUrl(baseSource));
    expect(calls).toEqual([mirrorOverrideUrl(MIRROR_BASE, baseSource), defaultReleaseUrl(baseSource)]);
  });

  test("JGENGINE_ASSETS_NO_DEFAULT_MIRROR=1 skips the default release mirror", () =>
    noDefaultMirror(async () => {
      const calls: string[] = [];
      const archive = zipWithGlb("from-primary-no-default");
      const fetchImpl = fetchFrom({ [PRIMARY_URL]: () => new Response(archive, { status: 200 }) }, calls);

      const result = await downloadPackArchive(baseSource, { fetchImpl });

      expect(result.url).toBe(PRIMARY_URL);
      expect(calls).toEqual([PRIMARY_URL]);
    }));

  test("succeeds from the default release mirror alone when nothing else is set", async () => {
    const calls: string[] = [];
    const archive = zipWithGlb("only-default-release");
    const fetchImpl = fetchFrom(
      { [defaultReleaseUrl(baseSource)]: () => new Response(archive, { status: 200 }) },
      calls,
    );

    const result = await downloadPackArchive(baseSource, { fetchImpl });

    expect(result.url).toBe(defaultReleaseUrl(baseSource));
    expect(calls).toEqual([defaultReleaseUrl(baseSource)]);
    expect(extractGlbs(result.archive)).toHaveLength(1);
  });
});
