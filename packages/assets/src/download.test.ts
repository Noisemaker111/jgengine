import { describe, expect, test } from "bun:test";
import { zipSync } from "fflate";

import {
  defaultReleaseUrl,
  downloadPackArchive,
  extractGlbs,
  extractSpriteFiles,
  mirrorOverrideUrl,
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
