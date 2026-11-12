import * as THREE from "three";

import { DECAL_LOOKS, decalCorners, type DecalLook, type ImpactDecalPool } from "@jgengine/core/vfx/impactDecals";

/** Atlas layout: a 4×2 grid of square cells, one look per cell in {@link DECAL_LOOKS} order. */
const ATLAS_COLUMNS = 4;
const ATLAS_ROWS = 2;
const CELL = 64;
/** Transparent border inside each cell so mipmaps never bleed one look into its neighbour. */
const CELL_MARGIN = 3;
/** A fading mark redraws at most this often: smoother than the eye reads, cheap for the pool. */
const FADE_REFRESH_S = 0.1;

/** Texture-space rectangle `[u0, v0, u1, v1]` of a look in the atlas. Exported for tests. @internal */
export function decalLookRect(look: DecalLook): readonly [number, number, number, number] {
  const index = Math.max(0, DECAL_LOOKS.indexOf(look));
  const column = index % ATLAS_COLUMNS;
  const row = Math.floor(index / ATLAS_COLUMNS);
  const width = ATLAS_COLUMNS * CELL;
  const height = ATLAS_ROWS * CELL;
  const u0 = (column * CELL + CELL_MARGIN) / width;
  const u1 = ((column + 1) * CELL - CELL_MARGIN) / width;
  const v0 = (row * CELL + CELL_MARGIN) / height;
  const v1 = ((row + 1) * CELL - CELL_MARGIN) / height;
  return [u0, v0, u1, v1];
}

/** Deterministic hash noise in `[0, 1)` for the procedural artwork. */
function noise(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** One look's shade (0 black … 255 white) and alpha (0..1) at cell coordinates `dx, dy` in `[-0.5, 0.5]`. */
function lookTexel(look: DecalLook, dx: number, dy: number): [number, number] {
  const r = Math.hypot(dx, dy) * 2;
  const angle = Math.atan2(dy, dx);
  switch (look) {
    case "scorch": {
      // A dark hole inside a pale chipped ring, so the mark reads on dark asphalt and pale stone alike.
      const rays = 0.82 + 0.18 * Math.sin(angle * 7 + Math.sin(angle * 3) * 2);
      const core = Math.max(0, 1 - r / 0.3);
      const ring = Math.max(0, 1 - Math.abs(r - 0.5 * rays) / 0.22);
      const edge = Math.max(0, 1 - r / rays) ** 1.4;
      return [core > 0 ? 14 : 14 + 190 * ring, Math.min(1, core + ring * 0.85 * edge + edge * 0.35)];
    }
    case "hole": {
      const core = r < 0.2 ? 1 : Math.max(0, 1 - (r - 0.2) / 0.06);
      const rim = Math.max(0, 1 - Math.abs(r - 0.3) / 0.1) * (0.7 + 0.3 * Math.sin(angle * 9));
      return [core > 0.5 ? 10 : 70, Math.min(1, core + rim * 0.7)];
    }
    case "dent": {
      const rays = 0.75 + 0.25 * Math.sin(angle * 5 + 1.3);
      const crater = Math.max(0, 1 - r / (0.7 * rays));
      const scuff = noise(dx * 40, dy * 40, 3) * 0.35;
      return [Math.round(90 + 150 * crater * (1 - r)), Math.min(1, crater * (0.75 + scuff))];
    }
    case "splash": {
      const lobes = 0.55 + 0.2 * Math.sin(angle * 5 + 0.7) + 0.12 * Math.sin(angle * 11 + 2.1);
      const body = r < lobes ? 1 : Math.max(0, 1 - (r - lobes) / 0.08);
      // Droplets thrown past the rim.
      const ring = Math.floor(angle * 4.5 + 9);
      const dropAt = 0.78 + noise(ring, 0, 5) * 0.18;
      const drop = Math.max(0, 1 - Math.hypot(r - dropAt, (angle * 4.5 - Math.round(angle * 4.5)) * r * 1.4) / 0.07);
      return [Math.round(150 + 60 * noise(dx * 9, dy * 9, 1)), Math.min(1, body * 0.92 + drop * 0.85)];
    }
    case "chip": {
      const jag = 0.6 + 0.25 * noise(Math.round(angle * 6), 0, 7) + 0.1 * Math.sin(angle * 13);
      const flake = r < jag ? 1 : 0;
      const pit = Math.max(0, 1 - r / 0.22);
      return [pit > 0.3 ? 40 : Math.round(200 + 40 * noise(dx * 20, dy * 20, 2)), Math.min(1, flake * 0.8 + pit)];
    }
    case "crack": {
      let line = 0;
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2 + noise(i, 1, 9) * 0.6;
        const diff = Math.abs(Math.atan2(Math.sin(angle - a), Math.cos(angle - a)));
        line = Math.max(line, Math.max(0, 1 - (diff * r) / 0.025) * (r < 0.9 ? 1 : 0));
      }
      const ring = Math.max(0, 1 - Math.abs(r - 0.45) / 0.02) * 0.6;
      const pit = Math.max(0, 1 - r / 0.08);
      return [235, Math.min(1, line * 0.9 + ring + pit)];
    }
  }
}

/** The procedural artwork of every look, packed into one texture so every decal shares a material. */
function buildDecalAtlas(): THREE.DataTexture {
  const width = ATLAS_COLUMNS * CELL;
  const height = ATLAS_ROWS * CELL;
  const data = new Uint8Array(width * height * 4);
  DECAL_LOOKS.forEach((look, index) => {
    const ox = (index % ATLAS_COLUMNS) * CELL;
    const oy = Math.floor(index / ATLAS_COLUMNS) * CELL;
    const inner = CELL - CELL_MARGIN * 2;
    for (let y = CELL_MARGIN; y < CELL - CELL_MARGIN; y += 1) {
      for (let x = CELL_MARGIN; x < CELL - CELL_MARGIN; x += 1) {
        const dx = (x - CELL_MARGIN + 0.5) / inner - 0.5;
        const dy = (y - CELL_MARGIN + 0.5) / inner - 0.5;
        const [shade, alpha] = lookTexel(look, dx, dy);
        const i = ((oy + y) * width + ox + x) * 4;
        data[i] = shade;
        data[i + 1] = shade * 0.96;
        data[i + 2] = shade * 0.9;
        data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, alpha)));
      }
    }
  });
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** The vertex arrays one decal mesh writes into: four vertices per mark. */
export interface DecalBuffers {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
}

/** Vertex arrays sized for `capacity` marks. */
export function createDecalBuffers(capacity: number): DecalBuffers {
  const vertices = Math.max(1, capacity) * 4;
  return {
    positions: new Float32Array(vertices * 3),
    normals: new Float32Array(vertices * 3),
    uvs: new Float32Array(vertices * 2),
    colors: new Float32Array(vertices * 4),
  };
}

const tintCache = new Map<string, readonly [number, number, number]>();
function tintOf(hex: string | undefined): readonly [number, number, number] {
  if (hex === undefined) return [1, 1, 1];
  let tint = tintCache.get(hex);
  if (tint === undefined) {
    // THREE.Color converts the sRGB hex into the renderer's linear working space, as vertex colours expect.
    const color = new THREE.Color(hex);
    tint = [color.r, color.g, color.b];
    tintCache.set(hex, tint);
  }
  return tint;
}

/**
 * Write the pool's live marks, oldest first, as quads into `buffers`: corners in the surface plane,
 * the normal on every vertex, the look's atlas cell as UVs, and the kind's tint with the fade as the
 * vertex colour's alpha. Fully faded marks are skipped. Returns how many marks were written. Exported
 * for tests. @internal
 */
export function writeImpactDecalGeometry(pool: ImpactDecalPool, now: number, buffers: DecalBuffers): number {
  const max = Math.floor(buffers.positions.length / 12);
  let written = 0;
  for (const decal of pool.list()) {
    if (written >= max) break;
    const opacity = pool.opacity(decal, now);
    if (opacity <= 0.003) continue;
    const kind = pool.kind(decal.kind);
    if (kind === undefined) continue;
    decalCorners(decal, buffers.positions, written * 12);
    const [u0, v0, u1, v1] = decalLookRect(kind.look);
    const uv = [u0, v0, u1, v0, u1, v1, u0, v1];
    const [r, g, b] = tintOf(kind.tint);
    for (let corner = 0; corner < 4; corner += 1) {
      const vertex = written * 4 + corner;
      buffers.normals[vertex * 3] = decal.normal[0];
      buffers.normals[vertex * 3 + 1] = decal.normal[1];
      buffers.normals[vertex * 3 + 2] = decal.normal[2];
      buffers.uvs[vertex * 2] = uv[corner * 2]!;
      buffers.uvs[vertex * 2 + 1] = uv[corner * 2 + 1]!;
      buffers.colors[vertex * 4] = r;
      buffers.colors[vertex * 4 + 1] = g;
      buffers.colors[vertex * 4 + 2] = b;
      buffers.colors[vertex * 4 + 3] = opacity;
    }
    written += 1;
  }
  return written;
}

/** The two triangles of each quad, counter-clockwise from the front. */
function quadIndex(capacity: number): THREE.BufferAttribute {
  const count = Math.max(1, capacity);
  const index = count * 4 > 65535 ? new Uint32Array(count * 6) : new Uint16Array(count * 6);
  for (let q = 0; q < count; q += 1) {
    const v = q * 4;
    index.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
  }
  return new THREE.BufferAttribute(index, 1);
}

/** One mesh that draws a whole decal pool. */
export interface ImpactDecalLayer {
  readonly mesh: THREE.Mesh;
  /** Rewrite the mesh when the pool changed or a mark is mid-fade. Prunes expired marks first. */
  sync(pool: ImpactDecalPool, now: number): void;
  dispose(): void;
}

/**
 * The draw side of {@link ImpactDecalPool}: every live mark is a quad in one merged geometry over a
 * shared atlas, so any number of decals of any kinds is one draw call. Marks sit off the surface
 * along their normal (the pool's offset) and the material pushes them forward in depth too, so they
 * never z-fight the surface; transparent with no depth write, so the newest mark draws over older ones.
 * The geometry is rewritten only when the pool changes or while a mark is fading.
 *
 * @capability impact-decal-draw one-draw mesh for an impact decal pool: normal-aligned quads over a shared atlas, faded by vertex alpha
 */
export function createImpactDecalLayer(capacity: number): ImpactDecalLayer {
  const buffers = createDecalBuffers(capacity);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(buffers.positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("normal", new THREE.BufferAttribute(buffers.normals, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("uv", new THREE.BufferAttribute(buffers.uvs, 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("color", new THREE.BufferAttribute(buffers.colors, 4).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(quadIndex(capacity));
  geometry.setDrawRange(0, 0);
  const material = new THREE.MeshStandardMaterial({
    map: buildDecalAtlas(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    roughness: 0.95,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "impact-decals";
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  const seen = { version: -1, writtenAt: -Infinity };

  return {
    mesh,
    sync(pool, now) {
      pool.prune(now);
      const version = pool.version();
      if (version === seen.version && !(pool.fading(now) && now - seen.writtenAt >= FADE_REFRESH_S)) return;
      seen.version = version;
      seen.writtenAt = now;
      const count = writeImpactDecalGeometry(pool, now, buffers);
      geometry.setDrawRange(0, count * 6);
      for (const name of ["position", "normal", "uv", "color"]) {
        const attribute = geometry.getAttribute(name) as THREE.BufferAttribute;
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, count * 4 * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    },
    dispose() {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    },
  };
}
