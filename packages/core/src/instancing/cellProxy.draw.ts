import * as THREE from "three";

import type { SlicedJob } from "@jgengine/core/run/slicedWork";

/** One placed piece a cell proxy merges: its geometry, where it stands, and what colours it. @internal */
export interface ProxyPart {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  material: THREE.Material;
}

/** Triangles a proxy build handles between yields. */
const TRIANGLES_PER_STEP = 4096;
/** Edge of the downsampled texture a proxy reads its colours from. */
const SAMPLE_EDGE = 128;
/** Grid units either side of the origin a cluster key holds (2^16 clusters), keeping three packed axes under 2^53. */
const KEY_OFFSET = 1 << 16;
const KEY_SPAN = 1 << 17;

interface Texels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const sampled = new WeakMap<object, Texels | null>();

function hasSize(image: unknown): image is CanvasImageSource & { width: number; height: number } {
  return typeof image === "object" && image !== null && typeof Reflect.get(image, "width") === "number" && typeof Reflect.get(image, "height") === "number";
}

/** A small copy of a texture's pixels to colour proxy vertices from, or null where no canvas can read it (tests, workers, compressed maps). */
function texelsOf(texture: THREE.Texture): Texels | null {
  const source = texture.source;
  if (sampled.has(source)) return sampled.get(source) ?? null;
  let texels: Texels | null = null;
  const image: unknown = source.data;
  if (typeof document !== "undefined" && hasSize(image) && image.width > 0 && image.height > 0) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(SAMPLE_EDGE, image.width);
      canvas.height = Math.min(SAMPLE_EDGE, image.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context !== null) {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        texels = { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
      }
    } catch {
      texels = null;
    }
  }
  sampled.set(source, texels);
  return texels;
}

const SRGB_TO_LINEAR = Array.from({ length: 256 }, (_, value) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** How one part colours a vertex: the material colour, times its map at the vertex's UV, times its vertex colour. */
function partColorer(part: ProxyPart): (vertex: number, out: THREE.Color) => THREE.Color {
  const material = part.material;
  const base = new THREE.Color(1, 1, 1);
  const tinted = Reflect.get(material, "color");
  if (tinted instanceof THREE.Color) base.copy(tinted);
  const map = Reflect.get(material, "map");
  const texels = map instanceof THREE.Texture ? texelsOf(map) : null;
  const uv = part.geometry.getAttribute("uv");
  const colors = material.vertexColors ? part.geometry.getAttribute("color") : undefined;
  const flipY = map instanceof THREE.Texture && map.flipY;
  const transform = map instanceof THREE.Texture ? (map.updateMatrix(), map.matrix) : null;
  const at = new THREE.Vector2();
  return (vertex, out) => {
    out.copy(base);
    if (texels !== null && uv !== undefined && transform !== null) {
      at.set(uv.getX(vertex), uv.getY(vertex)).applyMatrix3(transform);
      const u = at.x - Math.floor(at.x);
      const v = at.y - Math.floor(at.y);
      const x = Math.min(texels.width - 1, Math.floor(u * texels.width));
      const y = Math.min(texels.height - 1, Math.floor((flipY ? 1 - v : v) * texels.height));
      const offset = (y * texels.width + x) * 4;
      out.r *= SRGB_TO_LINEAR[texels.data[offset] ?? 255] ?? 1;
      out.g *= SRGB_TO_LINEAR[texels.data[offset + 1] ?? 255] ?? 1;
      out.b *= SRGB_TO_LINEAR[texels.data[offset + 2] ?? 255] ?? 1;
    }
    if (colors !== undefined) {
      out.r *= colors.getX(vertex);
      out.g *= colors.getY(vertex);
      out.b *= colors.getZ(vertex);
    }
    return out;
  };
}

/**
 * Merge a cell's placed pieces into one far proxy: every vertex snapped to a `cluster`-metre grid in
 * world space, the vertices sharing a grid cell merged into one (position and colour averaged),
 * triangles that collapse dropped. One vertex-coloured mesh in place of every batch in the cell,
 * with detail below the cluster size gone — what a cell far enough away cannot show anyway. Built in
 * steps of a few thousand triangles, so {@link runSliced} can spread it over frames.
 * @internal
 */
export function* cellProxyJob(parts: readonly ProxyPart[], cluster: number): SlicedJob<THREE.BufferGeometry> {
  if (!(cluster > 0) || !Number.isFinite(cluster)) throw new Error("A cell proxy needs a positive cluster size");
  const slots = new Map<number, number>();
  const sums: number[] = [];
  const indices: number[] = [];
  const point = new THREE.Vector3();
  const color = new THREE.Color();
  const corner = [0, 0, 0];
  let budget = TRIANGLES_PER_STEP;
  for (const part of parts) {
    const position = part.geometry.getAttribute("position");
    const index = part.geometry.index;
    const triangles = Math.floor((index?.count ?? position.count) / 3);
    const colorOf = partColorer(part);
    const slotOf = (vertex: number): number => {
      point.fromBufferAttribute(position, vertex).applyMatrix4(part.matrix);
      const kx = Math.floor(point.x / cluster) + KEY_OFFSET;
      const ky = Math.floor(point.y / cluster) + KEY_OFFSET;
      const kz = Math.floor(point.z / cluster) + KEY_OFFSET;
      const key = (kx * KEY_SPAN + ky) * KEY_SPAN + kz;
      let slot = slots.get(key);
      if (slot === undefined) {
        slot = slots.size;
        slots.set(key, slot);
        sums.push(0, 0, 0, 0, 0, 0, 0);
      }
      colorOf(vertex, color);
      const at = slot * 7;
      sums[at] = (sums[at] ?? 0) + point.x;
      sums[at + 1] = (sums[at + 1] ?? 0) + point.y;
      sums[at + 2] = (sums[at + 2] ?? 0) + point.z;
      sums[at + 3] = (sums[at + 3] ?? 0) + color.r;
      sums[at + 4] = (sums[at + 4] ?? 0) + color.g;
      sums[at + 5] = (sums[at + 5] ?? 0) + color.b;
      sums[at + 6] = (sums[at + 6] ?? 0) + 1;
      return slot;
    };
    for (let triangle = 0; triangle < triangles; triangle += 1) {
      for (let side = 0; side < 3; side += 1) {
        const vertex = index === null ? triangle * 3 + side : index.getX(triangle * 3 + side);
        corner[side] = slotOf(vertex);
      }
      const [a = 0, b = 0, c = 0] = corner;
      if (a !== b && b !== c && a !== c) indices.push(a, b, c);
      if (--budget === 0) {
        budget = TRIANGLES_PER_STEP;
        yield;
      }
    }
  }
  const count = slots.size;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let slot = 0; slot < count; slot += 1) {
    const at = slot * 7;
    const weight = sums[at + 6] ?? 1;
    for (let axis = 0; axis < 3; axis += 1) {
      positions[slot * 3 + axis] = (sums[at + axis] ?? 0) / weight;
      colors[slot * 3 + axis] = (sums[at + 3 + axis] ?? 0) / weight;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
