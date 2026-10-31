import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { zipSync } from "fflate";

import { MODEL_LIBRARY } from "./catalogs/modelLibrary";
import { DEFAULT_RELEASE_BASE, httpFailure } from "./download";
import { modelMirrorAssetName, modelMirrorUrls, pullMirroredModel, zipPulledModel } from "./modelMirror";
import { pullLibraryModel } from "./modelLibraryPull";
import { pullRocketboxModel } from "./rocketboxPull";

const dirs: string[] = [];
const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "jg-mirror-test-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const rocketbox = MODEL_LIBRARY.find((entry) => entry.origin.provider === "rocketbox")!;
const khronos = MODEL_LIBRARY.find((entry) => entry.origin.provider === "khronos")!;

function fakeMirror(entryName: string, files: Record<string, Uint8Array>, result: object) {
  const dir = scratch();
  const asset = `${DEFAULT_RELEASE_BASE}/${modelMirrorAssetName(entryName)}`;
  const zip = zipSync({ ...files, "pulled.json": new TextEncoder().encode(JSON.stringify(result)) });
  const urls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    return url === asset ? new Response(zip) : new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  return { dir, urls, fetchImpl };
}

describe("model mirror", () => {
  test("names the zip after the entry and tries the override before the release", () => {
    expect(modelMirrorAssetName("rocketbox/adult01")).toBe("model-library-rocketbox-adult01.zip");
    expect(modelMirrorUrls("a/b", { JGENGINE_ASSETS_MIRROR: "https://m.example/x/" })).toEqual([
      "https://m.example/x/model-library/a-b.zip",
      `${DEFAULT_RELEASE_BASE}/model-library-a-b.zip`,
    ]);
    expect(modelMirrorUrls("a", { JGENGINE_ASSETS_NO_DEFAULT_MIRROR: "1" })).toEqual([]);
  });

  test("a Rocketbox pull is served from the mirror and never touches api.github.com", async () => {
    const mirror = fakeMirror(rocketbox.name, { "model.glb": new Uint8Array([1, 2, 3]) }, { name: rocketbox.name, bytes: 3, triangles: 9, bones: 2, clips: ["Idle"], height: 1.7 });
    const pulled = await pullRocketboxModel(rocketbox, { modelsRoot: mirror.dir, fetchImpl: mirror.fetchImpl });
    expect(pulled.triangles).toBe(9);
    expect(readFileSync(pulled.file)).toEqual(Buffer.from([1, 2, 3]));
    expect(mirror.urls.every((url) => url.startsWith(DEFAULT_RELEASE_BASE))).toBe(true);
    expect(mirror.urls.some((url) => url.includes("api.github.com"))).toBe(false);
  });

  test("a Khronos pull is served from the mirror and never touches api.github.com", async () => {
    const mirror = fakeMirror(khronos.name, { "near.gltf": new Uint8Array([1]), "far.gltf": new Uint8Array([2]) }, { name: khronos.name, bytes: 2, nearTriangles: 5, farTriangles: 2, size: [1, 1, 1], roots: [] });
    const pulled = await pullLibraryModel(khronos, { modelsRoot: mirror.dir, fetchImpl: mirror.fetchImpl });
    expect(pulled.nearTriangles).toBe(5);
    expect(existsSync(join(pulled.dir, "far.gltf"))).toBe(true);
    expect(mirror.urls.some((url) => url.includes("api.github.com") || url.includes("raw.githubusercontent.com"))).toBe(false);
  });

  test("a mirror miss returns null so the pull falls back to the source", async () => {
    const miss = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    expect(await pullMirroredModel("x", scratch(), miss)).toBeNull();
  });

  test("zipPulledModel round-trips through pullMirroredModel", async () => {
    const source = scratch();
    await Bun.write(join(source, "near.gltf"), "n");
    const zip = zipPulledModel(source, { bytes: 1 });
    const fetchImpl = (async () => new Response(zip)) as unknown as typeof fetch;
    const out = scratch();
    const restored = await pullMirroredModel<{ bytes: number }>("lib/x", out, fetchImpl, {});
    expect(restored?.recorded.bytes).toBe(1);
    expect(readFileSync(join(restored!.dir, "near.gltf"), "utf8")).toBe("n");
  });

  test("a 403 saying GitHub access is not enabled is named a sandbox policy denial", async () => {
    const denied = new Response("GitHub access to this repository is not enabled for this session", { status: 403 });
    expect((await httpFailure("https://api.github.com/x", denied)).message).toContain("sandbox policy denial");
    expect((await httpFailure("https://x", new Response("", { status: 403 }))).message).toBe("https://x: HTTP 403");
  });
});
