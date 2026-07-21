import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";

import { mirrorOverrideUrl, type FetchLike } from "../download";
import { sourceById } from "../sources";
import { cmdPull } from "./pull";

const source = sourceById.get("quaternius-stylized-nature")!;
const originalFetch = globalThis.fetch;

function zipWithGlb(content: string): Uint8Array {
  return zipSync({ "model.glb": new TextEncoder().encode(content) });
}

// Every case seeds its own unique tmp dir (mkdtemp) and passes it via --dir, so
// the offline/populated checks never depend on ambient /tmp state — a full
// test:all run and an isolated run see the same empty-then-seeded directory
// (issue #1504).
function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), `jgengine-assets-pull-${process.pid}-`));
}

// The first case to touch cmdPull pays the cold module-resolution cost of the
// whole assets CLI graph (generated index, registry, sources); under a full
// test:all run that has exceeded Bun's default 5s timeout. Give the cmdPull
// cases real headroom instead of racing the runner (issue #1504).
const PULL_TIMEOUT_MS = 30_000;

function neverFetch(): FetchLike {
  return (async () => {
    throw new Error("network should not be reached");
  }) as FetchLike;
}

function fetchFrom(table: Record<string, () => Response>, calls: string[] = []): FetchLike {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const respond = table[url];
    return respond === undefined ? new Response("not found", { status: 404 }) : respond();
  }) as FetchLike;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.JGENGINE_ASSETS_MIRROR;
  delete process.env.JGENGINE_ASSETS_NO_DEFAULT_MIRROR;
});

describe("cmdPull --offline", () => {
  test("fails informatively when the target dir is not yet populated", async () => {
    const dir = makeTmpDir();
    globalThis.fetch = neverFetch();
    const exitSpy = spyOn(process, "exit").mockImplementation((code?: number): never => {
      throw new Error(`process.exit:${code}`);
    });

    try {
      await expect(cmdPull(["quaternius-stylized-nature", "--dir", dir, "--offline"])).rejects.toThrow("process.exit:1");
    } finally {
      exitSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  }, PULL_TIMEOUT_MS);

  test("skips the network entirely when the target dir is already populated", async () => {
    const dir = makeTmpDir();
    const outDir = join(dir, "models", "quaternius-stylized-nature");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "existing.glb"), "already-here");
    globalThis.fetch = neverFetch();

    await cmdPull(["quaternius-stylized-nature", "--dir", dir, "--offline"]);

    rmSync(dir, { recursive: true, force: true });
  }, PULL_TIMEOUT_MS);
});

describe("cmdPull mirror resolution", () => {
  test("JGENGINE_ASSETS_MIRROR is tried before the primary provider path", async () => {
    const dir = makeTmpDir();
    process.env.JGENGINE_ASSETS_MIRROR = "https://env-mirror.example.com";
    const expectedUrl = mirrorOverrideUrl("https://env-mirror.example.com", source);
    const calls: string[] = [];
    globalThis.fetch = fetchFrom(
      { [expectedUrl]: () => new Response(zipWithGlb("from-env-mirror"), { status: 200 }) },
      calls,
    );

    await cmdPull(["quaternius-stylized-nature", "--dir", dir]);

    expect(calls).toEqual([expectedUrl]);
    const written = readFileSync(join(dir, "models", "quaternius-stylized-nature", "model.glb"), "utf8");
    expect(written).toBe("from-env-mirror");

    rmSync(dir, { recursive: true, force: true });
  }, PULL_TIMEOUT_MS);

  test("--mirror flag takes precedence over JGENGINE_ASSETS_MIRROR", async () => {
    const dir = makeTmpDir();
    process.env.JGENGINE_ASSETS_MIRROR = "https://env-mirror.example.com";
    const flagBase = "https://flag-mirror.example.com";
    const expectedUrl = mirrorOverrideUrl(flagBase, source);
    const calls: string[] = [];
    globalThis.fetch = fetchFrom(
      { [expectedUrl]: () => new Response(zipWithGlb("from-flag-mirror"), { status: 200 }) },
      calls,
    );

    await cmdPull(["quaternius-stylized-nature", "--dir", dir, "--mirror", flagBase]);

    expect(calls).toEqual([expectedUrl]);

    rmSync(dir, { recursive: true, force: true });
  }, PULL_TIMEOUT_MS);

  test("falls through to the primary provider path when no mirror is configured", async () => {
    process.env.JGENGINE_ASSETS_NO_DEFAULT_MIRROR = "1";
    const dir = makeTmpDir();
    const primaryUrl =
      typeof source.download === "object" && "url" in source.download
        ? source.download.url
        : "https://opengameart.org/sites/default/files/stylized_nature_megakitstandard.zip";
    const calls: string[] = [];
    globalThis.fetch = fetchFrom(
      {
        [primaryUrl]: () => new Response(zipWithGlb("from-primary"), { status: 200 }),
      },
      calls,
    );

    await cmdPull(["quaternius-stylized-nature", "--dir", dir]);

    expect(calls).toEqual([primaryUrl]);
    expect(readFileSync(join(dir, "models", "quaternius-stylized-nature", "model.glb"), "utf8")).toBe(
      "from-primary",
    );

    rmSync(dir, { recursive: true, force: true });
  }, PULL_TIMEOUT_MS);
});

