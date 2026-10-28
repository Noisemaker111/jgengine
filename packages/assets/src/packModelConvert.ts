import { NodeIO } from "@gltf-transform/core";
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

/** Archive images by lower-case basename, first copy wins. */
function imageIndex(entries: Record<string, Uint8Array>): Map<string, { file: string; bytes: Uint8Array }> {
  const images = new Map<string, { file: string; bytes: Uint8Array }>();
  for (const [path, bytes] of Object.entries(entries)) {
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
    opacity: material.opacity,
    transparent: material.transparent,
    vertexColors: material.vertexColors,
    side: material.side,
  });
  return standard;
}

function standardMaterials(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.material = Array.isArray(object.material) ? object.material.map(standardMaterial) : standardMaterial(object.material);
  });
}

async function toGlb(root: THREE.Object3D, animations: THREE.AnimationClip[], maps: Map<string, string>, images: Map<string, { file: string; bytes: Uint8Array }>): Promise<Uint8Array> {
  installFileReader();
  standardMaterials(root);
  const scene = new THREE.Scene();
  scene.add(root);
  const exported: unknown = await new GLTFExporter().parseAsync(scene, { binary: true, animations, onlyVisible: false });
  if (!(exported instanceof ArrayBuffer)) throw new Error("GLTFExporter returned JSON for a binary export");
  const glb = new Uint8Array(exported);
  if (maps.size === 0) return glb;
  const io = new NodeIO();
  const document = await io.readBinary(glb);
  const textures = new Map<string, ReturnType<typeof document.createTexture>>();
  for (const material of document.getRoot().listMaterials()) {
    const file = maps.get(material.getName());
    const image = file === undefined ? undefined : images.get(file.toLowerCase());
    if (image === undefined) continue;
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
  }
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
