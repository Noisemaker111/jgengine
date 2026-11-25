/**
 * A generated interchange scene folder for tests and the import benchmark: `scene.json`, one OBJ per
 * distinct mesh and one PNG per texture, shaped like a Unity export (left-handed matrices, OBJ files
 * with X already negated). Deterministic for one set of options.
 */
import { encodeBakePng } from "../../map/minimapBake";

/** Size of a generated scene. */
export interface SyntheticSceneOptions {
  instances: number;
  meshes: number;
  textures: number;
  /** Rings and segments of each mesh's lathe; triangles per mesh are about `2 * rings * segments`. Default 2 and 3. */
  rings?: number;
  segments?: number;
  /** Edge of the square the instances spread over, in metres. Default 4000. */
  extent?: number;
  /** Scene centre in source X and Z. Default [1500, -2500]. */
  center?: readonly [number, number];
  /** Texture edge in pixels. Default 4. */
  textureSize?: number;
}

/** One generated instance as the source tool wrote it. */
export interface SyntheticInstance {
  mesh: string;
  meshName: string;
  matrix: number[];
  materials: string[];
}

/** The scene file and how to make each of its other files. */
export interface SyntheticScene {
  scene: { center: [number, number]; radius: number; materials: Record<string, { texture?: string }>; instances: SyntheticInstance[] };
  meshFiles: string[];
  textureFiles: string[];
  /** Instances whose matrix mirrors (negative X scale). */
  mirrored: number;
  /** Meshes written with two material runs. */
  twoPartMeshes: number;
  /** Materials with no texture, drawn flat. */
  flatMaterials: number;
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every third mesh has two material runs. */
export function syntheticMeshParts(mesh: number): 1 | 2 {
  return mesh % 3 === 0 ? 2 : 1;
}

/** Ten materials have no texture so the flat-colour path runs. */
const FLAT_MATERIALS = 10;

/**
 * Lay out a scene: every mesh placed at least once, the rest spread at random; 1% mirrored. Each
 * matrix is a left-handed TRS (rotation about Y, uniform scale), column-major.
 */
export function syntheticScene(options: SyntheticSceneOptions): SyntheticScene {
  const next = random(0x5eed);
  const extent = options.extent ?? 4000;
  const center = options.center ?? [1500, -2500];
  const materials: Record<string, { texture?: string }> = {};
  const textureFiles: string[] = [];
  for (let index = 0; index < options.textures; index += 1) {
    const texture = `textures/t${String(index).padStart(4, "0")}.png`;
    textureFiles.push(texture);
    materials[`mat_${index}`] = { texture };
  }
  for (let index = 0; index < FLAT_MATERIALS; index += 1) materials[`flat_${index}`] = {};
  const materialNames = Object.keys(materials);
  const meshFiles = Array.from({ length: options.meshes }, (_, index) => `meshes/m${String(index).padStart(4, "0")}.obj`);
  // Each mesh keeps one material list wherever it is placed, as an exported prefab does.
  const meshMaterials = meshFiles.map((_, mesh) => Array.from({ length: syntheticMeshParts(mesh) }, (__, part) => materialNames[(mesh * 7 + part * 13) % materialNames.length]!));
  let mirrored = 0;
  const instances: SyntheticInstance[] = [];
  for (let index = 0; index < options.instances; index += 1) {
    const mesh = index < options.meshes ? index : Math.floor(next() * options.meshes);
    const angle = next() * Math.PI * 2;
    const scale = 0.5 + next() * 1.5;
    const flip = next() < 0.01 ? -1 : 1;
    if (flip < 0) mirrored += 1;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = center[0] + (next() - 0.5) * extent;
    const y = next() * 4;
    const z = center[1] + (next() - 0.5) * extent;
    // Unity's Y rotation in a left-handed frame: x' = x cos + z sin, z' = -x sin + z cos.
    instances.push({
      mesh: meshFiles[mesh]!,
      meshName: `mesh_${mesh}`,
      matrix: [cos * scale * flip, 0, -sin * scale * flip, 0, 0, scale, 0, 0, sin * scale, 0, cos * scale, 0, x, y, z, 1],
      materials: meshMaterials[mesh]!,
    });
  }
  return {
    scene: { center: [center[0], center[1]], radius: extent, materials, instances },
    meshFiles,
    textureFiles,
    mirrored,
    twoPartMeshes: meshFiles.filter((_, mesh) => syntheticMeshParts(mesh) === 2).length,
    flatMaterials: FLAT_MATERIALS,
  };
}

/**
 * One mesh as an exporter writes it: a closed lathe whose profile depends on the mesh number, with
 * normals and texture coordinates, X negated, faces wound for the flipped frame. A two-part mesh puts
 * its lower half under one `usemtl` and its upper half under another.
 */
export function syntheticObj(mesh: number, rings = 2, segments = 3): string {
  const lines: string[] = [`# synthetic mesh ${mesh}`, `g mesh_${mesh}`];
  const height = 2 + (mesh % 7);
  const radiusAt = (ring: number) => 0.5 + 0.4 * Math.sin((ring / rings) * Math.PI + mesh) ** 2;
  for (let ring = 0; ring <= rings; ring += 1) {
    const y = (ring / rings) * height;
    const radius = radiusAt(ring);
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      lines.push(`v ${(-x).toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`);
      lines.push(`vt ${(segment / segments).toFixed(6)} ${(ring / rings).toFixed(6)}`);
      lines.push(`vn ${(-Math.cos(angle)).toFixed(6)} 0.000000 ${Math.sin(angle).toFixed(6)}`);
    }
  }
  const parts = syntheticMeshParts(mesh);
  const at = (ring: number, segment: number) => ring * segments + (segment % segments) + 1;
  for (let ring = 0; ring < rings; ring += 1) {
    if (ring === 0 || (parts === 2 && ring === Math.ceil(rings / 2))) lines.push(`usemtl part_${ring === 0 ? 0 : 1}`);
    for (let segment = 0; segment < segments; segment += 1) {
      const a = at(ring, segment), b = at(ring, segment + 1), c = at(ring + 1, segment + 1), d = at(ring + 1, segment);
      lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c} ${d}/${d}/${d}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** A small PNG whose colour comes from the texture number. */
export function syntheticPng(texture: number, size = 4): Uint8Array {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let pixel = 0; pixel < size * size; pixel += 1) {
    const checker = ((pixel % size) + Math.floor(pixel / size)) % 2 === 0 ? 1 : 0.7;
    pixels[pixel * 4] = ((texture * 53) % 256) * checker;
    pixels[pixel * 4 + 1] = ((texture * 97) % 256) * checker;
    pixels[pixel * 4 + 2] = ((texture * 151) % 256) * checker;
    pixels[pixel * 4 + 3] = 255;
  }
  return encodeBakePng({ width: size, height: size, pixels, bounds: { minX: 0, minZ: 0, maxX: 1, maxZ: 1 } });
}
