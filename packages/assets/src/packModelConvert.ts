import { Logger, NodeIO } from "@gltf-transform/core";
import { dedup, prune } from "@gltf-transform/functions";
import { unzipSync } from "fflate";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

import { boundedExtractFilter, extractGlbs, type ExtractedPack } from "./download";
import { fbxLoader, installFileReader, parseFbx } from "./rocketboxPull";

const IMAGE = /\.(png|jpe?g)$/i;

function baseName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

function stem(file: string): string {
  return file.replace(/\.[^.]+$/, "");
}

interface PackImage {
  file: string;
  bytes: Uint8Array;
}

/** Archive images by lower-case basename; the shallowest copy wins, so a pack's main textures beat its colour variations. */
function imageIndex(entries: Record<string, Uint8Array>): Map<string, PackImage> {
  const images = new Map<string, PackImage>();
  const depth = (path: string) => path.split("/").length;
  const ordered = Object.entries(entries).sort(([a], [b]) => depth(a) - depth(b) || a.localeCompare(b));
  for (const [path, bytes] of ordered) {
    const file = baseName(path);
    if (IMAGE.test(file) && !images.has(file.toLowerCase())) images.set(file.toLowerCase(), { file, bytes });
  }
  return images;
}

interface TextureRef {
  url?: string;
}

/**
 * Detach each material's colour map, remembering its file by material name: the exporter cannot
 * encode a placeholder image, so maps go back on afterwards from the archive's own bytes.
 */
function detachMaps(root: THREE.Object3D): Map<string, string> {
  const maps = new Map<string, string>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const key of ["map", "normalMap", "specularMap", "emissiveMap", "bumpMap", "alphaMap", "aoMap"] as const) {
        if (!(key in material)) continue;
        const texture: unknown = Reflect.get(material, key);
        if (!(texture instanceof THREE.Texture)) continue;
        const url = (texture.userData as TextureRef).url;
        if (key === "map" && url !== undefined) maps.set(material.name, baseName(url));
        Reflect.set(material, key, null);
      }
    }
  });
  return maps;
}

/** glTF has one material model, so a Phong or Lambert material becomes standard, keeping colour, opacity and vertex colours. */
function standardMaterial(material: THREE.Material): THREE.Material {
  if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) return material;
  const color: unknown = Reflect.get(material, "color");
  const emissive: unknown = Reflect.get(material, "emissive");
  const shininess: unknown = Reflect.get(material, "shininess");
  const standard = new THREE.MeshStandardMaterial({
    name: material.name,
    color: color instanceof THREE.Color ? color : new THREE.Color(1, 1, 1),
    emissive: emissive instanceof THREE.Color ? emissive : new THREE.Color(0, 0, 0),
    roughness: typeof shininess === "number" ? Math.min(1, Math.max(0.2, 1 - Math.sqrt(shininess / 100))) : 0.9,
    metalness: 0,
    // Blender's FBX export often writes a zero opacity on solid materials; nothing in a pack is meant to be invisible.
    opacity: material.opacity < 0.05 ? 1 : material.opacity,
    transparent: material.opacity >= 0.05 && material.transparent,
    vertexColors: material.vertexColors,
    side: material.side,
  });
  return standard;
}

/**
 * One draw group per material: FBX meshes often hold dozens of groups alternating two materials,
 * and the exporter writes each group as its own primitive.
 */
function mergeGroupsByMaterial(geometry: THREE.BufferGeometry): void {
  if (geometry.groups.length <= 1) return;
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const byMaterial = new Map<number, number[]>();
  for (const group of geometry.groups) {
    const list = byMaterial.get(group.materialIndex ?? 0) ?? [];
    const end = Math.min(group.start + group.count, index === null ? position.count : index.count);
    for (let i = group.start; i < end; i += 1) list.push(index === null ? i : index.getX(i));
    byMaterial.set(group.materialIndex ?? 0, list);
  }
  const merged: number[] = [];
  geometry.clearGroups();
  for (const [material, list] of [...byMaterial].sort(([a], [b]) => a - b)) {
    geometry.addGroup(merged.length, list.length, material);
    merged.push(...list);
  }
  geometry.setIndex(merged);
}

function standardMaterials(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.geometry instanceof THREE.BufferGeometry) mergeGroupsByMaterial(object.geometry);
    object.material = Array.isArray(object.material) ? object.material.map(standardMaterial) : standardMaterial(object.material);
  });
}

/**
 * The archive image a material draws: the one its file names, else one named after the material
 * (`Birch_Bark.png`) or starting with its name (`Birch_Leaves_Green.png`), since many packs ship
 * textures their FBX and MTL files never reference.
 */
function materialImage(name: string, named: string | undefined, images: Map<string, PackImage>): PackImage | undefined {
  if (named !== undefined) return images.get(named.toLowerCase());
  const key = name.toLowerCase();
  if (key.length < 3) return undefined;
  for (const [file, image] of images) if (stem(file) === key) return image;
  for (const [file, image] of images) if (file.startsWith(`${key}_`)) return image;
  return undefined;
}

/** Whether PNG bytes carry an alpha channel (colour type 4 or 6 in the IHDR chunk). */
function pngHasAlpha(bytes: Uint8Array): boolean {
  return bytes.length > 25 && bytes[0] === 0x89 && bytes[1] === 0x50 && (bytes[25] === 4 || bytes[25] === 6);
}

async function toGlb(root: THREE.Object3D, animations: THREE.AnimationClip[], maps: Map<string, string>, images: Map<string, PackImage>): Promise<Uint8Array> {
  installFileReader();
  standardMaterials(root);
  const scene = new THREE.Scene();
  scene.add(root);
  const exported: unknown = await new GLTFExporter().parseAsync(scene, { binary: true, animations, onlyVisible: false });
  if (!(exported instanceof ArrayBuffer)) throw new Error("GLTFExporter returned JSON for a binary export");
  const io = new NodeIO();
  const document = await io.readBinary(new Uint8Array(exported));
  document.setLogger(new Logger(Logger.Verbosity.WARN));
  const textures = new Map<string, ReturnType<typeof document.createTexture>>();
  const textured = (material: { getName(): string }) => document.getRoot().listMeshes().some((mesh) => mesh.listPrimitives().some((primitive) => primitive.getMaterial()?.getName() === material.getName() && primitive.getAttribute("TEXCOORD_0") !== null));
  for (const material of document.getRoot().listMaterials()) {
    const image = materialImage(material.getName(), maps.get(material.getName()), images);
    if (image === undefined || !textured(material)) continue;
    let texture = textures.get(image.file);
    if (texture === undefined) {
      texture = document
        .createTexture(stem(image.file))
        .setImage(image.bytes)
        .setMimeType(/\.png$/i.test(image.file) ? "image/png" : "image/jpeg");
      textures.set(image.file, texture);
    }
    material.setBaseColorTexture(texture);
    material.setBaseColorFactor([1, 1, 1, material.getBaseColorFactor()[3]]);
    if (pngHasAlpha(image.bytes)) material.setAlphaMode("MASK").setAlphaCutoff(0.5).setDoubleSided(true);
  }
  await document.transform(dedup(), prune());
  return io.writeBinary(document);
}

/** An MTL file with its texture lines removed: maps are attached from the archive after export. */
function mtlWithoutMaps(text: string): { text: string; maps: Map<string, string> } {
  const maps = new Map<string, string>();
  let current = "";
  const lines = text.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    const [keyword = "", ...rest] = trimmed.split(/\s+/);
    if (keyword === "newmtl") current = rest.join(" ");
    if (!/^map_/i.test(keyword)) return true;
    if (keyword.toLowerCase() === "map_kd" && rest.length > 0) maps.set(current, baseName(rest[rest.length - 1] ?? ""));
    return false;
  });
  return { text: lines.join("\n"), maps };
}

const decoder = new TextDecoder();

/** FBXLoader sizes a scene camera from `window`, which Bun has none of; a 1x1 stand-in serves while it parses. */
function withWindowSize<T>(parse: () => T): T {
  if ("window" in globalThis) return parse();
  Reflect.set(globalThis, "window", { innerWidth: 1, innerHeight: 1 });
  try {
    return parse();
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
}

/** Authoring cameras and lights are not part of a placeable model. */
function dropCamerasAndLights(root: THREE.Object3D): void {
  const extra: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Camera || object instanceof THREE.Light) extra.push(object);
  });
  for (const object of extra) object.removeFromParent();
}

/**
 * Pull every model out of a pack archive as GLB. glTF and GLB files are taken as they are
 * ({@link extractGlbs}); a pack that ships neither (the older Quaternius packs: FBX and OBJ only) is
 * converted, one GLB per FBX with its rig, clips and colour maps, else one per OBJ with its MTL
 * colours. Textures are embedded, so a converted model is one file.
 */
export async function extractPackModels(archive: Uint8Array): Promise<ExtractedPack> {
  const ready = extractGlbs(archive);
  if (ready.models.length > 0) return ready;
  const entries = unzipSync(archive, { filter: boundedExtractFilter((file) => /\.(fbx|obj|mtl|png|jpe?g)$/i.test(file.name)) });
  const images = imageIndex(entries);
  const fbx = new Map<string, Uint8Array>();
  const obj = new Map<string, { path: string; bytes: Uint8Array }>();
  const mtl = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) {
    const file = baseName(path);
    if (file.startsWith(".") || path.includes("__MACOSX")) continue;
    const key = stem(file);
    if (/\.fbx$/i.test(file) && !fbx.has(key)) fbx.set(key, bytes);
    else if (/\.obj$/i.test(file) && !obj.has(key)) obj.set(key, { path, bytes });
    else if (/\.mtl$/i.test(file) && !mtl.has(file.toLowerCase())) mtl.set(file.toLowerCase(), bytes);
  }
  const models: ExtractedPack["models"] = [];
  if (fbx.size > 0) {
    const loader = fbxLoader();
    for (const [key, bytes] of fbx) {
      const group = withWindowSize(() => parseFbx(loader, bytes));
      dropCamerasAndLights(group);
      // FBX is in centimetres and FBXLoader keeps them; the same packs' OBJ files are in metres.
      group.scale.multiplyScalar(0.01);
      const maps = detachMaps(group);
      models.push({ file: `${key}.glb`, bytes: await toGlb(group, group.animations, maps, images) });
    }
  } else {
    for (const [key, { bytes }] of obj) {
      const text = decoder.decode(bytes);
      const library = /^mtllib\s+(.+)$/m.exec(text)?.[1]?.trim();
      const mtlBytes = mtl.get(baseName(library ?? `${key}.mtl`).toLowerCase()) ?? mtl.get(`${key}.mtl`.toLowerCase());
      const loader = new OBJLoader();
      let maps = new Map<string, string>();
      if (mtlBytes !== undefined) {
        const stripped = mtlWithoutMaps(decoder.decode(mtlBytes));
        maps = stripped.maps;
        const creator = new MTLLoader().parse(stripped.text, "");
        creator.preload();
        loader.setMaterials(creator);
      }
      const group = loader.parse(text);
      models.push({ file: `${key}.glb`, bytes: await toGlb(group, [], maps, images) });
    }
  }
  models.sort((a, b) => a.file.localeCompare(b.file));
  return { models, images: [] };
}
