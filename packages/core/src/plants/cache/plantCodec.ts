import type { NatureMesh, NatureSurface } from "../../nature/natureMesh";
import type { PlantMesh, PlantMeshLook } from "../mesh/plantMesh";
import type { BarkKind, LeafShapeParams } from "../species/plantSpecies";
import type { PlantClusterLevel, PlantStructure } from "../structure/plantStructure";

type PackedArray = Float32Array | Float64Array | Int32Array | Uint8Array | Uint16Array | Uint32Array;

const CODEC_VERSION = 3;
const ALIGN = 8;

function typeCode(array: PackedArray): number {
  if (array instanceof Float32Array) return 0;
  if (array instanceof Float64Array) return 1;
  if (array instanceof Int32Array) return 2;
  if (array instanceof Uint8Array) return 3;
  if (array instanceof Uint16Array) return 4;
  return 5;
}

function align(offset: number): number {
  return Math.ceil(offset / ALIGN) * ALIGN;
}

/** Plain values plus typed arrays as one byte buffer: a length, a JSON header, then 8-byte aligned arrays. */
function pack(meta: unknown, arrays: readonly (readonly [string, PackedArray])[]): Uint8Array {
  const header = new TextEncoder().encode(JSON.stringify({ v: CODEC_VERSION, meta, arrays: arrays.map(([name, array]) => [name, typeCode(array), array.length]) }));
  let size = align(4 + header.length);
  for (const [, array] of arrays) size = align(size + array.byteLength);
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, header.length, true);
  out.set(header, 4);
  let offset = align(4 + header.length);
  for (const [, array] of arrays) {
    out.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
    offset = align(offset + array.byteLength);
  }
  return out;
}

type Json = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(record: Json, key: string): unknown {
  return record[key];
}

function num(record: Json, key: string): number {
  const value = field(record, key);
  if (typeof value !== "number") throw new Error(`plant cache: ${key} is not a number`);
  return value;
}

function str(record: Json, key: string): string {
  const value = field(record, key);
  if (typeof value !== "string") throw new Error(`plant cache: ${key} is not a string`);
  return value;
}

function bool(record: Json, key: string): boolean {
  const value = field(record, key);
  if (typeof value !== "boolean") throw new Error(`plant cache: ${key} is not a boolean`);
  return value;
}

function obj(record: Json, key: string): Json {
  const value = field(record, key);
  if (!isRecord(value)) throw new Error(`plant cache: ${key} is not an object`);
  return value;
}

function vec3(record: Json, key: string): [number, number, number] {
  const value = field(record, key);
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`plant cache: ${key} is not a 3-vector`);
  const [x, y, z] = value;
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") throw new Error(`plant cache: ${key} is not a 3-vector`);
  return [x, y, z];
}

/** Reads a packed buffer's arrays by name, each copied out so it owns an aligned buffer. */
class Unpacked {
  readonly meta: Json;
  private readonly arrays = new Map<string, PackedArray>();

  constructor(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerLength = view.getUint32(0, true);
    const header: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headerLength)));
    if (!isRecord(header) || field(header, "v") !== CODEC_VERSION) throw new Error("plant cache: unknown entry version");
    this.meta = obj(header, "meta");
    const list = field(header, "arrays");
    if (!Array.isArray(list)) throw new Error("plant cache: no array list");
    let offset = align(4 + headerLength);
    for (const entry of list) {
      if (!Array.isArray(entry)) throw new Error("plant cache: bad array entry");
      const [name, code, length] = entry;
      if (typeof name !== "string" || typeof code !== "number" || typeof length !== "number") throw new Error("plant cache: bad array entry");
      const array = readArray(bytes, offset, code, length);
      this.arrays.set(name, array);
      offset = align(offset + array.byteLength);
    }
  }

  private get(name: string): PackedArray {
    const array = this.arrays.get(name);
    if (array === undefined) throw new Error(`plant cache: missing array ${name}`);
    return array;
  }

  f32(name: string): Float32Array {
    const array = this.get(name);
    if (!(array instanceof Float32Array)) throw new Error(`plant cache: ${name} is not Float32`);
    return array;
  }

  i32(name: string): Int32Array {
    const array = this.get(name);
    if (!(array instanceof Int32Array)) throw new Error(`plant cache: ${name} is not Int32`);
    return array;
  }

  u8(name: string): Uint8Array {
    const array = this.get(name);
    if (!(array instanceof Uint8Array)) throw new Error(`plant cache: ${name} is not Uint8`);
    return array;
  }

  u16(name: string): Uint16Array {
    const array = this.get(name);
    if (!(array instanceof Uint16Array)) throw new Error(`plant cache: ${name} is not Uint16`);
    return array;
  }

  u32(name: string): Uint32Array {
    const array = this.get(name);
    if (!(array instanceof Uint32Array)) throw new Error(`plant cache: ${name} is not Uint32`);
    return array;
  }
}

function readArray(bytes: Uint8Array, offset: number, code: number, length: number): PackedArray {
  const width = code === 1 ? 8 : code === 3 ? 1 : code === 4 ? 2 : 4;
  const copy = bytes.slice(offset, offset + length * width).buffer;
  switch (code) {
    case 0:
      return new Float32Array(copy);
    case 1:
      return new Float64Array(copy);
    case 2:
      return new Int32Array(copy);
    case 3:
      return new Uint8Array(copy);
    case 4:
      return new Uint16Array(copy);
    default:
      return new Uint32Array(copy);
  }
}

const BARK_KINDS: readonly BarkKind[] = ["smooth", "furrowed", "plated", "peeling", "fibrous", "scaly"];
const LEAF_KINDS: readonly LeafShapeParams["kind"][] = ["lobed", "ovate", "lanceolate", "needle", "scale", "blade", "frond"];

function oneOf<T extends string>(values: readonly T[], value: string, what: string): T {
  const match = values.find((candidate) => candidate === value);
  if (match === undefined) throw new Error(`plant cache: unknown ${what} ${value}`);
  return match;
}

/**
 * A grown plant's structure as bytes, with its hash, for a {@link PlantCacheStorage}.
 * @capability plant-cache cache grown plant structures and styled meshes in memory and injected storage
 */
export function encodePlantStructure(structure: PlantStructure, hash: string): Uint8Array {
  const arrays: [string, PackedArray][] = [["crownHull", structure.crownHull]];
  for (const [name, array] of Object.entries(structure.segments)) arrays.push([`segments.${name}`, array]);
  for (const [name, array] of Object.entries(structure.leaves)) arrays.push([`leaves.${name}`, array]);
  structure.clusters.levels.forEach((level, index) => {
    for (const [name, array] of Object.entries(level)) arrays.push([`clusters.${index}.${name}`, array]);
  });
  for (const [name, array] of Object.entries(structure.reproductive)) arrays.push([`reproductive.${name}`, array]);
  const meta = {
    hash,
    speciesId: structure.speciesId,
    ageYears: structure.ageYears,
    dayOfYear: structure.dayOfYear,
    seed: structure.seed,
    health: structure.health,
    stats: structure.stats,
    levels: structure.clusters.levels.length,
    leafShape: structure.leafShape,
    leafColor: structure.leafColor,
    organColor: structure.organColor,
    bark: structure.bark,
  };
  return pack(meta, arrays);
}

/**
 * The structure and hash {@link encodePlantStructure} wrote.
 * @capability plant-cache cache grown plant structures and styled meshes in memory and injected storage
 */
export function decodePlantStructure(bytes: Uint8Array): { structure: PlantStructure; hash: string } {
  const data = new Unpacked(bytes);
  const meta = data.meta;
  const stats = obj(meta, "stats");
  const leafShape = obj(meta, "leafShape");
  const leafColor = obj(meta, "leafColor");
  const organColor = obj(meta, "organColor");
  const bark = obj(meta, "bark");
  const levels: PlantClusterLevel[] = [];
  for (let index = 0; index < num(meta, "levels"); index += 1) {
    levels.push({
      center: data.f32(`clusters.${index}.center`),
      radius: data.f32(`clusters.${index}.radius`),
      parent: data.i32(`clusters.${index}.parent`),
      leafCount: data.u32(`clusters.${index}.leafCount`),
    });
  }
  const structure: PlantStructure = {
    speciesId: str(meta, "speciesId"),
    ageYears: num(meta, "ageYears"),
    dayOfYear: num(meta, "dayOfYear"),
    seed: str(meta, "seed"),
    health: num(meta, "health"),
    stats: { heightM: num(stats, "heightM"), dbhCm: num(stats, "dbhCm"), crownRadiusM: num(stats, "crownRadiusM"), crownBaseM: num(stats, "crownBaseM") },
    crownHull: data.f32("crownHull"),
    segments: {
      start: data.f32("segments.start"),
      end: data.f32("segments.end"),
      radiusStart: data.f32("segments.radiusStart"),
      radiusEnd: data.f32("segments.radiusEnd"),
      parent: data.i32("segments.parent"),
      order: data.u8("segments.order"),
      bornYear: data.u16("segments.bornYear"),
      distFromRoot: data.f32("segments.distFromRoot"),
      curvature: data.f32("segments.curvature"),
      region: data.u8("segments.region"),
      health: data.f32("segments.health"),
      light: data.f32("segments.light"),
      windPivot: data.f32("segments.windPivot"),
      windLevel: data.u8("segments.windLevel"),
    },
    leaves: {
      position: data.f32("leaves.position"),
      normal: data.f32("leaves.normal"),
      up: data.f32("leaves.up"),
      size: data.f32("leaves.size"),
      count: data.u16("leaves.count"),
      segment: data.i32("leaves.segment"),
      cluster: data.i32("leaves.cluster"),
      crownDepth: data.f32("leaves.crownDepth"),
      colorState: data.f32("leaves.colorState"),
      health: data.f32("leaves.health"),
    },
    clusters: { levels },
    reproductive: {
      kind: data.u8("reproductive.kind"),
      position: data.f32("reproductive.position"),
      size: data.f32("reproductive.size"),
      stage: data.f32("reproductive.stage"),
      count: data.u16("reproductive.count"),
    },
    leafShape: readLeafShape(leafShape),
    leafColor: { spring: str(leafColor, "spring"), summer: str(leafColor, "summer"), autumn: str(leafColor, "autumn") },
    organColor: { flower: str(organColor, "flower"), fruit: str(organColor, "fruit") },
    bark: { kind: oneOf(BARK_KINDS, str(bark, "kind"), "bark kind"), furrow: num(bark, "furrow"), color: str(bark, "color") },
  };
  return { structure, hash: str(meta, "hash") };
}

function readLeafShape(record: Json): LeafShapeParams {
  return {
    kind: oneOf(LEAF_KINDS, str(record, "kind"), "leaf shape"),
    lobes: num(record, "lobes"),
    lobeDepth: num(record, "lobeDepth"),
    aspect: num(record, "aspect"),
    petioleFraction: num(record, "petioleFraction"),
  };
}

function partMeta(part: NatureMesh): Json {
  return { bounds: part.bounds, triangles: part.triangles, ...(part.surface === undefined ? {} : { surface: part.surface }) };
}

function partArrays(prefix: string, part: NatureMesh): [string, PackedArray][] {
  return [
    [`${prefix}.positions`, part.positions],
    [`${prefix}.normals`, part.normals],
    [`${prefix}.colors`, part.colors],
    [`${prefix}.indices`, part.indices],
  ];
}

const SURFACES: readonly NatureSurface[] = ["rock", "bark"];

function readPart(data: Unpacked, prefix: string, meta: Json): NatureMesh {
  const bounds = obj(meta, "bounds");
  const surface = field(meta, "surface");
  return {
    positions: data.f32(`${prefix}.positions`),
    normals: data.f32(`${prefix}.normals`),
    colors: data.f32(`${prefix}.colors`),
    indices: data.u32(`${prefix}.indices`),
    bounds: { min: vec3(bounds, "min"), max: vec3(bounds, "max") },
    triangles: num(meta, "triangles"),
    ...(typeof surface === "string" ? { surface: oneOf(SURFACES, surface, "surface") } : {}),
  };
}

/**
 * A styled plant mesh as bytes for a {@link PlantCacheStorage}.
 * @capability plant-cache cache grown plant structures and styled meshes in memory and injected storage
 */
export function encodePlantMesh(mesh: PlantMesh): Uint8Array {
  const meta = {
    structureHash: mesh.structureHash,
    speciesId: mesh.speciesId,
    ageYears: mesh.ageYears,
    lod: mesh.lod,
    stats: mesh.stats,
    look: mesh.look,
    triangles: mesh.triangles,
    bounds: mesh.bounds,
    bark: partMeta(mesh.bark),
    leaves: partMeta(mesh.leaves),
  };
  return pack(meta, [...partArrays("bark", mesh.bark), ...partArrays("leaves", mesh.leaves), ["leafUvs", mesh.leafUvs]]);
}

/**
 * The mesh {@link encodePlantMesh} wrote.
 * @capability plant-cache cache grown plant structures and styled meshes in memory and injected storage
 */
export function decodePlantMesh(bytes: Uint8Array): PlantMesh {
  const data = new Unpacked(bytes);
  const meta = data.meta;
  const stats = obj(meta, "stats");
  const look = obj(meta, "look");
  const ramp = obj(look, "ramp");
  const shading = str(look, "shading");
  const bounds = obj(meta, "bounds");
  const decodedLook: PlantMeshLook = {
    shading: shading === "ramp" ? "ramp" : "lit",
    ramp: { bands: num(ramp, "bands"), softness: num(ramp, "softness"), shadow: num(ramp, "shadow") },
    barkGrain: bool(look, "barkGrain"),
    leafAtlas: field(look, "leafAtlas") === null ? null : readLeafShape(obj(look, "leafAtlas")),
  };
  return {
    structureHash: str(meta, "structureHash"),
    speciesId: str(meta, "speciesId"),
    ageYears: num(meta, "ageYears"),
    lod: num(meta, "lod"),
    stats: { heightM: num(stats, "heightM"), dbhCm: num(stats, "dbhCm"), crownRadiusM: num(stats, "crownRadiusM"), crownBaseM: num(stats, "crownBaseM") },
    bark: readPart(data, "bark", obj(meta, "bark")),
    leaves: readPart(data, "leaves", obj(meta, "leaves")),
    leafUvs: data.f32("leafUvs"),
    look: decodedLook,
    triangles: num(meta, "triangles"),
    bounds: { min: vec3(bounds, "min"), max: vec3(bounds, "max") },
  };
}
