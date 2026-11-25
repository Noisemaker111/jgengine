/**
 * A Wavefront OBJ reader for scene import: bytes in, indexed typed arrays out, one submesh per
 * material run of each object. It reads the bytes directly (no text decode, no per-line strings) so a
 * folder of a gigabyte of OBJ text parses in seconds on a few workers. Plain data, so it crosses to
 * and from a worker by transfer.
 */

/** One material run of an object: indexed triangles. */
export interface ObjSubmesh {
  /** The `usemtl` name it was written under, or null. */
  material: string | null;
  positions: Float32Array;
  normals: Float32Array;
  /** Null when the object wrote no texture coordinates. V runs bottom-up, as OBJ writes it. */
  uvs: Float32Array | null;
  indices: Uint32Array;
  /** Bounding box of `positions`: min X, Y, Z then max X, Y, Z. */
  bounds: Float32Array;
}

/** One object (`o`, or `g` in a file with no `o`) and its submeshes in file order. */
export interface ObjObject {
  name: string;
  submeshes: ObjSubmesh[];
}

class FloatList {
  data: Float32Array;
  length = 0;
  constructor(capacity = 1024) {
    this.data = new Float32Array(capacity);
  }
  push(value: number): void {
    if (this.length === this.data.length) {
      const next = new Float32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = value;
  }
  done(): Float32Array {
    return this.data.slice(0, this.length);
  }
}

class IndexList {
  data: Uint32Array;
  length = 0;
  constructor(capacity = 1024) {
    this.data = new Uint32Array(capacity);
  }
  push(value: number): void {
    if (this.length === this.data.length) {
      const next = new Uint32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = value;
  }
}

/** Corner keys fit one double while the file has fewer than 2^26 texture coordinates. */
const UV_SPAN = 2 ** 26;

class SubmeshBuilder {
  readonly positions = new FloatList();
  readonly normals = new FloatList();
  readonly uvs = new FloatList();
  readonly indices = new IndexList();
  /** Output vertex per `position, uv` corner; the normal is checked against the vertex it found. */
  private readonly corners = new Map<number, number>();
  private readonly cornerNormal: number[] = [];
  private readonly split = new Map<string, number>();
  private count = 0;
  hasUv = true;
  hasNormal = true;

  constructor(readonly material: string | null) {}

  vertex(v: number, t: number, n: number, source: ObjSource): number {
    const key = v * UV_SPAN + (t + 1);
    let index = this.corners.get(key);
    if (index !== undefined && this.cornerNormal[index] === n) return index;
    if (index !== undefined) {
      const splitKey = `${v}/${t}/${n}`;
      index = this.split.get(splitKey);
      if (index !== undefined) return index;
    }
    index = this.count++;
    if (this.corners.has(key)) this.split.set(`${v}/${t}/${n}`, index);
    else this.corners.set(key, index);
    this.cornerNormal[index] = n;
    const p = source.positions.data;
    this.positions.push(p[v * 3]!);
    this.positions.push(p[v * 3 + 1]!);
    this.positions.push(p[v * 3 + 2]!);
    if (t < 0) this.hasUv = false;
    else {
      this.uvs.push(source.uvs.data[t * 2] ?? 0);
      this.uvs.push(source.uvs.data[t * 2 + 1] ?? 0);
    }
    if (n < 0) {
      this.hasNormal = false;
      this.normals.push(0);
      this.normals.push(0);
      this.normals.push(0);
    } else {
      const normals = source.normals.data;
      this.normals.push(normals[n * 3] ?? 0);
      this.normals.push(normals[n * 3 + 1] ?? 0);
      this.normals.push(normals[n * 3 + 2] ?? 0);
    }
    return index;
  }

  finish(): ObjSubmesh {
    const positions = this.positions.done();
    const indices = this.indices.data.slice(0, this.indices.length);
    const normals = this.hasNormal ? this.normals.done() : smoothNormals(positions, indices);
    return { material: this.material, positions, normals, uvs: this.hasUv && this.uvs.length > 0 ? this.uvs.done() : null, indices, bounds: boundsOf(positions) };
  }
}

interface ObjSource {
  positions: FloatList;
  uvs: FloatList;
  normals: FloatList;
}

function boundsOf(positions: Float32Array): Float32Array {
  const bounds = new Float32Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  for (let at = 0; at < positions.length; at += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[at + axis]!;
      if (value < bounds[axis]!) bounds[axis] = value;
      if (value > bounds[axis + 3]!) bounds[axis + 3] = value;
    }
  }
  return bounds;
}

/** Area-weighted vertex normals, for an object that wrote none. */
function smoothNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let face = 0; face < indices.length; face += 3) {
    const a = indices[face]! * 3, b = indices[face + 1]! * 3, c = indices[face + 2]! * 3;
    const abx = positions[b]! - positions[a]!, aby = positions[b + 1]! - positions[a + 1]!, abz = positions[b + 2]! - positions[a + 2]!;
    const acx = positions[c]! - positions[a]!, acy = positions[c + 1]! - positions[a + 1]!, acz = positions[c + 2]! - positions[a + 2]!;
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    for (const corner of [a, b, c]) {
      normals[corner] = normals[corner]! + nx;
      normals[corner + 1] = normals[corner + 1]! + ny;
      normals[corner + 2] = normals[corner + 2]! + nz;
    }
  }
  for (let at = 0; at < normals.length; at += 3) {
    const length = Math.hypot(normals[at]!, normals[at + 1]!, normals[at + 2]!) || 1;
    normals[at] = normals[at]! / length;
    normals[at + 1] = normals[at + 1]! / length;
    normals[at + 2] = normals[at + 2]! / length;
  }
  return normals;
}

const SPACE = 32, TAB = 9, NEWLINE = 10, RETURN = 13, SLASH = 47, MINUS = 45, PLUS = 43, DOT = 46;

/**
 * Read an OBJ file's objects. Polygons are fanned into triangles; negative (relative) indices are
 * resolved; `mtllib`, smoothing groups and free-form geometry are ignored.
 */
export function parseObj(bytes: Uint8Array): ObjObject[] {
  const source: ObjSource = { positions: new FloatList(4096), uvs: new FloatList(4096), normals: new FloatList(4096) };
  const objects: { name: string; builders: Map<string | null, SubmeshBuilder> }[] = [];
  let current: { name: string; builders: Map<string | null, SubmeshBuilder> } | null = null;
  let material: string | null = null;
  let sawO = false;
  const end = bytes.length;
  let at = 0;
  const corner = { v: 0, t: 0, n: 0 };
  const face: number[] = [];

  const skipSpaces = () => {
    while (at < end && (bytes[at] === SPACE || bytes[at] === TAB)) at += 1;
  };
  const skipLine = () => {
    while (at < end && bytes[at] !== NEWLINE) at += 1;
    at += 1;
  };
  const restOfLine = (): string => {
    skipSpaces();
    const start = at;
    while (at < end && bytes[at] !== NEWLINE && bytes[at] !== RETURN) at += 1;
    let stop = at;
    while (stop > start && (bytes[stop - 1] === SPACE || bytes[stop - 1] === TAB)) stop -= 1;
    let out = "";
    for (let index = start; index < stop; index += 1) out += String.fromCharCode(bytes[index]!);
    return out;
  };
  const number = (): number => {
    skipSpaces();
    let sign = 1;
    if (bytes[at] === MINUS) {
      sign = -1;
      at += 1;
    } else if (bytes[at] === PLUS) at += 1;
    let value = 0;
    let c = bytes[at]!;
    while (c >= 48 && c <= 57) {
      value = value * 10 + (c - 48);
      c = bytes[++at]!;
    }
    if (c === DOT) {
      let scale = 0.1;
      c = bytes[++at]!;
      while (c >= 48 && c <= 57) {
        value += (c - 48) * scale;
        scale *= 0.1;
        c = bytes[++at]!;
      }
    }
    if (c === 101 || c === 69) {
      at += 1;
      let exponentSign = 1;
      if (bytes[at] === MINUS) {
        exponentSign = -1;
        at += 1;
      } else if (bytes[at] === PLUS) at += 1;
      let exponent = 0;
      c = bytes[at]!;
      while (c >= 48 && c <= 57) {
        exponent = exponent * 10 + (c - 48);
        c = bytes[++at]!;
      }
      value *= 10 ** (exponentSign * exponent);
    }
    return sign * value;
  };
  /** One OBJ index, resolved to zero-based; -1 when absent. */
  const index = (count: number): number => {
    let sign = 1;
    if (bytes[at] === MINUS) {
      sign = -1;
      at += 1;
    }
    let value = 0;
    let digits = 0;
    let c = bytes[at]!;
    while (c >= 48 && c <= 57) {
      value = value * 10 + (c - 48);
      digits += 1;
      c = bytes[++at]!;
    }
    if (digits === 0) return -1;
    return sign < 0 ? count - value : value - 1;
  };
  const readCorner = (): boolean => {
    skipSpaces();
    const c = bytes[at];
    if (at >= end || c === NEWLINE || c === RETURN) return false;
    corner.v = index(source.positions.length / 3);
    corner.t = -1;
    corner.n = -1;
    if (bytes[at] === SLASH) {
      at += 1;
      corner.t = index(source.uvs.length / 2);
      if (bytes[at] === SLASH) {
        at += 1;
        corner.n = index(source.normals.length / 3);
      }
    }
    while (at < end && bytes[at] !== SPACE && bytes[at] !== TAB && bytes[at] !== NEWLINE && bytes[at] !== RETURN) at += 1;
    return corner.v >= 0;
  };
  const builder = (): SubmeshBuilder => {
    if (current === null) {
      current = { name: "", builders: new Map() };
      objects.push(current);
    }
    let found = current.builders.get(material);
    if (found === undefined) {
      found = new SubmeshBuilder(material);
      current.builders.set(material, found);
    }
    return found;
  };
  const startObject = (name: string) => {
    current = { name, builders: new Map() };
    objects.push(current);
  };

  while (at < end) {
    skipSpaces();
    const first = bytes[at];
    const second = bytes[at + 1];
    if (first === 118 /* v */) {
      if (second === SPACE || second === TAB) {
        at += 2;
        source.positions.push(number());
        source.positions.push(number());
        source.positions.push(number());
      } else if (second === 116 /* t */) {
        at += 2;
        source.uvs.push(number());
        source.uvs.push(number());
      } else if (second === 110 /* n */) {
        at += 2;
        source.normals.push(number());
        source.normals.push(number());
        source.normals.push(number());
      }
      skipLine();
    } else if (first === 102 /* f */ && (second === SPACE || second === TAB)) {
      at += 2;
      const target = builder();
      face.length = 0;
      while (readCorner()) face.push(target.vertex(corner.v, corner.t, corner.n, source));
      for (let fan = 1; fan + 1 < face.length; fan += 1) {
        target.indices.push(face[0]!);
        target.indices.push(face[fan]!);
        target.indices.push(face[fan + 1]!);
      }
      skipLine();
    } else if (first === 111 /* o */ && (second === SPACE || second === TAB)) {
      at += 1;
      sawO = true;
      startObject(restOfLine());
      skipLine();
    } else if (first === 103 /* g */ && (second === SPACE || second === TAB)) {
      at += 1;
      const name = restOfLine();
      if (!sawO) startObject(name);
      skipLine();
    } else if (first === 117 /* u */ && bytes[at + 6] !== undefined && String.fromCharCode(...bytes.subarray(at, at + 6)) === "usemtl") {
      at += 6;
      material = restOfLine();
      skipLine();
    } else skipLine();
  }
  return objects.flatMap((object) => {
    const submeshes = [...object.builders.values()].filter((built) => built.indices.length > 0).map((built) => built.finish());
    return submeshes.length === 0 ? [] : [{ name: object.name, submeshes }];
  });
}

/** The object an instance names: by name, or the only one when the file holds a single object. */
export function findObjObject(objects: readonly ObjObject[], name: string): ObjObject | null {
  return objects.find((object) => object.name === name) ?? (objects.length === 1 ? objects[0]! : null);
}

/** Every buffer of parsed objects, to transfer them across threads. */
export function objBuffers(objects: readonly ObjObject[]): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  for (const object of objects) {
    for (const submesh of object.submeshes) {
      for (const array of [submesh.positions, submesh.normals, submesh.uvs, submesh.indices, submesh.bounds]) {
        if (array !== null && array.buffer instanceof ArrayBuffer) buffers.push(array.buffer);
      }
    }
  }
  return buffers;
}
