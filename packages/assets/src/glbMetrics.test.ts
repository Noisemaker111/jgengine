import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkAssetBudget, createAssetBudgetReport, readGlbFileMetrics } from "./assetBudget";
import { readGlbMetrics } from "./glbMetrics";
import { indexSourceDir, reindex } from "./indexGen";
import { sourceById } from "./sources";

const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS9sAAAAASUVORK5CYII=",
    "base64",
  ),
);

function pack(json: unknown, bin?: Uint8Array): Uint8Array {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(encoded.length / 4) * 4;
  const binLength = bin === undefined ? 0 : Math.ceil(bin.length / 4) * 4;
  const bytes = new Uint8Array(20 + padded + (bin === undefined ? 0 : 8 + binLength));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + padded);
  bytes.set(encoded, 20);
  if (bin !== undefined) {
    view.setUint32(20 + padded, binLength, true);
    view.setUint32(24 + padded, 0x004e4942, true);
    bytes.set(bin, 28 + padded);
  }
  return bytes;
}

function geometry(
  options: {
    mode?: number;
    indexed?: boolean;
    vertexCount?: number;
    componentType?: number;
    indices?: number[];
    stride?: number;
  } = {},
) {
  const {
    mode = 4,
    indexed = true,
    vertexCount = 4,
    componentType = 5123,
    indices = [0, 1, 2, 0, 2, 3],
    stride = 16,
  } = options;
  const indexSize = componentType === 5121 ? 1 : componentType === 5123 ? 2 : 4;
  const positionOffset = 4;
  const positionLength = vertexCount * stride;
  const indexOffset = positionOffset + positionLength;
  const bin = new Uint8Array(indexOffset + indices.length * indexSize + png.length);
  const data = new DataView(bin.buffer);
  for (let index = 0; index < vertexCount; index += 1) {
    data.setFloat32(positionOffset + index * stride, index % 2, true);
    data.setFloat32(positionOffset + index * stride + 4, 0, true);
    data.setFloat32(positionOffset + index * stride + 8, Math.floor(index / 2), true);
  }
  for (let index = 0; index < indices.length; index += 1) {
    if (indexSize === 1) data.setUint8(indexOffset + index * indexSize, indices[index]!);
    else if (indexSize === 2)
      data.setUint16(indexOffset + index * indexSize, indices[index]!, true);
    else data.setUint32(indexOffset + index * indexSize, indices[index]!, true);
  }
  const imageOffset = indexOffset + indices.length * indexSize;
  bin.set(png, imageOffset);
  const json = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: positionOffset,
        byteLength: positionLength,
        byteStride: stride,
      },
      {
        buffer: 0,
        byteOffset: indexOffset,
        byteLength: indices.length * indexSize,
      },
      { buffer: 0, byteOffset: imageOffset, byteLength: png.length },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        type: "VEC3",
        count: vertexCount,
        min: [0, 0, 0],
        max: [1, 0, 1],
      },
      { bufferView: 1, componentType, type: "SCALAR", count: indices.length },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            ...(indexed ? { indices: 1 } : {}),
            mode,
          },
        ],
      },
    ],
    scenes: [{ nodes: [0, 1] }],
    nodes: [{ mesh: 0 }, { mesh: 0 }],
    images: [{ bufferView: 2 }],
    animations: [{ name: "Walk" }],
  };
  return { json, bin };
}

const directories: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "jgengine-budget-"));
  directories.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("offline GLB metrics", () => {
  test("counts actual indexed primitives once, honors interleaved geometry, and measures embedded PNG", () => {
    const fixture = geometry();
    const bytes = pack(fixture.json, fixture.bin);
    expect(readGlbMetrics(bytes)).toEqual({
      glbBytes: bytes.length,
      byteLength: bytes.length,
      triangles: 2,
      primitives: 1,
      maxTextureDimension: 1,
      textures: [{ image: 0, width: 1, height: 1, byteLength: png.length }],
    });
  });

  test.each([5121, 5123, 5125])("reads unsigned index component type %i", (componentType) => {
    const fixture = geometry({ componentType });
    expect(readGlbMetrics(pack(fixture.json, fixture.bin)).triangles).toBe(2);
    fixture.bin.fill(
      255,
      fixture.json.bufferViews[1]!.byteOffset,
      fixture.json.bufferViews[1]!.byteOffset +
        (componentType === 5121 ? 1 : componentType === 5123 ? 2 : 4),
    );
    expect(() => readGlbMetrics(pack(fixture.json, fixture.bin))).toThrow("exceeds POSITION count");
  });

  test.each([
    [4, 6, 2],
    [5, 4, 2],
    [6, 5, 3],
    [0, 4, 0],
    [1, 4, 0],
  ])("counts unindexed mode %i vertices %i", (mode, vertexCount, triangles) => {
    const fixture = geometry({ mode, vertexCount, indexed: false });
    expect(readGlbMetrics(pack(fixture.json, fixture.bin)).triangles).toBe(triangles);
  });

  test("rejects truncated geometry, wrong triangle counts, and incomplete compression", () => {
    const fixture = geometry();
    fixture.json.accessors[0]!.count = 100;
    expect(() => readGlbMetrics(pack(fixture.json, fixture.bin))).toThrow("out of bounds");
    const invalid = geometry({ indices: [0, 1, 2, 3] });
    expect(() => readGlbMetrics(pack(invalid.json, invalid.bin))).toThrow("not divisible by 3");
    const compressed = geometry();
    expect(() =>
      readGlbMetrics(
        pack(
          {
            ...compressed.json,
            extensionsRequired: ["EXT_meshopt_compression"],
          },
          compressed.bin,
        ),
      ),
    ).toThrow("requires a decoder");
  });

  test("validates sparse indices instead of counting an invalid accessor", () => {
    const fixture = geometry();
    const json = {
      ...fixture.json,
      accessors: [
        fixture.json.accessors[0],
        {
          type: "SCALAR",
          componentType: 5123,
          count: 6,
          sparse: {
            count: 3,
            indices: { bufferView: 3, componentType: 5121 },
            values: { bufferView: 1 },
          },
        },
      ],
      bufferViews: [
        ...fixture.json.bufferViews,
        { buffer: 0, byteOffset: fixture.bin.length, byteLength: 3 },
      ],
    };
    const bin = new Uint8Array(fixture.bin.length + 3);
    bin.set(fixture.bin);
    bin.set([0, 1, 2], fixture.bin.length);
    json.buffers[0]!.byteLength = bin.length;
    expect(readGlbMetrics(pack(json, bin)).triangles).toBe(2);
    json.accessors[1]!.count = 6_000_000_000_000;
    expect(readGlbMetrics(pack(json, bin)).triangles).toBe(2_000_000_000_000);
    json.accessors[1]!.count = 6;
    bin.set([0, 1, 8], fixture.bin.length);
    expect(() => readGlbMetrics(pack(json, bin))).toThrow("sparse indices");
  });

  test("rejects incorrect GLB headers and truncated chunks", () => {
    const fixture = geometry();
    const bytes = pack(fixture.json, fixture.bin);
    expect(() => readGlbMetrics(bytes.subarray(0, bytes.length - 1))).toThrow(
      "header or file length",
    );
    const view = new DataView(bytes.buffer);
    view.setUint32(12, bytes.length, true);
    expect(() => readGlbMetrics(bytes)).toThrow("chunk length");
    expect(() => readGlbMetrics(new Uint8Array())).toThrow("header");
  });

  test("counts local external buffers/images once and resolves data URIs without a reader", () => {
    const fixture = geometry();
    const json = {
      ...fixture.json,
      buffers: [{ uri: "geometry.bin", byteLength: fixture.bin.length }],
      images: [{ uri: "color.png" }, { uri: "color.png" }],
    };
    const bytes = pack(json);
    const calls: string[] = [];
    const metrics = readGlbMetrics(bytes, (uri) => {
      calls.push(uri);
      return uri === "geometry.bin" ? fixture.bin : png;
    });
    expect(metrics.byteLength).toBe(bytes.length + fixture.bin.length + png.length);
    expect(calls).toEqual(["geometry.bin", "color.png"]);
    expect(() => readGlbMetrics(bytes)).toThrow("external resource not supplied");
    const embedded = pack(
      {
        ...fixture.json,
        images: [
          {
            uri: `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
          },
        ],
      },
      fixture.bin,
    );
    expect(readGlbMetrics(embedded).byteLength).toBe(embedded.length);
  });

  test("reads JPEG, WebP, and KTX2 dimensions from their encoded headers", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 8, 8, 0, 4, 0, 8, 0, 0xff, 0xd9]);
    const webp = new Uint8Array(30);
    webp.set(new TextEncoder().encode("RIFF"));
    webp.set(new TextEncoder().encode("WEBPVP8X"), 8);
    const webpView = new DataView(webp.buffer);
    webpView.setUint32(4, 22, true);
    webpView.setUint32(16, 10, true);
    webp[24] = 7;
    webp[27] = 3;
    const ktx = new Uint8Array(80);
    ktx.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ktxView = new DataView(ktx.buffer);
    ktxView.setUint32(20, 8, true);
    ktxView.setUint32(24, 4, true);
    for (const image of [jpeg, webp, ktx]) {
      const fixture = geometry();
      const bytes = pack(
        {
          ...fixture.json,
          images: [
            {
              uri: `data:application/octet-stream;base64,${Buffer.from(image).toString("base64")}`,
            },
          ],
        },
        fixture.bin,
      );
      expect(readGlbMetrics(bytes).textures[0]).toEqual({
        image: 0,
        width: 8,
        height: 4,
        byteLength: image.length,
      });
    }
  });

  test("unsupported images fail rather than reporting zero resolution", () => {
    const fixture = geometry();
    fixture.bin.fill(0, fixture.json.bufferViews[2]!.byteOffset);
    expect(() => readGlbMetrics(pack(fixture.json, fixture.bin))).toThrow(
      "image 0: unreadable image dimensions",
    );
  });
});

describe("budget enforcement and indexing", () => {
  test("equality passes, exceeding any configured limit fails, and invalid limits are rejected", () => {
    const fixture = geometry();
    const metrics = readGlbMetrics(pack(fixture.json, fixture.bin));
    expect(
      checkAssetBudget(metrics, {
        maxBytes: metrics.byteLength,
        maxTriangles: 2,
        maxTextureDimension: 1,
      }),
    ).toEqual([]);
    expect(
      checkAssetBudget(metrics, {
        maxBytes: 0,
        maxTriangles: 1,
        maxTextureDimension: 0,
      }),
    ).toEqual([
      `byteLength ${metrics.byteLength} exceeds maxBytes 0`,
      "triangles 2 exceeds maxTriangles 1",
      "maxTextureDimension 1 exceeds maxTextureDimension 0",
    ]);
    expect(() => checkAssetBudget(metrics, { maxTriangles: NaN })).toThrow("safe integer");
  });

  test("scans arbitrary imported folders deterministically, isolates errors, and never writes models", () => {
    const root = scratch();
    mkdirSync(join(root, "imported"));
    const fixture = geometry();
    const bytes = pack(fixture.json, fixture.bin);
    writeFileSync(join(root, "z.glb"), bytes);
    writeFileSync(join(root, "imported", "a.glb"), bytes);
    writeFileSync(join(root, "broken.glb"), "not a model");
    const report = createAssetBudgetReport(root, { maxTriangles: 1 });
    expect(report.ok).toBe(false);
    expect(report.entries.map((entry) => entry.file)).toEqual([
      "broken.glb",
      "imported/a.glb",
      "z.glb",
    ]);
    expect(report.errors).toEqual([
      "broken.glb: invalid GLB v2 header or file length",
      "imported/a.glb: triangles 2 exceeds maxTriangles 1",
      "z.glb: triangles 2 exceeds maxTriangles 1",
    ]);
    expect(createAssetBudgetReport(root, { maxTriangles: 1 })).toEqual(report);
    expect(readFileSync(join(root, "z.glb"))).toEqual(Buffer.from(bytes));
  });

  test("missing provisioning and escaped or remote resources fail offline", () => {
    const root = scratch();
    expect(createAssetBudgetReport(root).errors[0]).toContain("no GLB files found");
    const fixture = geometry();
    const file = join(root, "model.glb");
    const external = (uri: string) => pack({ ...fixture.json, images: [{ uri }] }, fixture.bin);
    writeFileSync(file, external("https://example.com/image.png"));
    expect(() => readGlbFileMetrics(file)).toThrow("local relative URI");
    writeFileSync(file, external("missing.png"));
    expect(createAssetBudgetReport(file).ok).toBe(false);
    const outside = scratch();
    writeFileSync(join(outside, "image.png"), png);
    symlinkSync(join(outside, "image.png"), join(root, "linked.png"));
    writeFileSync(file, external("linked.png"));
    expect(() => readGlbFileMetrics(file)).toThrow("escapes resource root");
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "image.png"), png);
    writeFileSync(join(root, "nested", "model.glb"), external("../image.png"));
    rmSync(file);
    expect(createAssetBudgetReport(root).ok).toBe(true);
  });

  test("symlinked GLBs are inspected and symlink directories cannot silently bypass a scan", () => {
    const root = scratch();
    const fixture = geometry();
    const bytes = pack(fixture.json, fixture.bin);
    writeFileSync(join(root, "model.glb"), bytes);
    symlinkSync(join(root, "model.glb"), join(root, "alias.glb"));
    expect(createAssetBudgetReport(root).entries.map((entry) => entry.file)).toEqual([
      "alias.glb",
      "model.glb",
    ]);
    const outside = scratch();
    writeFileSync(join(outside, "escape.glb"), bytes);
    symlinkSync(join(outside, "escape.glb"), join(root, "escape.glb"));
    expect(createAssetBudgetReport(root).errors).toContain(
      "escape.glb: model escapes resource root",
    );
    symlinkSync(outside, join(root, "hidden"));
    expect(createAssetBudgetReport(root).errors).toContain(
      "hidden: symlink directories cannot be scanned",
    );
  });

  test("reindex adds real metrics while preserving source ids, files, bounds, and clips", () => {
    const root = scratch();
    const source = sourceById.get("quaternius-stylized-nature")!;
    const models = join(root, "models");
    const sourceDir = join(models, source.id);
    mkdirSync(sourceDir, { recursive: true });
    const fixture = geometry();
    writeFileSync(join(sourceDir, "custom.glb"), pack(fixture.json, fixture.bin));
    const entries = indexSourceDir(source, sourceDir);
    expect(entries[0]).toMatchObject({
      id: `${source.id}/custom`,
      source: source.id,
      file: "custom.glb",
      clips: ["Walk"],
      metrics: { triangles: 2, maxTextureDimension: 1 },
      dims: { footprint: { w: 1, d: 1 } },
    });
    const generated = join(root, "generated");
    expect(reindex(models, generated).total).toBe(1);
    expect(JSON.parse(readFileSync(join(generated, `${source.id}.json`), "utf8"))).toEqual(entries);
    expect(readFileSync(join(generated, "index.js"), "utf8")).toContain(`./${source.id}.json`);
  });
});

const cli = resolve(dirname(fileURLToPath(import.meta.url)), "cli/pull.ts");
function runCli(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

describe("assets budget CLI", () => {
  test("outputs deterministic JSON with actionable failures and nonzero CI status", () => {
    const root = scratch();
    const fixture = geometry();
    const bytes = pack(fixture.json, fixture.bin);
    writeFileSync(join(root, "hero.glb"), bytes);
    const args = ["budget", root, "--max-triangles", "1", "--max-texture-dimension", "0", "--json"];
    const failed = runCli(args);
    expect(failed.status).toBe(1);
    const report = JSON.parse(failed.stdout);
    expect(report.errors).toEqual([
      "hero.glb: triangles 2 exceeds maxTriangles 1",
      "hero.glb: maxTextureDimension 1 exceeds maxTextureDimension 0",
    ]);
    expect(runCli(args).stdout).toBe(failed.stdout);
    const pass = runCli([
      "budget",
      root,
      "--max-bytes",
      String(bytes.length),
      "--max-triangles",
      "2",
      "--json",
    ]);
    expect(pass.status).toBe(0);
    expect(JSON.parse(pass.stdout).ok).toBe(true);
    expect(readFileSync(join(root, "hero.glb"))).toEqual(Buffer.from(bytes));
  });

  test.each([
    ["--max-triangles"],
    ["--max-bytes", "NaN"],
    ["--max-texture-dimension", "-1"],
    ["--typo"],
    ["--max-triangles", "1", "--max-triangles", "2"],
  ])("rejects invalid flags %j", (...flags) => {
    const result = runCli(["budget", scratch(), ...flags]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("error:");
  });

  test("budget checks do not alter populated offline pull semantics or generated catalogs", () => {
    const root = scratch();
    const dir = join(root, "models", "quaternius-stylized-nature");
    mkdirSync(dir, { recursive: true });
    const fixture = geometry();
    const bytes = pack(fixture.json, fixture.bin);
    writeFileSync(join(dir, "own-art.glb"), bytes);
    const generated = resolve(dirname(cli), "../generated/quaternius-stylized-nature.json");
    const indexBefore = readFileSync(generated);
    expect(runCli(["budget", join(root, "models"), "--max-triangles", "1"]).status).toBe(1);
    const pull = runCli(["pull", "quaternius-stylized-nature", "--dir", root, "--offline"]);
    expect(pull.status).toBe(0);
    expect(pull.stdout).toContain("skipping network");
    expect(readFileSync(join(dir, "own-art.glb"))).toEqual(Buffer.from(bytes));
    expect(readFileSync(generated)).toEqual(indexBefore);
  });
});
