import * as THREE from "three";

import {
  bakeGrassNode,
  GRASS_CELL_SIZE,
  grassNodeRect,
  grassTuftsBelow,
  type GrassTufts,
  type ResolvedGrassBake,
} from "./grassBake.draw";
import { createGrassTuftTemplate, type GrassTuftTemplate } from "./grassField";
import type { GrassMaterialHandle } from "./grassMaterial.draw";

/**
 * Blades per CSS pixel² the field aims for beyond the near zone. Inside the zone every tuft draws;
 * past it the share falls with the square of distance, so the blades on screen stay about constant
 * however far the field runs and however dense the look is.
 */
export const GRASS_SCREEN_DENSITY = 1 / 16;
/** A node splits while the camera is closer than this many node widths. */
const SPLIT = 2;
/** Blade height on screen, in pixels, below which a blade is not drawn at all. */
const MIN_BLADE_PIXELS = 1.25;
/** Bake headroom: a node bakes this much more than it needs, so an approaching camera does not re-bake every step. */
const BAKE_HEADROOM = 1.5;

/** The camera-dependent numbers a frame's LOD reads. */
interface CameraLod {
  perspective: boolean;
  /** Pixels per metre at unit distance (perspective) or everywhere (orthographic). */
  pixelsPerMetre: number;
  /** share = min(1, shareNumerator / d²) in perspective. */
  shareNumerator: number;
  orthoShare: number;
  reach: number;
}

interface Leaf {
  key: string;
  level: number;
  ix: number;
  iz: number;
  share: number;
  tufts: GrassTufts;
  geometry: THREE.InstancedBufferGeometry;
  mesh: THREE.Mesh;
  /** Patch-local root box grown by blade and wind reach. */
  bounds: THREE.Box3;
  used: number;
}

/** Per-frame bookkeeping the stream reports, for tests and devtools. */
export interface GrassStreamStats {
  /** Leaves drawn this frame. */
  leaves: number;
  /** Tufts resident in drawn leaves. */
  tufts: number;
  /** Leaves held in the cache, drawn or not. */
  cached: number;
  /** Nodes still waiting for a bake. */
  pending: number;
}

/** Options for {@link GrassStream}. */
export interface GrassStreamOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
  frustumCulled?: boolean;
}

/**
 * Camera-streamed grass for one patch. A quadtree over the patch's base cells splits near the
 * camera and stays coarse far away; each leaf node bakes only the share of tufts its distance
 * needs, so resident and drawn work follow what the camera sees rather than the patch area. Leaves
 * are three meshes under {@link GrassStream.group}; three frustum-culls them per camera, and each
 * draw trims its instance count and segment detail to that camera's distance.
 */
export class GrassStream {
  /** Parent of every leaf mesh; mount it inside the patch's transform. */
  readonly group = new THREE.Group();
  private readonly template: GrassTuftTemplate;
  private readonly cache = new Map<string, Leaf>();
  private readonly heights = new Map<string, [number, number]>();
  private drawn: Leaf[] = [];
  private frame = 0;
  private pending = 0;
  private viewHeight = 720;
  private readonly signature = new Float32Array(16 * 3 + 1);
  private readonly frustum = new THREE.Frustum();
  private readonly box = new THREE.Box3();
  private readonly sphere = new THREE.Sphere();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();

  constructor(
    private readonly bake: ResolvedGrassBake,
    private readonly handle: GrassMaterialHandle,
    private readonly options: GrassStreamOptions = {},
  ) {
    this.template = createGrassTuftTemplate(bake);
    this.group.name = "grass-stream";
  }

  /**
   * Re-select and bake leaves for `camera`. `viewHeight` is the canvas height in CSS pixels;
   * `budgetMs` caps bake time this call (`Infinity` bakes everything now). The nearest leaf always
   * bakes, so a call makes progress on any budget.
   */
  update(camera: THREE.Camera, viewHeight: number, budgetMs: number): void {
    this.group.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    this.viewHeight = Math.max(1, viewHeight);
    if (!this.changed(camera) && this.pending === 0) return;
    this.frame += 1;
    const lod = this.cameraLod(camera);
    camera.getWorldPosition(this.cameraPosition);
    const desired: { level: number; ix: number; iz: number; share: number; distance: number }[] = [];
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix, camera.coordinateSystem);
    const visit = (level: number, ix: number, iz: number) => {
      const box = this.nodeWorldBox(level, ix, iz);
      if (!lod.perspective && !this.frustum.intersectsBox(box)) return;
      const distance = box.distanceToPoint(this.cameraPosition);
      if (lod.perspective && distance > lod.reach) return;
      const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      const split = lod.perspective ? distance < SPLIT * size : size > GRASS_CELL_SIZE * 4 * SPLIT;
      if (level > 0 && split) {
        const span = 2 ** (level - 1);
        for (let dz = 0; dz < 2; dz += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            const cx = ix * 2 + dx, cz = iz * 2 + dz;
            if (cx * span < this.bake.columns && cz * span < this.bake.rows) visit(level - 1, cx, cz);
          }
        }
        return;
      }
      desired.push({ level, ix, iz, share: shareAt(lod, distance), distance });
    };
    visit(this.bake.rootLevel, 0, 0);
    desired.sort((a, b) => a.distance - b.distance);

    const started = now();
    const next = new Set<Leaf>();
    let pending = 0;
    for (const node of desired) {
      const key = `${node.level}:${node.ix}:${node.iz}`;
      let leaf = this.cache.get(key);
      if (node.share <= 0) continue;
      if (leaf === undefined || leaf.share < node.share) {
        if (now() - started <= budgetMs) {
          if (leaf !== undefined) this.drop(leaf);
          leaf = this.bakeLeaf(key, node.level, node.ix, node.iz, Math.min(1, node.share * BAKE_HEADROOM));
        } else {
          pending += 1;
          leaf ??= this.ancestor(node.level, node.ix, node.iz);
        }
      }
      if (leaf === undefined) continue;
      leaf.used = this.frame;
      // Every leaf around the camera stays baked, so turning never waits on a bake; only the ones in
      // view join the scene graph, which keeps node count and per-draw culling to what is on screen.
      if (leaf.tufts.count > 0 && this.frustum.intersectsSphere(this.sphere.copy(leaf.geometry.boundingSphere!).applyMatrix4(this.group.matrixWorld))) next.add(leaf);
    }
    for (const leaf of this.drawn) if (!next.has(leaf)) this.group.remove(leaf.mesh);
    for (const leaf of next) {
      if (leaf.mesh.parent !== this.group) this.group.add(leaf.mesh);
    }
    this.drawn = [...next];
    this.pending = pending;
    this.evict();
  }

  /** What the stream holds and draws now. */
  stats(): GrassStreamStats {
    return {
      leaves: this.drawn.length,
      tufts: this.drawn.reduce((sum, leaf) => sum + leaf.tufts.count, 0),
      cached: this.cache.size,
      pending: this.pending,
    };
  }

  /** Free every leaf's GPU buffers. */
  dispose(): void {
    for (const leaf of this.cache.values()) this.drop(leaf);
    this.drawn = [];
  }

  private changed(camera: THREE.Camera): boolean {
    const sig = this.signature;
    let dirty = false;
    const write = (offset: number, elements: ArrayLike<number>) => {
      for (let i = 0; i < 16; i += 1) {
        const value = elements[i]!;
        // Sub-decimetre camera moves do not change which nodes the camera needs.
        if (Math.abs(sig[offset + i]! - value) > (i >= 12 && offset === 0 ? 0.1 : 1e-4)) {
          sig[offset + i] = value;
          dirty = true;
        }
      }
    };
    write(0, camera.matrixWorld.elements);
    write(16, camera.projectionMatrix.elements);
    write(32, this.group.matrixWorld.elements);
    if (sig[48] !== this.viewHeight) {
      sig[48] = this.viewHeight;
      dirty = true;
    }
    return dirty || this.frame === 0;
  }

  private cameraLod(camera: THREE.Camera): CameraLod {
    const p = camera.projectionMatrix.elements;
    const perspective = p[15] === 0;
    const pixelsPerMetre = (this.viewHeight / 2) * Math.abs(p[5]!);
    const numerator = (GRASS_SCREEN_DENSITY * pixelsPerMetre * pixelsPerMetre) / this.bake.bladesPerM2;
    const reach = (this.bake.maxHeight * pixelsPerMetre) / MIN_BLADE_PIXELS;
    return {
      perspective,
      pixelsPerMetre,
      shareNumerator: numerator,
      orthoShare: perspective ? 1 : this.bake.maxHeight * pixelsPerMetre < MIN_BLADE_PIXELS ? 0 : Math.min(1, numerator),
      reach,
    };
  }

  private nodeWorldBox(level: number, ix: number, iz: number): THREE.Box3 {
    const [x0, z0, x1, z1] = grassNodeRect(this.bake, level, ix, iz);
    const key = `${level}:${ix}:${iz}`;
    let range = this.heights.get(key);
    if (range === undefined) {
      let lo = Infinity, hi = -Infinity;
      for (const fx of [0, 0.5, 1]) {
        for (const fz of [0, 0.5, 1]) {
          const h = this.bake.heightAt(x0 + (x1 - x0) * fx, z0 + (z1 - z0) * fz);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
      }
      const slack = (x1 - x0) * 0.1;
      range = [lo - slack, hi + slack + this.bake.maxHeight];
      if (this.heights.size > 8192) this.heights.clear();
      this.heights.set(key, range);
    }
    this.box.min.set(x0, range[0], z0);
    this.box.max.set(x1, range[1], z1);
    return this.box.applyMatrix4(this.group.matrixWorld);
  }

  private ancestor(level: number, ix: number, iz: number): Leaf | undefined {
    for (let l = level + 1, x = ix >> 1, z = iz >> 1; l <= this.bake.rootLevel; l += 1, x >>= 1, z >>= 1) {
      const leaf = this.cache.get(`${l}:${x}:${z}`);
      if (leaf !== undefined) return leaf;
    }
    return undefined;
  }

  private bakeLeaf(key: string, level: number, ix: number, iz: number, share: number): Leaf {
    const tufts = bakeGrassNode(this.bake, level, ix, iz, share);
    const t = this.template;
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(t.position, 3));
    geometry.setAttribute("grassUv", new THREE.BufferAttribute(t.uv, 2));
    geometry.setAttribute("bladeOffset", new THREE.BufferAttribute(t.bladeOffset, 2));
    geometry.setAttribute("bladeVary", new THREE.BufferAttribute(t.bladeVary, 4));
    geometry.setAttribute("bladeBendScale", new THREE.BufferAttribute(t.bladeBendScale, 1));
    geometry.setIndex(new THREE.BufferAttribute(t.index, 1));
    geometry.setAttribute("instanceOffset", new THREE.InstancedBufferAttribute(tufts.offsets, 3));
    geometry.setAttribute("instanceShape", new THREE.InstancedBufferAttribute(tufts.shape, 4));
    geometry.setAttribute("instanceVary", new THREE.InstancedBufferAttribute(tufts.vary, 4));
    geometry.setAttribute("instanceTone", new THREE.InstancedBufferAttribute(tufts.tone, 1));
    geometry.instanceCount = tufts.count;
    const bounds = tufts.count === 0 ? new THREE.Box3() : tufts.roots.clone().expandByScalar(tufts.extent * t.heightScale + this.handle.windReach);
    geometry.boundingBox = bounds;
    geometry.boundingSphere = bounds.isEmpty() ? new THREE.Sphere() : bounds.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geometry, this.handle.material);
    mesh.castShadow = this.options.castShadow ?? false;
    mesh.receiveShadow = this.options.receiveShadow ?? true;
    mesh.frustumCulled = this.options.frustumCulled ?? true;
    mesh.matrixAutoUpdate = false;
    const roots = new THREE.Box3();
    const position = new THREE.Vector3();
    mesh.onBeforeRender = (_renderer, _scene, camera) => {
      const lod = this.cameraLod(camera);
      camera.getWorldPosition(position);
      const distance = roots.copy(tufts.roots).applyMatrix4(mesh.matrixWorld).distanceToPoint(position);
      const share = shareAt(lod, distance);
      geometry.instanceCount = share <= 0 ? 0 : grassTuftsBelow(tufts.ranks, share);
      const pixels = lod.perspective ? (this.bake.maxHeight * lod.pixelsPerMetre) / Math.max(distance, 0.01) : this.bake.maxHeight * lod.pixelsPerMetre;
      const detail = t.lods[pixels >= 28 ? 0 : pixels >= 9 ? Math.min(1, t.lods.length - 1) : t.lods.length - 1]!;
      geometry.setDrawRange(detail.start, detail.count);
      this.handle.uniforms.uLod.value.set(lod.shareNumerator, lod.perspective ? 1 : 0, lod.reach, lod.orthoShare);
    };
    mesh.onBeforeShadow = () => {
      geometry.instanceCount = tufts.count;
      const detail = t.lods[Math.min(1, t.lods.length - 1)]!;
      geometry.setDrawRange(detail.start, detail.count);
    };
    const leaf: Leaf = { key, level, ix, iz, share, tufts, geometry, mesh, bounds, used: this.frame };
    this.cache.set(key, leaf);
    return leaf;
  }

  private drop(leaf: Leaf): void {
    this.group.remove(leaf.mesh);
    leaf.geometry.dispose();
    this.cache.delete(leaf.key);
  }

  private evict(): void {
    const keep = Math.max(32, this.drawn.length);
    if (this.cache.size <= this.drawn.length + keep) return;
    const idle = [...this.cache.values()].filter((leaf) => leaf.used !== this.frame).sort((a, b) => a.used - b.used);
    for (const leaf of idle.slice(0, this.cache.size - this.drawn.length - keep)) this.drop(leaf);
  }
}

function shareAt(lod: CameraLod, distance: number): number {
  if (!lod.perspective) return lod.orthoShare;
  if (distance > lod.reach) return 0;
  return Math.min(1, lod.shareNumerator / Math.max(distance * distance, 1e-4));
}

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
