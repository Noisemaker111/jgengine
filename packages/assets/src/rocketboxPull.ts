import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { NodeIO, type Document, type Material, type Texture } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, reorder, resample } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

import { decodeTgaForGltf, encodeJpeg, encodePng, fitRgba, gitBlobSha, type RgbaImage } from "./imageCodec";
import { libraryModelDir, type ModelLibraryEntry, type RocketboxClip, type RocketboxModelOrigin } from "./catalogs/modelLibrary";

/**
 * Microsoft Rocketbox (MIT) ships rigged avatars and animals as FBX with 2048 px TGA maps. This
 * converts one into a single meshopt-compressed GLB the engine can draw and animate: the avatar's
 * skinned mesh and bones, the requested clips retargeted by bone name (the library is one skeleton
 * family), metres instead of centimetres, and JPEG/PNG maps halved to the texture budget. Every
 * file comes from the repository at a pinned commit and is checked against Git's own blob hash.
 */

/** The upstream commit every Rocketbox file is read from, so a pull is reproducible. */
export const ROCKETBOX_COMMIT = "0943055db6ec570bcef9f2c8b41c9e5467c808f9";
const ROCKETBOX_API = "https://api.github.com/repos/microsoft/Microsoft-Rocketbox/contents";
const ROCKETBOX_HOSTS = new Set(["api.github.com", "raw.githubusercontent.com"]);

interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  download_url: string | null;
  type: "file" | "dir";
}

/** Fetch and settings for {@link pullRocketboxModel}. */
export interface PullRocketboxOptions {
  modelsRoot: string;
  fetchImpl?: typeof fetch;
  /** Longest texture edge kept, in pixels. Default 512. */
  maxTexture?: number;
  /** A GitHub token raises the API's 60-requests-an-hour anonymous limit; never required. */
  githubToken?: string;
}

/** What one Rocketbox pull wrote. */
export interface PulledRocketboxModel {
  name: string;
  file: string;
  bytes: number;
  triangles: number;
  bones: number;
  clips: readonly string[];
  /** Real-world height in metres, measured in the bind pose. */
  height: number;
}

/** `FileReader` is a browser API GLTFExporter needs for its binary writer; Node and Bun lack it. */
function installFileReader(): void {
  const scope = globalThis as unknown as { FileReader?: unknown };
  if (scope.FileReader !== undefined) return;
  scope.FileReader = class {
    result: ArrayBuffer | string | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob): void {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
    readAsDataURL(blob: Blob): void {
      void blob.arrayBuffer().then((buffer) => {
        this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onloadend?.();
      });
    }
  };
}

interface TextureRef {
  url: string;
}

/** An FBX loader that never touches the DOM: textures come back as name-only placeholders. */
function fbxLoader(): FBXLoader {
  const manager = new THREE.LoadingManager();
  const placeholder = {
    path: "",
    setPath(path: string) {
      this.path = path;
      return this;
    },
    load(url: string) {
      const texture = new THREE.Texture();
      (texture.userData as TextureRef).url = url;
      return texture;
    },
  };
  manager.addHandler(/\.(tga|png|jpe?g|bmp|tiff?|dds)$/i, placeholder as unknown as THREE.Loader);
  return new FBXLoader(manager);
}

/** FBXLoader builds its own TextureLoader inside `parse`, so the placeholder is swapped onto the prototype for that call only. */
function placeholderTexture(url: string): THREE.Texture {
  const texture = new THREE.Texture();
  (texture.userData as TextureRef).url = url;
  return texture;
}

function fileName(url: string | undefined): string | undefined {
  return url?.split(/[\\/]/).pop();
}

class RocketboxSource {
  private readonly listings = new Map<string, GitHubFile[]>();

  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly token: string | undefined,
  ) {}

  private async getChecked(url: string, init?: RequestInit): Promise<Response> {
    const host = new URL(url).hostname;
    if (!ROCKETBOX_HOSTS.has(host)) throw new Error(`refusing a Rocketbox file served from ${host}`);
    const response = await this.fetchImpl(url, init);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response;
  }

  async list(dir: string): Promise<GitHubFile[]> {
    const cached = this.listings.get(dir);
    if (cached !== undefined) return cached;
    const headers: Record<string, string> = { accept: "application/vnd.github+json" };
    if (this.token !== undefined) headers.authorization = `Bearer ${this.token}`;
    const url = `${ROCKETBOX_API}/${dir.split("/").map(encodeURIComponent).join("/")}?ref=${ROCKETBOX_COMMIT}`;
    const files = (await (await this.getChecked(url, { headers })).json()) as GitHubFile[];
    this.listings.set(dir, files);
    return files;
  }

  /** One file's bytes, checked against the blob hash its directory listing names. */
  async file(dir: string, name: string): Promise<Uint8Array> {
    const listing = await this.list(dir);
    const entry = listing.find((file) => file.name.toLowerCase() === name.toLowerCase());
    if (entry === undefined || entry.download_url === null) throw new Error(`Rocketbox has no ${dir}/${name}`);
    const bytes = new Uint8Array(await (await this.getChecked(entry.download_url)).arrayBuffer());
    const sha = gitBlobSha(bytes);
    if (sha !== entry.sha) throw new Error(`${entry.path}: blob ${sha} does not match the repository's ${entry.sha}`);
    return bytes;
  }
}

function parseFbx(loader: FBXLoader, bytes: Uint8Array): THREE.Group {
  const prototype = THREE.TextureLoader.prototype;
  const original = prototype.load;
  // Restored afterwards: a stub left on the shared prototype hangs every later texture load in the process.
  prototype.load = placeholderTexture as never;
  try {
    return loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "");
  } finally {
    prototype.load = original;
  }
}

/** Drop a clip's travel on the ground plane so it plays in place; vertical bob and turning stay. */
function inPlace(clip: THREE.AnimationClip, root: string): void {
  const track = clip.tracks.find((candidate) => candidate.name === `${root}.position`);
  if (track === undefined) return;
  const values = track.values;
  const x = values[0]!;
  const z = values[2]!;
  for (let i = 0; i < values.length; i += 3) {
    values[i] = x;
    values[i + 2] = z;
  }
}

async function attachTextures(
  document: Document,
  plan: Map<string, { color?: string; normal?: string; alpha?: string }>,
  read: (name: string) => Promise<RgbaImage>,
): Promise<void> {
  const cache = new Map<string, Texture>();
  const texture = async (key: string, make: () => Promise<{ bytes: Uint8Array; mime: string }>): Promise<Texture> => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const { bytes, mime } = await make();
    const created = document
      .createTexture(key)
      .setImage(bytes)
      .setMimeType(mime)
      .setURI(`${key}.${mime === "image/png" ? "png" : "jpg"}`);
    cache.set(key, created);
    return created;
  };
  for (const material of document.getRoot().listMaterials() as Material[]) {
    const maps = plan.get(material.getName());
    if (maps === undefined) continue;
    if (maps.color !== undefined) {
      const color = maps.color;
      if (maps.alpha !== undefined) {
        const alpha = maps.alpha;
        material.setBaseColorTexture(
          await texture(`${color.replace(/\.\w+$/, "")}_rgba`, async () => {
            const image = await read(color);
            if (alpha !== color) {
              const mask = await read(alpha);
              for (let i = 0; i < image.data.length; i += 4) image.data[i + 3] = mask.data[i + 1]!;
            }
            return { bytes: encodePng(image), mime: "image/png" };
          }),
        );
      } else {
        material.setBaseColorTexture(
          await texture(color.replace(/\.\w+$/, ""), async () => ({ bytes: encodeJpeg(await read(color)), mime: "image/jpeg" })),
        );
      }
    }
    if (maps.normal !== undefined) {
      const normal = maps.normal;
      material.setNormalTexture(
        await texture(normal.replace(/\.\w+$/, ""), async () => ({ bytes: encodeJpeg(await read(normal)), mime: "image/jpeg" })),
      );
    }
  }
}

/** The upstream folder a clip's FBX lives in: in-place (static) or root-travelling (xy) takes. */
function clipFolder(clip: RocketboxClip): string {
  return `Assets/Animations/${clip.folder === "static" ? "all_animations_max_motextr_static" : "all_animations_max_motextr_xy"}`;
}

/**
 * Pull one Rocketbox avatar or animal and write `<modelsRoot>/library/<name>/model.glb`: the
 * skinned mesh, its bones, the entry's clips (in place), base colour and normal maps.
 * @capability model-library-rigged pull a rigged, animated Microsoft Rocketbox human or animal into a game as one GLB
 */
export async function pullRocketboxModel(entry: ModelLibraryEntry, options: PullRocketboxOptions): Promise<PulledRocketboxModel> {
  if (entry.origin.provider !== "rocketbox") throw new Error(`${entry.name} is not a Rocketbox model`);
  const origin: RocketboxModelOrigin = entry.origin;
  const source = new RocketboxSource(options.fetchImpl ?? fetch, options.githubToken);
  const maxTexture = options.maxTexture ?? 512;
  const loader = fbxLoader();
  installFileReader();

  const base = `Assets/${origin.path}`;
  const leaf = origin.path.split("/").pop()!;
  const avatar = parseFbx(loader, await source.file(`${base}/Export`, `${leaf}.fbx`));

  const lights: THREE.Object3D[] = [];
  avatar.traverse((object) => {
    if ((object as THREE.Light).isLight || (object as THREE.Camera).isCamera) lights.push(object);
  });
  for (const light of lights) light.removeFromParent();

  const plan = new Map<string, { color?: string; normal?: string; alpha?: string }>();
  let triangles = 0;
  let bones = 0;
  avatar.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isMesh) return;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3;
    if (mesh.isSkinnedMesh) bones = Math.max(bones, mesh.skeleton.bones.length);
    // Max's export vertex colours carry no shading the textures do not; kept, they switch on
    // vertex-colour multiply in every renderer, and one that drops the attribute draws the body black.
    mesh.geometry.deleteAttribute("color");
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const replaced = materials.map((material) => {
      const phong = material as THREE.MeshPhongMaterial;
      const color = fileName((phong.map?.userData as TextureRef | undefined)?.url);
      const normal = fileName((phong.normalMap?.userData as TextureRef | undefined)?.url);
      const alpha = fileName((phong.alphaMap?.userData as TextureRef | undefined)?.url);
      plan.set(phong.name, {
        ...(color === undefined ? {} : { color }),
        ...(normal === undefined ? {} : { normal }),
        ...(alpha === undefined ? {} : { alpha }),
      });
      return new THREE.MeshStandardMaterial({
        name: phong.name,
        roughness: origin.roughness ?? 0.78,
        metalness: 0,
        ...(alpha === undefined ? {} : { alphaTest: 0.5 }),
      });
    });
    mesh.material = Array.isArray(mesh.material) ? replaced : replaced[0]!;
  });

  const boneNames = new Set<string>();
  avatar.traverse((object) => {
    if ((object as THREE.Bone).isBone || object.name.startsWith(origin.rootBone)) boneNames.add(object.name);
  });
  const clips: THREE.AnimationClip[] = [];
  for (const clip of origin.clips) {
    const take = parseFbx(loader, await source.file(clipFolder(clip), clip.file)).animations[0];
    if (take === undefined) throw new Error(`${clip.file} carries no animation`);
    const tracks = take.tracks.filter((track) => boneNames.has(track.name.slice(0, track.name.lastIndexOf("."))) && !track.name.endsWith(".scale"));
    const named = new THREE.AnimationClip(clip.name, take.duration, tracks);
    if (clip.inPlace) inPlace(named, origin.rootBone);
    clips.push(named);
  }
  if (origin.embeddedClips !== undefined) {
    for (const [index, name] of origin.embeddedClips.entries()) {
      const take = avatar.animations[index];
      if (take !== undefined) clips.push(new THREE.AnimationClip(name, take.duration, take.tracks.filter((track) => !track.name.endsWith(".scale"))));
    }
  }

  // Rocketbox is authored in centimetres.
  avatar.scale.setScalar(0.01);
  avatar.updateMatrixWorld(true);
  const height = new THREE.Box3().setFromObject(avatar).getSize(new THREE.Vector3()).y;
  const scene = new THREE.Scene();
  scene.add(avatar);

  const glb = (await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips, onlyVisible: false })) as ArrayBuffer;
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  const document = await io.readBinary(new Uint8Array(glb));

  const images = new Map<string, Promise<RgbaImage>>();
  const read = (name: string): Promise<RgbaImage> => {
    let pending = images.get(name);
    if (pending === undefined) {
      pending = source.file(`${base}/Textures`, name).then((bytes) => fitRgba(decodeTgaForGltf(bytes), maxTexture));
      images.set(name, pending);
    }
    return pending.then((image) => ({ ...image, data: image.data.slice() }));
  };
  await attachTextures(document, plan, read);
  await document.transform(dedup(), resample(), prune(), reorder({ encoder: MeshoptEncoder }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));

  const dir = join(options.modelsRoot, ...libraryModelDir(entry.name).split("/"));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "model.glb");
  const bytes = await io.writeBinary(document);
  writeFileSync(file, bytes);
  return { name: entry.name, file, bytes: bytes.byteLength, triangles: Math.round(triangles), bones, clips: clips.map((clip) => clip.name), height };
}
