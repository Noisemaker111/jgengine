import * as THREE from "three";
import { frameWorkObserver } from "@jgengine/core/devtools/frameBreakdown";

import {
  bakeGrassNodeSteps,
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
  growing: GrowingGrassAttribute[];
}
interface DesiredNode { level: number; ix: number; iz: number; share: number; distance: number }

/**
 * One number per quadtree node: under 64 levels and 2^23 columns and rows (a patch 8 million cells
 * across), so the key stays under 2^52 and exact.
 */
function nodeKey(level: number, ix: number, iz: number): number {
  return (level * 8388608 + ix) * 8388608 + iz;
}

/** The tuft template's per-vertex attributes, which every leaf shares. */
const TEMPLATE_ATTRIBUTES = ["position", "grassUv", "bladeOffset", "bladeVary", "bladeBend"] as const;

/**
 * Free a leaf's own GPU buffers and none of the shared template's: three's geometry dispose deletes
 * the buffer of every attribute the geometry still holds, which would pull the tuft out from under
 * every other leaf. @internal
 */
export function releaseLeafGeometry(geometry: THREE.BufferGeometry): void {
  for (const name of TEMPLATE_ATTRIBUTES) geometry.deleteAttribute(name);
  geometry.setIndex(null);
  geometry.dispose();
}

class GrowingGrassAttribute extends THREE.InstancedBufferAttribute {
  override count = 0;

  constructor(array: Float32Array, itemSize: number, count: number) {
    super(array, itemSize);
    this.count = count;
    this.setUsage(THREE.DynamicDrawUsage);
  }

  grow(count: number): void {
    this.count = count;
    this.needsUpdate = true;
  }
}

/** Per-frame bookkeeping the stream reports, for tests and devtools. */
export interface GrassStreamStats {
  /** Leaves drawn this frame. */
  leaves: number;
  /** Tufts resident in drawn leaves. */
  tufts: number;
  /** Leaves held in the cache, drawn or not. */
  cached: number;
  /** Nonzero while selection, baking or a newer view remains unfinished. */
  pending: number;
}

/** Options for {@link GrassStream}. */
export interface GrassStreamOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
  frustumCulled?: boolean;
  /** Revision of the ground sampler; omit for an immutable sampler. */
  heightRevision?: () => number | undefined;
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
  /**
   * Holds the tuft template's attributes, shared by every leaf. Each leaf once wrapped the template
   * arrays in its own attributes, so three uploaded a full copy per leaf; at realism 1 the template is
   * several times larger and the extra uploads cost fernwild 14% of its frame (Nov 2026).
   */
  private readonly templateGeometry: THREE.BufferGeometry;
  private readonly cache = new Map<string, Leaf>();
  /** Each node's ground height range, by {@link nodeKey}. */
  private readonly heights = new Map<number, [number, number]>();
  private readonly rect: [number, number, number, number] = [0, 0, 0, 0];
  private drawn: Leaf[] = [];
  private frame = 0;
  private pending = 0;
  private job: Generator<"selection" | "work" | "tuft" | "seed", void> | undefined;
  private refresh = false;
  private revision: number | undefined;
  private invalidating = false;
  private filledView = false;
  private preview: Leaf | undefined;
  private lastSelection: DesiredNode[] | undefined;
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
    const t = this.template;
    this.templateGeometry = new THREE.BufferGeometry();
    this.templateGeometry.setAttribute("position", new THREE.BufferAttribute(t.position, 3));
    this.templateGeometry.setAttribute("grassUv", new THREE.BufferAttribute(t.uv, 2));
    this.templateGeometry.setAttribute("bladeOffset", new THREE.BufferAttribute(t.bladeOffset, 2));
    this.templateGeometry.setAttribute("bladeVary", new THREE.BufferAttribute(t.bladeVary, 4));
    this.templateGeometry.setAttribute("bladeBend", new THREE.BufferAttribute(t.bladeBend, 2));
    this.templateGeometry.setIndex(new THREE.BufferAttribute(t.index, 1));
    this.group.name = "grass-stream";
    this.revision = options.heightRevision?.();
  }

  /**
   * Re-select and bake leaves for `camera`. `viewHeight` is the canvas height in CSS pixels;
   * `budgetMs` limits work time between bounded steps (`Infinity` finishes the work now). A finite
   * call performs at most 8,192 ground samples and 32,768 incremental steps, excluding work inside
   * caller-supplied samplers. A cached perspective turn examines at most 32,768 selected and
   * previously drawn leaves before updating their scene membership.
   */
  update(camera: THREE.Camera, viewHeight: number, budgetMs: number): void {
    const observe = frameWorkObserver();
    this.group.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    this.viewHeight = Math.max(1, viewHeight);
    const revision = this.options.heightRevision?.();
    if (revision !== this.revision) {
      this.revision = revision;
      this.job?.return();
      this.job = undefined;
      this.heights.clear();
      this.lastSelection = undefined;
      this.drawn = [];
      this.group.visible = false;
      this.invalidating = true;
      this.refresh = true;
      this.filledView = false;
    }
    const turnOnly = this.job === undefined && !this.refresh && this.lastSelection !== undefined &&
      camera.projectionMatrix.elements[15] === 0 && this.samePositionAndProjection(camera);
    const changed = this.changed(camera);
    if (changed && turnOnly && this.lastSelection !== undefined && this.lastSelection.length + this.drawn.length <= 32768) {
      this.redrawCached(camera, this.lastSelection);
      observe?.("grass view or transform changed", 1);
      return;
    }
    if (changed) this.refresh = true;
    if (this.job === undefined && !this.refresh) { observe?.("grass unchanged updates", 1); return; }
    if (this.job === undefined) {
      this.refresh = false;
      this.job = this.runJob(camera, budgetMs === Infinity);
    }
    observe?.(changed ? "grass view or transform changed" : "grass pending bake", 1);
    const started = now();
    let steps = 0, selections = 0, tufts = 0, polls = 0;
    while (this.job !== undefined) {
      const step = this.job.next();
      if (step.done) {
        this.job = undefined;
        this.pending = 0;
        break;
      }
      steps += 1;
      polls += 1;
      if (step.value === "selection") selections += 1;
      if (step.value === "tuft") tufts += 1;
      if (step.value === "seed") { selections += 1; tufts += 1; steps += 1; }
      const tuftQueries = this.bake.look.growth.slopeThin > 0 ? 5 : 1;
      // Steps are cheap enough that reading the clock on each one was a visible share of the frame.
      if (budgetMs !== Infinity && (selections * 9 + tufts * tuftQueries >= 8184 || steps >= 32768 || (polls % 32 === 1 && now() - started >= budgetMs))) break;
    }
    this.syncPreview();
    observe?.("grass bake tuft candidates", tufts);
    observe?.("grass other work steps", Math.max(0, steps - selections - tufts));
    if (this.job !== undefined || this.refresh) this.pending = Math.max(1, this.pending);
  }

  private samePositionAndProjection(camera: THREE.Camera): boolean {
    const sig = this.signature;
    const world = camera.matrixWorld.elements;
    for (let i = 12; i < 16; i += 1) if (Math.abs(sig[i]! - world[i]!) > 0.1) return false;
    for (let i = 0; i < 16; i += 1) {
      if (Math.abs(sig[16 + i]! - camera.projectionMatrix.elements[i]!) > 1e-4 ||
          Math.abs(sig[32 + i]! - this.group.matrixWorld.elements[i]!) > 1e-4) return false;
    }
    return sig[48] === this.viewHeight;
  }

  private redrawCached(camera: THREE.Camera, desired: DesiredNode[]): void {
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix, camera.coordinateSystem);
    const next = new Set<Leaf>();
    for (const node of desired) {
      const leaf = this.cache.get(`${node.level}:${node.ix}:${node.iz}`);
      if (leaf !== undefined && leaf.tufts.count > 0 && this.frustum.intersectsSphere(this.sphere.copy(leaf.geometry.boundingSphere!).applyMatrix4(this.group.matrixWorld))) next.add(leaf);
    }
    for (const leaf of this.drawn) if (!next.has(leaf)) this.group.remove(leaf.mesh);
    for (const leaf of next) if (leaf.mesh.parent !== this.group) this.group.add(leaf.mesh);
    this.drawn = [...next];
  }

  private *runJob(camera: THREE.Camera, immediate: boolean): Generator<"selection" | "work" | "tuft" | "seed", void> {
    if (this.invalidating) {
      for (const leaf of this.cache.values()) { this.drop(leaf); yield "work"; }
      this.invalidating = false;
      this.group.visible = true;
    }
    if (!immediate && this.cache.size === 0 && camera.projectionMatrix.elements[15] === 0) {
      yield* this.startNearestLeaf(camera);
    }
    yield* this.selectAndBake(camera, immediate);
  }

  private *startNearestLeaf(camera: THREE.Camera): Generator<"selection" | "work" | "tuft" | "seed", void> {
    camera.getWorldPosition(this.cameraPosition);
    const local = this.group.worldToLocal(this.cameraPosition.clone());
    const ix = Math.max(0, Math.min(this.bake.columns - 1, Math.floor((local.x + this.bake.width / 2) / GRASS_CELL_SIZE)));
    const iz = Math.max(0, Math.min(this.bake.rows - 1, Math.floor((local.z + this.bake.depth / 2) / GRASS_CELL_SIZE)));
    const key = `0:${ix}:${iz}`;
    const observe = frameWorkObserver();
    if (observe != null && !this.heights.has(nodeKey(0, ix, iz))) observe("grass selection height queries", 9);
    observe?.("grass nodes visited", 1);
    const box = this.nodeWorldBox(0, ix, iz);
    const distance = box.distanceToPoint(this.cameraPosition);
    const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    const lod = this.cameraLod(camera);
    if (distance > lod.reach || (this.bake.rootLevel > 0 && distance >= SPLIT * size)) { yield "selection"; return; }
    const share = Math.min(1, shareAt(lod, distance) * BAKE_HEADROOM);
    const job = bakeGrassNodeSteps(this.bake, 0, ix, iz, share, false, (tufts) => {
      if (this.preview === undefined) {
        this.preview = this.bakeLeaf(key, 0, ix, iz, share, tufts, false);
        this.group.add(this.preview.mesh);
      }
    });
    try {
      let step = job.next();
      if (!step.done) step = job.next();
      yield "seed";
      while (!step.done) { step = job.next(); if (!step.done) yield step.value; }
      this.clearPreview();
      const leaf = this.bakeLeaf(key, 0, ix, iz, share, step.value);
      this.group.add(leaf.mesh);
      this.drawn.push(leaf);
      frameWorkObserver()?.("grass leaves baked", 1);
      frameWorkObserver()?.("grass tufts baked", leaf.tufts.count);
    } finally {
      this.clearPreview();
    }
  }

  private clearPreview(): void {
    if (this.preview === undefined) return;
    this.group.remove(this.preview.mesh);
    releaseLeafGeometry(this.preview.geometry);
    this.preview = undefined;
  }

  private syncPreview(): void {
    const leaf = this.preview;
    if (leaf === undefined) return;
    const { geometry, tufts } = leaf;
    for (const attribute of leaf.growing) attribute.grow(tufts.count);
    geometry.instanceCount = tufts.count;
    const bounds = tufts.roots.clone().expandByScalar(tufts.extent * this.template.heightScale + this.handle.windReach);
    geometry.boundingBox = bounds;
    geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
  }

  private *selectAndBake(camera: THREE.Camera, immediate: boolean): Generator<"selection" | "work" | "tuft", void> {
    this.frame += 1;
    const lod = this.cameraLod(camera);
    camera.getWorldPosition(this.cameraPosition);
    const desired: DesiredNode[] = [];
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix, camera.coordinateSystem);
    // Depth first, children in z-then-x order, from an explicit stack: the same nodes, yields and
    // `desired` order a recursive walk gives, but each yield leaves one generator, not one per level.
    const stack: number[] = [this.bake.rootLevel, 0, 0];
    while (stack.length > 0) {
      const iz = stack.pop()!, ix = stack.pop()!, level = stack.pop()!;
      const observe = frameWorkObserver();
      if (observe != null && !this.heights.has(nodeKey(level, ix, iz))) observe("grass selection height queries", 9);
      observe?.("grass nodes visited", 1);
      const box = this.nodeWorldBox(level, ix, iz);
      yield "selection";
      if (!lod.perspective && !this.frustum.intersectsBox(box)) continue;
      const distance = box.distanceToPoint(this.cameraPosition);
      if (lod.perspective && distance > lod.reach) continue;
      const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      const split = lod.perspective ? distance < SPLIT * size : size > GRASS_CELL_SIZE * 4 * SPLIT;
      if (level > 0 && split) {
        const span = 2 ** (level - 1);
        // Pushed last child first, so the first child is visited next.
        for (let child = 3; child >= 0; child -= 1) {
          const cx = ix * 2 + (child & 1), cz = iz * 2 + (child >> 1);
          if (cx * span < this.bake.columns && cz * span < this.bake.rows) stack.push(level - 1, cx, cz);
        }
        continue;
      }
      desired.push({ level, ix, iz, share: shareAt(lod, distance), distance });
    }
    // Merge incrementally so a large visible selection cannot monopolize a frame.
    let ordered = desired;
    let scratch = new Array<DesiredNode>(desired.length);
    for (let width = 1; width < desired.length; width *= 2) {
      for (let start = 0; start < desired.length; start += width * 2) {
        const middle = Math.min(start + width, desired.length), end = Math.min(start + width * 2, desired.length);
        let left = start, right = middle;
        for (let i = start; i < end; i += 1) {
          if (right >= end || (left < middle && ordered[left]!.distance <= ordered[right]!.distance)) scratch[i] = ordered[left++]!;
          else scratch[i] = ordered[right++]!;
          yield "work";
        }
      }
      [ordered, scratch] = [scratch, ordered];
    }

    const next = new Set<Leaf>();
    let pending = 0;
    for (const node of ordered) {
      const key = `${node.level}:${node.ix}:${node.iz}`;
      let leaf = this.cache.get(key);
      let baked = false;
      if (node.share <= 0) continue;
      if (leaf === undefined || leaf.share < node.share) {
        {
          const share = Math.min(1, node.share * BAKE_HEADROOM);
          // A leaf baked thinner for a farther camera keeps its tufts; only the new ones are grown.
          const job = bakeGrassNodeSteps(this.bake, node.level, node.ix, node.iz, share, immediate, undefined, leaf?.tufts);
          let step = job.next();
          while (!step.done) { yield step.value; step = job.next(); }
          if (leaf !== undefined) this.drop(leaf);
          leaf = this.bakeLeaf(key, node.level, node.ix, node.iz, share, step.value);
          baked = true;
          frameWorkObserver()?.("grass leaves baked", 1);
          frameWorkObserver()?.("grass tufts baked", leaf.tufts.count);
        }
      }
      if (leaf === undefined) continue;
      leaf.used = this.frame;
      this.cache.delete(leaf.key);
      this.cache.set(leaf.key, leaf);
      // Every leaf around the camera stays baked, so turning never waits on a bake; only the ones in
      // view join the scene graph, which keeps node count and per-draw culling to what is on screen.
      if (leaf.tufts.count > 0 && this.frustum.intersectsSphere(this.sphere.copy(leaf.geometry.boundingSphere!).applyMatrix4(this.group.matrixWorld))) {
        next.add(leaf);
        if (leaf.mesh.parent !== this.group) {
          this.group.add(leaf.mesh);
          this.drawn.push(leaf);
        }
      }
      yield "work";
      if (baked && this.refresh) {
        const limit = Math.max(32, ordered.length) * 2;
        for (const old of this.cache.values()) {
          if (this.cache.size <= limit) break;
          if (old.used !== this.frame) this.drop(old);
          yield "work";
        }
        const held: Leaf[] = [];
        for (const old of this.drawn) {
          if (this.cache.get(old.key) === old && old.mesh.parent === this.group) held.push(old);
          yield "work";
        }
        this.drawn = held;
        return;
      }
    }
    for (const leaf of this.drawn) { if (!next.has(leaf)) this.group.remove(leaf.mesh); yield "work"; }
    const selectedLeaves: Leaf[] = [];
    for (const leaf of next) {
      if (leaf.mesh.parent !== this.group) this.group.add(leaf.mesh);
      selectedLeaves.push(leaf);
      yield "work";
    }
    this.drawn = selectedLeaves;
    this.pending = pending;
    yield* this.evict();
    this.lastSelection = ordered;
    this.filledView = true;
    frameWorkObserver()?.("grass leaves pending", pending);
  }

  /**
   * Whether one selection has finished with every leaf it chose baked since the stream started or
   * the ground changed. Until then a caller can spend a larger slice so the first view fills fast;
   * after it, a moving camera only adds the few leaves that come into range.
   */
  get filled(): boolean {
    return this.filledView;
  }

  /** Whether selection or baking is unfinished after the last {@link GrassStream.update}. */
  get busy(): boolean {
    return this.job !== undefined || this.refresh;
  }

  /** What the stream holds and draws now. */
  stats(): GrassStreamStats {
    return {
      leaves: this.drawn.length + (this.preview === undefined ? 0 : 1),
      tufts: this.drawn.reduce((sum, leaf) => sum + leaf.tufts.count, 0) + (this.preview?.tufts.count ?? 0),
      cached: this.cache.size,
      pending: this.pending,
    };
  }

  /** Free every leaf's GPU buffers. */
  dispose(): void {
    this.job?.return();
    this.job = undefined;
    // A remounted patch (StrictMode effects) reuses its stream: the next update rebuilds it.
    this.refresh = true;
    this.lastSelection = undefined;
    this.pending = 0;
    this.filledView = false;
    for (const leaf of this.cache.values()) this.drop(leaf);
    this.drawn = [];
    // Frees the shared tuft buffers last, once no leaf points at them; a reused stream uploads them again.
    this.templateGeometry.dispose();
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
    const rect = grassNodeRect(this.bake, level, ix, iz, this.rect);
    const x0 = rect[0], z0 = rect[1], x1 = rect[2], z1 = rect[3];
    const key = nodeKey(level, ix, iz);
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

  private bakeLeaf(key: string, level: number, ix: number, iz: number, share: number, tufts: GrassTufts, cache = true): Leaf {
    const t = this.template;
    const geometry = new THREE.InstancedBufferGeometry();
    // The same attribute objects for every leaf, so the GPU holds one copy of the tuft (see `templateGeometry`).
    for (const name of TEMPLATE_ATTRIBUTES) geometry.setAttribute(name, this.templateGeometry.getAttribute(name));
    geometry.setIndex(this.templateGeometry.index);
    const growing: GrowingGrassAttribute[] = [];
    const instanceAttribute = (array: Float32Array, size: number): THREE.InstancedBufferAttribute => {
      if (cache) return new THREE.InstancedBufferAttribute(array, size);
      const attribute = new GrowingGrassAttribute(array, size, tufts.count);
      growing.push(attribute);
      return attribute;
    };
    geometry.setAttribute("instanceOffset", instanceAttribute(tufts.offsets, 3));
    geometry.setAttribute("instanceShape", instanceAttribute(tufts.shape, 4));
    geometry.setAttribute("instanceVary", instanceAttribute(tufts.vary, 4));
    geometry.setAttribute("instanceTone", instanceAttribute(tufts.tone, 1));
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
      geometry.instanceCount = share <= 0 ? 0 : grassTuftsBelow(tufts.ranks.length === tufts.count ? tufts.ranks : tufts.ranks.subarray(0, tufts.count), share);
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
    const leaf: Leaf = { key, level, ix, iz, share, tufts, geometry, mesh, bounds, used: this.frame, growing };
    if (cache) this.cache.set(key, leaf);
    return leaf;
  }

  private drop(leaf: Leaf): void {
    this.group.remove(leaf.mesh);
    releaseLeafGeometry(leaf.geometry);
    this.cache.delete(leaf.key);
  }

  private *evict(): Generator<"work", void> {
    const keep = Math.max(32, this.drawn.length);
    if (this.cache.size <= this.drawn.length + keep) return;
    for (const leaf of this.cache.values()) {
      if (this.cache.size <= this.drawn.length + keep) break;
      if (leaf.used !== this.frame) this.drop(leaf);
      yield "work";
    }
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
