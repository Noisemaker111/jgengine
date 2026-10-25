import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Document, NodeIO, type GLTF, type Node } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, getBounds, meshopt, prune, reorder, simplify, weld } from "@gltf-transform/functions";
import jpeg from "jpeg-js";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

import { libraryModelDir, type ModelLibraryEntry, type PolyHavenModelOrigin } from "./catalogs/modelLibrary";

/** Poly Haven's public asset API; files are served from its own CDN (`dl.polyhaven.org`). */
const POLYHAVEN_API = "https://api.polyhaven.com";

interface PolyHavenFile {
  url: string;
  md5: string;
  size: number;
}

interface PolyHavenGltf extends PolyHavenFile {
  include: Record<string, PolyHavenFile>;
}

/** Where {@link pullLibraryModel} writes and how it fetches. */
export interface PullLibraryModelOptions {
  /** The models root (`<game>/public/models`); the entry lands in `<root>/library/<name>/`. */
  modelsRoot: string;
  fetchImpl?: typeof fetch;
  /** Longest texture edge kept, in pixels; larger maps are halved until they fit. Default 512. */
  maxTexture?: number;
}

/** Halve a JPEG (2x2 box filter) until its longest edge fits `max`; smaller maps pass through untouched. */
export function downscaleJpeg(bytes: Uint8Array, max: number): Uint8Array {
  const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
  let { width, height } = image;
  if (Math.max(width, height) <= max) return bytes;
  let data: Uint8Array = image.data;
  while (Math.max(width, height) > max && width > 1 && height > 1) {
    const w = width >> 1;
    const h = height >> 1;
    const next = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const a = ((y * 2) * width + x * 2) * 4;
        const b = a + width * 4;
        for (let c = 0; c < 4; c += 1) {
          next[(y * w + x) * 4 + c] = (data[a + c]! + data[a + 4 + c]! + data[b + c]! + data[b + 4 + c]! + 2) >> 2;
        }
      }
    }
    data = next;
    width = w;
    height = h;
  }
  return new Uint8Array(jpeg.encode({ data, width, height }, 85).data);
}

/** What one pull wrote: folder, bytes, triangle counts per level and measured size. */
export interface PulledLibraryModel {
  name: string;
  dir: string;
  bytes: number;
  nearTriangles: number;
  farTriangles: number;
  /** Real-world size `[width, height, depth]` in metres after grounding. */
  size: readonly [number, number, number];
  /** Top-level node names the source file carried, before `keep` filtering. */
  roots: readonly string[];
}

async function fetchVerified(fetchImpl: typeof fetch, file: PolyHavenFile): Promise<Uint8Array> {
  const host = new URL(file.url).hostname;
  if (host !== "dl.polyhaven.org" && host !== "api.polyhaven.com") {
    throw new Error(`refusing a Poly Haven file served from ${host}`);
  }
  const response = await fetchImpl(file.url);
  if (!response.ok) throw new Error(`${file.url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const md5 = createHash("md5").update(bytes).digest("hex");
  if (md5 !== file.md5) throw new Error(`${file.url}: md5 ${md5} does not match Poly Haven's ${file.md5}`);
  return bytes;
}

function triangles(document: Document): number {
  let count = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      count += (primitive.getIndices()?.getCount() ?? primitive.getAttribute("POSITION")?.getCount() ?? 0) / 3;
    }
  }
  return Math.round(count);
}

/**
 * Re-root the scene under one node that puts the model's footprint centre on the origin and its
 * lowest point on y = 0, so `anchor: "origin"` places it standing on the ground.
 */
function ground(document: Document): readonly [number, number, number] {
  const scene = document.getRoot().listScenes()[0]!;
  const { min, max } = getBounds(scene);
  const root: Node = document.createNode("library_root").setTranslation([-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2]);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    root.addChild(child);
  }
  scene.addChild(root);
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}

async function buildLevel(
  io: NodeIO,
  sources: Record<string, Uint8Array>,
  gltfName: string,
  origin: PolyHavenModelOrigin,
  ratio: number,
  error: number,
): Promise<{ document: Document; roots: string[]; size: readonly [number, number, number] }> {
  const json = JSON.parse(new TextDecoder().decode(sources[gltfName]!)) as GLTF.IGLTF;
  const resources: Record<string, Uint8Array> = {};
  for (const [path, bytes] of Object.entries(sources)) if (path !== gltfName) resources[path] = bytes;
  const document = await io.readJSON({ json, resources });
  const scene = document.getRoot().listScenes()[0]!;
  const roots = scene.listChildren().map((node) => node.getName());
  if (origin.keep !== undefined) {
    const keep = new RegExp(origin.keep);
    for (const node of scene.listChildren()) if (!keep.test(node.getName())) node.dispose();
  }
  await document.transform(
    dedup(),
    prune(),
    weld(),
    ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error })] : []),
    prune(),
  );
  const size = ground(document);
  await document.transform(reorder({ encoder: MeshoptEncoder }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  return { document, roots, size };
}

function dirBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir)) total += statSync(join(dir, entry)).size;
  return total;
}

/**
 * Download one library model from its official source, simplify it into a near and a far level,
 * meshopt-compress both and write them as `near.gltf` / `far.gltf` sharing one set of textures (so
 * the far level costs geometry only). Every file is checked against the source's published md5.
 */
export async function pullLibraryModel(entry: ModelLibraryEntry, options: PullLibraryModelOptions): Promise<PulledLibraryModel> {
  if (entry.origin.provider !== "polyhaven") {
    throw new Error(`${entry.name} is a generated model: the game commits its GLB; there is nothing to pull`);
  }
  const origin = entry.origin;
  const fetchImpl = options.fetchImpl ?? fetch;
  const listing = await fetchImpl(`${POLYHAVEN_API}/files/${origin.asset}`);
  if (!listing.ok) throw new Error(`${POLYHAVEN_API}/files/${origin.asset}: HTTP ${listing.status}`);
  const files = (await listing.json()) as { gltf?: Record<string, { gltf?: PolyHavenGltf }> };
  const gltf = files.gltf?.["1k"]?.gltf;
  if (gltf === undefined) throw new Error(`Poly Haven lists no 1k glTF for ${origin.asset}`);

  const gltfName = `${origin.asset}.gltf`;
  const sources: Record<string, Uint8Array> = { [gltfName]: await fetchVerified(fetchImpl, gltf) };
  const maxTexture = options.maxTexture ?? 512;
  for (const [path, file] of Object.entries(gltf.include)) {
    const bytes = await fetchVerified(fetchImpl, file);
    sources[path] = /\.jpe?g$/i.test(path) ? downscaleJpeg(bytes, maxTexture) : bytes;
  }

  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  const dir = join(options.modelsRoot, ...libraryModelDir(entry.name).split("/"));
  mkdirSync(dir, { recursive: true });

  const near = await buildLevel(io, sources, gltfName, origin, origin.near, 0.002);
  const far = await buildLevel(io, sources, gltfName, origin, origin.far, 0.03);
  const nearTriangles = triangles(near.document);
  const farTriangles = triangles(far.document);
  for (const [level, document] of [["near", near.document], ["far", far.document]] as const) {
    // Both levels name the same texture files, so the far level reuses the near level's maps.
    for (const texture of document.getRoot().listTextures()) texture.setURI(texture.getURI().split("/").pop()!);
    for (const buffer of document.getRoot().listBuffers()) buffer.setURI(`${level}.bin`);
    const { json, resources } = await io.writeJSON(document);
    writeFileSync(join(dir, `${level}.gltf`), JSON.stringify(json));
    for (const [path, bytes] of Object.entries(resources)) writeFileSync(join(dir, path), bytes);
  }
  return { name: entry.name, dir, bytes: dirBytes(dir), nearTriangles, farTriangles, size: near.size, roots: near.roots };
}
