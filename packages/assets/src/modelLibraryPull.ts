import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Document, NodeIO, type GLTF, type Node, type Texture } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { compactPrimitive, dedup, getBounds, meshopt, prune, reorder, simplify, weld } from "@gltf-transform/functions";
import jpeg from "jpeg-js";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

import { libraryModelDir, type KhronosModelOrigin, type ModelLibraryEntry } from "./catalogs/modelLibrary";
import { decodePng, encodeJpeg, encodePng, fitRgba, gitBlobSha, hasAlpha, type RgbaImage } from "./imageCodec";

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
  /** A GitHub token for sources listed through the GitHub API (raises the anonymous rate limit). */
  githubToken?: string;
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

function readPolyHaven(io: NodeIO, sources: Record<string, Uint8Array>, gltfName: string): () => Promise<Document> {
  return () => {
    const json = JSON.parse(new TextDecoder().decode(sources[gltfName]!)) as GLTF.IGLTF;
    const resources: Record<string, Uint8Array> = {};
    for (const [path, bytes] of Object.entries(sources)) if (path !== gltfName) resources[path] = bytes;
    return io.readJSON({ json, resources });
  };
}

/**
 * Keep an evenly spread `share` of the connected triangle islands (leaf clusters) on every primitive
 * whose material name matches `material`, and grow each kept island about its own centre by
 * `share^-0.35` so the canopy keeps most of its cover — the usual foliage LOD trade, not a change
 * to the tree's size. Returns the triangles removed.
 * @capability library-foliage-thinning thin a foliage scan's leaf clusters for a lighter level while keeping canopy cover
 */
export function thinIslands(document: Document, material: RegExp, share: number): number {
  let removed = 0;
  const grow = Math.pow(share, -0.35);
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const position = primitive.getAttribute("POSITION");
      if (indices === null || position === null || !material.test(primitive.getMaterial()?.getName() ?? "")) continue;
      const index = indices.getArray()!;
      const count = position.getCount();
      const parent = new Int32Array(count).map((_, i) => i);
      const find = (v: number): number => {
        while (parent[v] !== v) v = parent[v] = parent[parent[v]!]!;
        return v;
      };
      for (let t = 0; t < index.length; t += 3) {
        const a = find(index[t]!);
        parent[find(index[t + 1]!)] = a;
        parent[find(index[t + 2]!)] = a;
      }
      const order = new Map<number, number>();
      for (let v = 0; v < count; v += 1) {
        const root = find(v);
        if (!order.has(root)) order.set(root, order.size);
      }
      // Golden-ratio stride spreads the kept islands evenly through the source order.
      const keep = (root: number): boolean => (order.get(root)! * 0.6180339887) % 1 < share;
      const centre = new Map<number, [number, number, number, number]>();
      const p: number[] = [0, 0, 0];
      for (let v = 0; v < count; v += 1) {
        const root = find(v);
        if (!keep(root)) continue;
        position.getElement(v, p);
        const c = centre.get(root) ?? [0, 0, 0, 0];
        c[0] += p[0]!;
        c[1] += p[1]!;
        c[2] += p[2]!;
        c[3] += 1;
        centre.set(root, c);
      }
      for (let v = 0; v < count; v += 1) {
        const c = centre.get(find(v));
        if (c === undefined) continue;
        position.getElement(v, p);
        for (let k = 0; k < 3; k += 1) p[k] = c[k]! / c[3] + (p[k]! - c[k]! / c[3]) * grow;
        position.setElement(v, p);
      }
      const kept: number[] = [];
      for (let t = 0; t < index.length; t += 3) if (keep(find(index[t]!))) kept.push(index[t]!, index[t + 1]!, index[t + 2]!);
      removed += (index.length - kept.length) / 3;
      const IndexArray = index.constructor as Uint16ArrayConstructor | Uint32ArrayConstructor;
      indices.setArray(new IndexArray(kept));
      compactPrimitive(primitive);
    }
  }
  return removed;
}

async function buildLevel(
  load: () => Promise<Document>,
  keepPattern: string | undefined,
  ratio: number,
  error: number,
  thin?: { material: string; share: number },
): Promise<{ document: Document; roots: string[]; size: readonly [number, number, number] }> {
  const document = await load();
  const scene = document.getRoot().listScenes()[0]!;
  const roots = scene.listChildren().map((node) => node.getName());
  if (keepPattern !== undefined) {
    const keep = new RegExp(keepPattern);
    for (const node of scene.listChildren()) if (!keep.test(node.getName())) node.dispose();
  }
  await document.transform(dedup(), prune(), weld());
  if (thin !== undefined) thinIslands(document, new RegExp(thin.material), thin.share);
  await document.transform(
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
  if (entry.origin.provider === "khronos") return pullKhronosModel(entry, entry.origin, options);
  if (entry.origin.provider !== "polyhaven") {
    throw new Error(`${entry.name} is a ${entry.origin.provider} model: pull it with its own puller`);
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

  const load = readPolyHaven(io, sources, gltfName);
  return writeLevels(
    entry.name,
    io,
    dir,
    await buildLevel(load, origin.keep, origin.near, origin.error?.[0] ?? 0.002, origin.thin && { material: origin.thin.material, share: origin.thin.near }),
    await buildLevel(load, origin.keep, origin.far, origin.error?.[1] ?? 0.03, origin.thin && { material: origin.thin.material, share: origin.thin.far }),
  );
}

async function writeLevels(
  name: string,
  io: NodeIO,
  dir: string,
  near: Awaited<ReturnType<typeof buildLevel>>,
  far: Awaited<ReturnType<typeof buildLevel>>,
): Promise<PulledLibraryModel> {
  const nearTriangles = triangles(near.document);
  const farTriangles = triangles(far.document);
  for (const [level, document] of [["near", near.document], ["far", far.document]] as const) {
    // Both levels name the same texture files, so the far level reuses the near level's maps.
    for (const [index, texture] of document.getRoot().listTextures().entries()) {
      const uri = texture.getURI().split("/").pop() ?? "";
      const base = texture.getName() || `map${index}`;
      texture.setURI(uri !== "" ? uri : `${base}.${texture.getMimeType() === "image/png" ? "png" : "jpg"}`);
    }
    for (const buffer of document.getRoot().listBuffers()) buffer.setURI(`${level}.bin`);
    const { json, resources } = await io.writeJSON(document);
    writeFileSync(join(dir, `${level}.gltf`), JSON.stringify(json));
    for (const [path, bytes] of Object.entries(resources)) writeFileSync(join(dir, path), bytes);
  }
  return { name, dir, bytes: dirBytes(dir), nearTriangles, farTriangles, size: near.size, roots: near.roots };
}

/** The commit of `KhronosGroup/glTF-Sample-Assets` every Khronos entry is read from. */
export const KHRONOS_COMMIT = "8f492390ddc7a2ae221a1369ef560589cf8c70fb";

/** Halve every texture to the budget; maps without transparency become JPEG. */
function fitTextures(document: Document, max: number): void {
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    if (image === null) continue;
    let decoded: RgbaImage;
    const mime = texture.getMimeType();
    if (mime === "image/png") {
      // Low-bit-depth PNGs are tiny masks already; they pass through untouched.
      if (image[24] !== 8) continue;
      decoded = decodePng(image);
    }
    else if (mime === "image/jpeg") {
      const raw = jpeg.decode(image, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
      decoded = { width: raw.width, height: raw.height, data: raw.data };
    } else continue;
    const fitted = fitRgba(decoded, max);
    const alpha = hasAlpha(fitted);
    texture.setImage(alpha ? encodePng(fitted) : encodeJpeg(fitted)).setMimeType(alpha ? "image/png" : "image/jpeg");
    const base = (texture.getName() || `texture${document.getRoot().listTextures().indexOf(texture)}`).replace(/[^\w-]+/g, "_");
    texture.setName(base).setURI(`${base}.${alpha ? "png" : "jpg"}`);
  }
}

function imageKey(texture: Texture | null): string | null {
  const image = texture?.getImage();
  return image === null || image === undefined ? null : createHash("md5").update(image).digest("hex");
}

/**
 * Remove what a sample's license excludes before anything is written: nodes matching `drop`, and
 * every texture slot anywhere that shows the same picture as a dropped node's textures (the
 * trademark plates Khronos samples carry), plus the explicit `scrub` slots.
 */
function scrubKhronos(document: Document, origin: KhronosModelOrigin): void {
  const root = document.getRoot();
  const banned = new Set<string>();
  if (origin.drop !== undefined) {
    const drop = new RegExp(origin.drop);
    for (const node of root.listNodes()) {
      if (!drop.test(node.getName())) continue;
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const material = primitive.getMaterial();
        for (const texture of [material?.getBaseColorTexture() ?? null, material?.getEmissiveTexture() ?? null]) {
          const key = imageKey(texture);
          if (key !== null) banned.add(key);
        }
      }
      node.dispose();
    }
  }
  const scrub = new Set(origin.scrub ?? []);
  for (const material of root.listMaterials()) {
    if (banned.has(imageKey(material.getBaseColorTexture()) ?? "") || scrub.has(`${material.getName()}/baseColor`)) material.setBaseColorTexture(null);
    if (banned.has(imageKey(material.getEmissiveTexture()) ?? "") || scrub.has(`${material.getName()}/emissive`)) material.setEmissiveTexture(null);
  }
}

interface GitHubListing {
  name: string;
  sha: string;
  download_url: string | null;
}

/** Fetch a Khronos sample's GLB at the pinned commit, scrub it, and write its near and far levels. */
async function pullKhronosModel(entry: ModelLibraryEntry, origin: KhronosModelOrigin, options: PullLibraryModelOptions): Promise<PulledLibraryModel> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const listingUrl = `https://api.github.com/repos/KhronosGroup/glTF-Sample-Assets/contents/Models/${origin.model}/glTF-Binary?ref=${KHRONOS_COMMIT}`;
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  if (options.githubToken !== undefined) headers.authorization = `Bearer ${options.githubToken}`;
  const listing = await fetchImpl(listingUrl, { headers });
  if (!listing.ok) throw new Error(`${listingUrl}: HTTP ${listing.status}`);
  const file = ((await listing.json()) as GitHubListing[]).find((candidate) => candidate.name === `${origin.model}.glb`);
  if (file?.download_url === undefined || file.download_url === null) throw new Error(`Khronos lists no ${origin.model}.glb`);
  if (new URL(file.download_url).hostname !== "raw.githubusercontent.com") throw new Error(`refusing a Khronos file served from ${file.download_url}`);
  const response = await fetchImpl(file.download_url);
  if (!response.ok) throw new Error(`${file.download_url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (gitBlobSha(bytes) !== file.sha) throw new Error(`${origin.model}.glb does not match the repository's blob ${file.sha}`);

  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  const cleaned = await io.readBinary(bytes);
  scrubKhronos(cleaned, origin);
  fitTextures(cleaned, options.maxTexture ?? 512);
  await cleaned.transform(prune());
  const clean = await io.writeBinary(cleaned);
  const load = () => io.readBinary(clean);
  const dir = join(options.modelsRoot, ...libraryModelDir(entry.name).split("/"));
  mkdirSync(dir, { recursive: true });
  const farDrop = origin.farDrop === undefined ? null : new RegExp(origin.farDrop);
  const loadFar = async (): Promise<Document> => {
    const document = await load();
    if (farDrop !== null) for (const node of document.getRoot().listNodes()) if (farDrop.test(node.getName())) node.dispose();
    return document;
  };
  return writeLevels(entry.name, io, dir, await buildLevel(load, undefined, origin.near, 0.01), await buildLevel(loadFar, undefined, origin.far, 0.06));
}
