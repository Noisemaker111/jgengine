import * as THREE from "three";

import { isStableShadowDepth } from "./shadowCasters.draw";
import {
  createShadowLayerState,
  dropShadowLayer,
  sameShadowKey,
  shadowPassMayCache,
  planShadowPass,
  recordShadowPass,
  type ShadowLayerState,
  type ShadowPassPlan,
} from "./shadowCache";

/** A caster unchanged for this long joins its lights' static layers. @internal */
export const SHADOW_STATIC_AFTER_MS = 1000;
/** Settled casters join the layer at most this often, so casters settling one by one cost one rebuild a second. */
const PROMOTION_INTERVAL_MS = 1000;
/** A light not asked for a pass in this many frames gives its layer back. */
const LIGHT_RETIRE_FRAMES = 240;

type Drawable = THREE.Mesh | THREE.Line | THREE.Points;

/** What one shared material or geometry reads like to a depth pass, and the stamp that moves when that changes. */
interface SharedRecord {
  parts: unknown[];
  stamp: number;
  /** The check that last described it; a record is described at most once per check. */
  pass: number;
}

/** What kind of drawable a caster is, read once: it never changes for an object. */
const enum CasterKind {
  Plain,
  Instanced,
  Batched,
}

class CasterEntry {
  readonly kind: CasterKind;
  /** What a depth pass reads from the caster, as of its last change (see {@link describeCaster}). */
  snapshot: unknown[] = [];
  /** World bounding sphere as of the snapshot; null when three never culls the caster. */
  sphere: THREE.Sphere | null = null;
  /** Reached by the last check (visible through its ancestors) and casting. */
  drawable = false;
  changedAt = 0;
  /** Drawn into the static layers instead of every frame. */
  isStatic = false;
  /** Its depth can change with nothing the snapshot sees (skinning, morphs, custom depth shaders). */
  alwaysDynamic = false;
  /** The check that last reached it. */
  seen = -1;
  geometry: THREE.BufferGeometry | null = null;
  geometryRecord: SharedRecord | null = null;
  material: THREE.Material | THREE.Material[] | null = null;
  materialRecords: SharedRecord[] = [];

  constructor(
    readonly object: Drawable,
    /** Reads `_visibilityChanged` writes on a `BatchedMesh`. */
    readonly batchEdits: { count: number; release: () => void } | null,
  ) {
    const mesh = object as Partial<THREE.InstancedMesh & THREE.BatchedMesh>;
    this.kind = mesh.isInstancedMesh === true ? CasterKind.Instanced : mesh.isBatchedMesh === true ? CasterKind.Batched : CasterKind.Plain;
  }
}

/** What the cache did, for the devtools probe and perf scripts. @internal */
export interface ShadowCacheStats {
  enabled: boolean;
  casters: number;
  staticCasters: number;
  /** Casters that changed recently enough to still draw every pass instead of joining a layer. */
  dynamicCasters: number;
  /** Of those, the ones whose depth can never be cached (skinned, morphing, unstable depth). */
  alwaysDynamicCasters: number;
  /** Caster checks run: one per shadow pass of the cache's scene that may serve a light from its layer. */
  checks: number;
  /** Shadow passes the renderer asked for, cached or not. */
  invocations: number;
  /**
   * Milliseconds spent in the renderer's shadow step since the last reset, the cache's own checks
   * included; with the cache off it is three's step alone, so the two compare directly.
   */
  cpuMs: number;
  passes: Record<ShadowPassPlan, number>;
  audit: {
    on: boolean;
    maps: number;
    mismatchedMaps: number;
    mismatchedTexels: number;
    /** Comparisons that did not run (the comparison shader wrote nothing, or its program would not link). */
    failed: number;
    /**
     * Cached passes left uncompared because {@link AUDIT_PENDING_MAX} comparisons were still waiting on
     * their readback: the audit samples rather than queueing without bound (WebGPU's readbacks land
     * several frames late). Nothing was compared, so they prove nothing either way.
     */
    skipped: number;
  };
}

/** The page handle perf and audit scripts drive (`window.__jgShadowCache`). @internal */
export interface ShadowCacheHandle {
  stats(): ShadowCacheStats;
  /** Off draws every caster every pass, as three does; turning it back on starts every light over. */
  setEnabled(on: boolean): void;
  /** On: after every cached pass, also draw the full map and count texels whose depth bits differ. */
  setAudit(on: boolean): void;
  resetStats(): void;
}

declare global {
  interface Window {
    __jgShadowCache?: ShadowCacheHandle;
  }
}

/** Renderer surface the cache drives; a WebGLRenderer satisfies it. @internal */
export interface ShadowCacheRenderer {
  shadowMap: { enabled: boolean; autoUpdate: boolean; needsUpdate: boolean; type: THREE.ShadowMapType; render: (lights: THREE.Light[], scene: THREE.Scene, camera: THREE.Camera) => void };
  clear: (...args: never[]) => void;
  setRenderTarget: (target: THREE.WebGLRenderTarget | null, activeCubeFace?: number, activeMipmapLevel?: number) => void;
  copyTextureToTexture: (src: THREE.Texture, dst: THREE.Texture) => void;
  clippingPlanes: readonly THREE.Plane[];
  state: { buffers: { depth: { getReversed(): boolean } } };
}

const BASE_ON_BEFORE_SHADOW = THREE.Object3D.prototype.onBeforeShadow;
const BATCHED_ON_BEFORE_SHADOW = THREE.BatchedMesh.prototype.onBeforeShadow;

const NO_CHILDREN: THREE.Object3D[] = [];

let nextTargetId = 1;
const targetIds = new WeakMap<object, number>();
function targetId(target: object): number {
  let id = targetIds.get(target);
  if (id === undefined) {
    id = nextTargetId;
    nextTargetId += 1;
    targetIds.set(target, id);
  }
  return id;
}

function isDrawable(node: THREE.Object3D): node is Drawable {
  const drawable = node as Partial<THREE.Mesh & THREE.Line & THREE.Points>;
  return drawable.isMesh === true || drawable.isLine === true || drawable.isPoints === true;
}

function hasClipping(material: THREE.Material): boolean {
  return Array.isArray(material.clippingPlanes) && material.clippingPlanes.length > 0;
}

/** Casters whose depth the snapshot cannot vouch for: they draw every pass. */
function alwaysDynamic(object: Drawable): boolean {
  const mesh = object as THREE.Mesh & Partial<THREE.SkinnedMesh & THREE.InstancedMesh & THREE.BatchedMesh>;
  if (mesh.isMesh !== true) return true;
  if (mesh.isSkinnedMesh === true) return true;
  if (mesh.geometry?.morphAttributes?.["position"] !== undefined) return true;
  if (mesh.isInstancedMesh === true && mesh.morphTexture !== null && mesh.morphTexture !== undefined) return true;
  if (mesh.customDepthMaterial !== undefined && !isStableShadowDepth(mesh.customDepthMaterial)) return true;
  const hook = mesh.onBeforeShadow;
  if (hook !== BASE_ON_BEFORE_SHADOW && !(mesh.isBatchedMesh === true && hook === BATCHED_ON_BEFORE_SHADOW)) return true;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some(hasClipping);
}

function putTexture(out: unknown[], at: number, texture: THREE.Texture | null | undefined): number {
  if (texture === null || texture === undefined) {
    out[at] = null;
    return at + 1;
  }
  out[at] = texture;
  out[at + 1] = texture.version;
  out[at + 2] = texture.channel;
  out[at + 3] = texture.matrixAutoUpdate;
  out[at + 4] = texture.offset.x;
  out[at + 5] = texture.offset.y;
  out[at + 6] = texture.repeat.x;
  out[at + 7] = texture.repeat.y;
  out[at + 8] = texture.rotation;
  out[at + 9] = texture.center.x;
  out[at + 10] = texture.center.y;
  let next = at + 11;
  if (!texture.matrixAutoUpdate) for (const value of texture.matrix.elements) out[next++] = value;
  return next;
}

/** Everything three copies from a caster's material into its depth material (WebGLShadowMap.getDepthMaterial). */
function putMaterial(out: unknown[], at: number, material: THREE.Material): number {
  const m = material as THREE.Material & Partial<THREE.MeshStandardMaterial>;
  out[at] = material;
  out[at + 1] = material.version;
  out[at + 2] = material.visible;
  out[at + 3] = material.side;
  out[at + 4] = material.shadowSide;
  out[at + 5] = material.alphaTest;
  out[at + 6] = material.alphaToCoverage;
  out[at + 7] = m.wireframe;
  out[at + 8] = material.clipShadows;
  let next = at + 9;
  if (material.alphaTest > 0 || material.alphaToCoverage) {
    next = putTexture(out, next, m.map);
    next = putTexture(out, next, m.alphaMap);
  }
  const displacement = m.displacementMap;
  if (displacement !== null && displacement !== undefined && m.displacementScale !== 0) {
    next = putTexture(out, next, displacement);
    out[next++] = m.displacementScale;
    out[next++] = m.displacementBias;
  }
  return next;
}

function putSphere(out: unknown[], at: number, sphere: THREE.Sphere | null | undefined): number {
  if (sphere === null || sphere === undefined) {
    out[at] = null;
    return at + 1;
  }
  out[at] = sphere;
  out[at + 1] = sphere.center.x;
  out[at + 2] = sphere.center.y;
  out[at + 3] = sphere.center.z;
  out[at + 4] = sphere.radius;
  return at + 5;
}

/** What a depth draw reads from a geometry: index, draw range, attribute buffers, culling bounds, groups. */
function putGeometry(out: unknown[], at: number, geometry: THREE.BufferGeometry): number {
  const index = geometry.index;
  out[at++] = index;
  if (index !== null) out[at++] = index.version;
  out[at++] = geometry.drawRange.start;
  out[at++] = geometry.drawRange.count;
  const attributes = geometry.attributes;
  for (const name in attributes) {
    const attribute = attributes[name]!;
    out[at++] = attribute;
    out[at++] = (attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute === true
      ? (attribute as THREE.InterleavedBufferAttribute).data.version
      : (attribute as THREE.BufferAttribute).version;
  }
  at = putSphere(out, at, geometry.boundingSphere);
  out[at++] = geometry.groups.length;
  for (const group of geometry.groups) {
    out[at++] = group.start;
    out[at++] = group.count;
    out[at++] = group.materialIndex;
  }
  return at;
}

function sameDescription(snapshot: readonly unknown[], scratch: readonly unknown[], length: number): boolean {
  if (snapshot.length !== length) return false;
  for (let index = 0; index < length; index += 1) if (snapshot[index] !== scratch[index]) return false;
  return true;
}

let nextStamp = 1;

/**
 * Stamps for what many casters share (a material, a geometry): each is described once per check
 * however many casters use it, and its stamp moves only when that description changes. A caster
 * keeps its record, so a check reads the stamp off it without a lookup.
 */
class SharedStamps<T extends object> {
  private readonly records = new WeakMap<T, SharedRecord>();
  private readonly scratch: unknown[] = [];

  constructor(private readonly describe: (out: unknown[], at: number, value: T) => number) {}

  record(value: T, pass: number): SharedRecord {
    let record = this.records.get(value);
    if (record === undefined) {
      const length = this.describe(this.scratch, 0, value);
      record = { parts: this.scratch.slice(0, length), stamp: nextStamp++, pass };
      this.records.set(value, record);
    }
    return record;
  }

  stamp(value: T, record: SharedRecord, pass: number): number {
    if (record.pass === pass) return record.stamp;
    record.pass = pass;
    const length = this.describe(this.scratch, 0, value);
    if (!sameDescription(record.parts, this.scratch, length)) {
      record.parts = this.scratch.slice(0, length);
      record.stamp = nextStamp++;
    }
    return record.stamp;
  }
}

/** The shared stamps a tracker's checks read, and the number of the check running. */
interface CasterStamps {
  materials: SharedStamps<THREE.Material>;
  geometries: SharedStamps<THREE.BufferGeometry>;
  pass: number;
}

function materialStamp(entry: CasterEntry, stamps: CasterStamps, index: number, material: THREE.Material): number {
  let record = entry.materialRecords[index];
  if (record === undefined || (Array.isArray(entry.material) ? entry.material[index] : entry.material) !== material) {
    record = stamps.materials.record(material, stamps.pass);
    entry.materialRecords[index] = record;
  }
  return stamps.materials.stamp(material, record, stamps.pass);
}

/**
 * Write what a depth pass reads from a caster that the check reached (so visible through every
 * ancestor) into `out`; returns the length written. Two equal descriptions draw the same depth:
 * casting, culling, layers, transform, instance buffers, and the stamps of its geometry and
 * materials (what three reads from each, described once per check however many casters share it).
 */
function describeCaster(entry: CasterEntry, out: unknown[], stamps: CasterStamps): number {
  const object = entry.object;
  const mesh = object as THREE.Mesh & Partial<THREE.InstancedMesh & THREE.BatchedMesh>;
  out[0] = object.castShadow;
  out[1] = object.frustumCulled;
  out[2] = object.layers.mask;
  const e = object.matrixWorld.elements;
  out[3] = e[0]; out[4] = e[1]; out[5] = e[2]; out[6] = e[3];
  out[7] = e[4]; out[8] = e[5]; out[9] = e[6]; out[10] = e[7];
  out[11] = e[8]; out[12] = e[9]; out[13] = e[10]; out[14] = e[11];
  out[15] = e[12]; out[16] = e[13]; out[17] = e[14]; out[18] = e[15];
  const geometry = object.geometry as THREE.BufferGeometry;
  if (geometry !== entry.geometry || entry.geometryRecord === null) {
    entry.geometry = geometry;
    entry.geometryRecord = stamps.geometries.record(geometry, stamps.pass);
  }
  out[19] = geometry;
  out[20] = stamps.geometries.stamp(geometry, entry.geometryRecord, stamps.pass);
  let at = 21;
  if (entry.kind === CasterKind.Instanced) {
    out[at++] = mesh.instanceMatrix;
    out[at++] = mesh.instanceMatrix!.version;
    out[at++] = mesh.count;
    at = putSphere(out, at, mesh.boundingSphere);
  } else if (entry.kind === CasterKind.Batched) {
    const batch = object as THREE.BatchedMesh & { _matricesTexture?: THREE.DataTexture };
    out[at++] = entry.batchEdits?.count ?? 0;
    out[at++] = batch._matricesTexture?.version ?? -1;
    at = putSphere(out, at, batch.boundingSphere);
  }
  out[at++] = mesh.customDepthMaterial;
  const material = mesh.material;
  if (Array.isArray(material)) {
    out[at++] = material.length;
    for (let index = 0; index < material.length; index += 1) {
      const entryMaterial = material[index]!;
      out[at++] = entryMaterial;
      out[at++] = materialStamp(entry, stamps, index, entryMaterial);
    }
  } else {
    out[at++] = material;
    out[at++] = materialStamp(entry, stamps, 0, material);
  }
  entry.material = Array.isArray(material) ? [...material] : material;
  return at;
}

function sameSphere(snapshot: readonly unknown[], at: number, sphere: THREE.Sphere | null | undefined): number {
  if (sphere === null || sphere === undefined) return snapshot[at] === null ? at + 1 : -1;
  return snapshot[at] === sphere && snapshot[at + 1] === sphere.center.x && snapshot[at + 2] === sphere.center.y &&
    snapshot[at + 3] === sphere.center.z && snapshot[at + 4] === sphere.radius ? at + 5 : -1;
}

/**
 * Whether the caster still reads as its snapshot, field by field in {@link describeCaster}'s order,
 * stopping at the first difference: most casters stand still, and writing out a description only to
 * compare it was most of a check's cost.
 */
function unchanged(entry: CasterEntry, stamps: CasterStamps): boolean {
  const object = entry.object;
  const s = entry.snapshot;
  if (s[0] !== object.castShadow || s[1] !== object.frustumCulled || s[2] !== object.layers.mask) return false;
  const e = object.matrixWorld.elements;
  // Translation first: it is what moves most often.
  if (s[15] !== e[12] || s[16] !== e[13] || s[17] !== e[14] ||
    s[3] !== e[0] || s[4] !== e[1] || s[5] !== e[2] || s[6] !== e[3] ||
    s[7] !== e[4] || s[8] !== e[5] || s[9] !== e[6] || s[10] !== e[7] ||
    s[11] !== e[8] || s[12] !== e[9] || s[13] !== e[10] || s[14] !== e[11] || s[18] !== e[15]) return false;
  const geometry = object.geometry as THREE.BufferGeometry;
  if (s[19] !== geometry || entry.geometryRecord === null || entry.geometry !== geometry) return false;
  if (s[20] !== stamps.geometries.stamp(geometry, entry.geometryRecord, stamps.pass)) return false;
  const mesh = object as THREE.Mesh & Partial<THREE.InstancedMesh & THREE.BatchedMesh>;
  let at = 21;
  if (entry.kind === CasterKind.Instanced) {
    if (s[at] !== mesh.instanceMatrix || s[at + 1] !== mesh.instanceMatrix!.version || s[at + 2] !== mesh.count) return false;
    at = sameSphere(s, at + 3, mesh.boundingSphere);
    if (at < 0) return false;
  } else if (entry.kind === CasterKind.Batched) {
    const batch = object as THREE.BatchedMesh & { _matricesTexture?: THREE.DataTexture };
    if (s[at] !== (entry.batchEdits?.count ?? 0) || s[at + 1] !== (batch._matricesTexture?.version ?? -1)) return false;
    at = sameSphere(s, at + 2, batch.boundingSphere);
    if (at < 0) return false;
  }
  if (s[at++] !== mesh.customDepthMaterial) return false;
  const material = mesh.material;
  const records = entry.materialRecords;
  if (Array.isArray(material)) {
    const known = entry.material;
    if (s[at++] !== material.length || !Array.isArray(known) || known.length !== material.length) return false;
    for (let index = 0; index < material.length; index += 1) {
      const value = material[index]!;
      const record = records[index];
      if (s[at] !== value || known[index] !== value || record === undefined) return false;
      if (s[at + 1] !== stamps.materials.stamp(value, record, stamps.pass)) return false;
      at += 2;
    }
  } else {
    const record = records[0];
    if (s[at] !== material || entry.material !== material || record === undefined) return false;
    if (s[at + 1] !== stamps.materials.stamp(material, record, stamps.pass)) return false;
    at += 2;
  }
  return at === s.length;
}

/** The caster's world bounding sphere as three culls it; null when three never culls it. */
function worldSphere(object: Drawable, into: THREE.Sphere | null): THREE.Sphere | null {
  if (!object.frustumCulled) return null;
  const owner = object as Drawable & { boundingSphere?: THREE.Sphere | null; computeBoundingSphere?: () => void };
  let local: THREE.Sphere | null;
  if (owner.boundingSphere !== undefined) {
    if (owner.boundingSphere === null) owner.computeBoundingSphere?.();
    local = owner.boundingSphere ?? null;
  } else {
    const geometry = object.geometry as THREE.BufferGeometry;
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    local = geometry.boundingSphere;
  }
  if (local === null) return null;
  return (into ?? new THREE.Sphere()).copy(local).applyMatrix4(object.matrixWorld);
}

/** `BatchedMesh` sets `_visibilityChanged` on every instance or geometry edit; count those writes. */
function watchBatchEdits(batch: THREE.BatchedMesh): { count: number; release: () => void } {
  const target = batch as unknown as { _visibilityChanged: boolean };
  let flag = target._visibilityChanged;
  const edits = {
    count: 0,
    release: () => {
      delete (target as Partial<typeof target>)._visibilityChanged;
      target._visibilityChanged = flag;
    },
  };
  Object.defineProperty(target, "_visibilityChanged", {
    configurable: true,
    enumerable: true,
    get: () => flag,
    set: (value: boolean) => {
      if (value) edits.count += 1;
      flag = value;
    },
  });
  return edits;
}

/**
 * Every drawable in a scene, what its depth pass reads, and whether it has held still long enough to
 * live in the static layers. A check walks the scene the way three's shadow pass does, skipping
 * hidden subtrees, so its cost follows what can draw rather than everything loaded; a drawable it
 * reaches for the first time is tracked then, and one that has left the scene is dropped by the
 * once-a-second sweep. Nothing is written onto the scene's objects: a property or listener added to
 * every mesh changes the shape the engine's own hot loops see, and three's shadow pass over Fernwild's
 * 4000 meshes ran 2 ms slower on the desktop app for it.
 * @internal
 */
export class ShadowCasterTracker {
  readonly entries = new Map<THREE.Object3D, CasterEntry>();
  /** Changed casters with no changed caster above them: the dynamic pass draws these subtrees. */
  readonly dynamicRoots: THREE.Object3D[] = [];
  /** Every caster not in the static layers, drawable or not. */
  private readonly dynamic = new Set<CasterEntry>();
  /** Every changed caster that is visible and casting. */
  private readonly dynamicCasters: CasterEntry[] = [];
  /** Casters the last check reached that cast: the ones that stop drawing if a check misses them. */
  private drawn: CasterEntry[] = [];
  private nextDrawn: CasterEntry[] = [];
  private readonly scratch: unknown[] = [];
  private readonly stamps: CasterStamps = { materials: new SharedStamps(putMaterial), geometries: new SharedStamps(putGeometry), pass: 0 };
  private readonly stack: THREE.Object3D[] = [];
  private lastPromotion = Number.NEGATIVE_INFINITY;

  constructor(
    readonly scene: THREE.Object3D,
    /** Called with a static caster's old or new bounds when what it draws changed (null: unbounded). */
    private readonly touch: (sphere: THREE.Sphere | null) => void,
    private readonly now: () => number,
  ) {}

  private track(object: Drawable): CasterEntry {
    const batchEdits = (object as THREE.BatchedMesh).isBatchedMesh === true ? watchBatchEdits(object as THREE.BatchedMesh) : null;
    const entry = new CasterEntry(object, batchEdits);
    // Bounds first: a missing bounding sphere is computed here, as three's first cull would, before the snapshot reads it.
    entry.sphere = worldSphere(object, null);
    this.stamps.pass += 1;
    entry.snapshot = this.scratch.slice(0, describeCaster(entry, this.scratch, this.stamps));
    entry.changedAt = this.now();
    entry.alwaysDynamic = alwaysDynamic(object);
    this.entries.set(object, entry);
    this.dynamic.add(entry);
    return entry;
  }

  /** Drop a caster that left the scene; the check that missed it already stopped it drawing. */
  private untrack(entry: CasterEntry): void {
    this.entries.delete(entry.object);
    this.dynamic.delete(entry);
    entry.batchEdits?.release();
    if (entry.isStatic && entry.drawable) this.touch(entry.sphere);
  }

  private inScene(object: THREE.Object3D): boolean {
    let at: THREE.Object3D | null = object;
    while (at !== null && at !== this.scene) at = at.parent;
    return at !== null;
  }

  /** A caster that changed what it draws: off the static layers if it was on them, stamped now. */
  private changed(entry: CasterEntry, now: number, oldSphere: THREE.Sphere | null, wasDrawn: boolean): void {
    entry.changedAt = now;
    if (!entry.isStatic) return;
    entry.isStatic = false;
    this.dynamic.add(entry);
    if (wasDrawn) this.touch(oldSphere);
    if (entry.drawable) this.touch(entry.sphere);
  }

  /**
   * Compare every caster three's shadow pass could reach with its snapshot: a hidden subtree is
   * skipped as three skips it, and a caster that drew last check and was not reached now stopped
   * drawing. A static caster whose own description changed leaves the layer (and stales the lights it
   * reaches); one that only appeared or disappeared stays in it and stales them. Casters unchanged
   * for {@link SHADOW_STATIC_AFTER_MS} join the layer.
   */
  check(): void {
    const now = this.now();
    const scratch = this.scratch;
    const stamps = this.stamps;
    const pass = (stamps.pass += 1);
    const next = this.nextDrawn;
    next.length = 0;
    const stack = this.stack;
    stack.length = 0;
    if (this.scene.visible) stack.push(this.scene);
    for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
      const children = node.children;
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index]!;
        if (child.visible) stack.push(child);
      }
      if (!isDrawable(node)) continue;
      let entry = this.entries.get(node);
      if (entry === undefined) entry = this.track(node);
      entry.seen = pass;
      const casts = node.castShadow;
      // A mesh that casts nothing draws nothing whatever else changes; turning `castShadow` on is the change.
      if (!casts && !entry.drawable && entry.snapshot[0] === false) continue;
      if (casts) next.push(entry);
      const same = unchanged(entry, stamps);
      if (same && casts === entry.drawable) continue;
      const oldSphere = entry.sphere;
      const wasDrawn = entry.drawable;
      if (!same) {
        entry.sphere = worldSphere(entry.object, null);
        entry.snapshot = scratch.slice(0, describeCaster(entry, scratch, stamps));
        entry.alwaysDynamic = alwaysDynamic(entry.object);
      }
      entry.drawable = casts;
      if (!same) this.changed(entry, now, oldSphere, wasDrawn);
      else if (entry.isStatic) this.touch(casts ? entry.sphere : oldSphere);
      else entry.changedAt = now;
    }
    // Drawn last check, not reached now: hidden through an ancestor, or gone from the graph.
    for (const entry of this.drawn) {
      if (entry.seen === pass || !entry.drawable) continue;
      entry.drawable = false;
      if (entry.isStatic) this.touch(entry.sphere);
      else entry.changedAt = now;
    }
    this.nextDrawn = this.drawn;
    this.drawn = next;
    if (now - this.lastPromotion >= PROMOTION_INTERVAL_MS) {
      this.lastPromotion = now;
      // Not reached this check and no longer under the scene: removed, so forgotten.
      for (const entry of this.entries.values()) if (entry.seen !== pass && !this.inScene(entry.object)) this.untrack(entry);
      for (const entry of this.dynamic) {
        if (entry.alwaysDynamic || now - entry.changedAt < SHADOW_STATIC_AFTER_MS) continue;
        entry.isStatic = true;
        this.dynamic.delete(entry);
        if (entry.drawable) this.touch(entry.sphere);
      }
    }
    this.collectRoots();
  }

  private collectRoots(): void {
    const roots = this.dynamicRoots;
    const casters = this.dynamicCasters;
    roots.length = 0;
    casters.length = 0;
    for (const entry of this.dynamic) {
      if (!entry.drawable) continue;
      casters.push(entry);
      // three's pass walks every descendant of a root, so a changed caster under another is already drawn.
      let covered = false;
      for (let at = entry.object.parent; at !== null; at = at.parent) {
        const above = this.entries.get(at);
        if (above !== undefined && !above.isStatic && above.drawable) {
          covered = true;
          break;
        }
      }
      if (!covered) roots.push(entry.object);
    }
  }

  /** True when a changed caster would draw into a pass with this frustum and layer mask. */
  dynamicReaches(frustum: THREE.Frustum, layers: THREE.Layers): boolean {
    for (const entry of this.dynamicCasters) {
      const object = entry.object;
      if (!object.layers.test(layers)) continue;
      if (!object.frustumCulled || object.intersectsFrustum(frustum)) return true;
    }
    return false;
  }

  /** Turn off `castShadow` on every changed caster for a static pass; returns the restore. */
  hideDynamic(): () => void {
    const hidden: THREE.Object3D[] = [];
    for (const entry of this.dynamic) {
      if (!entry.object.castShadow) continue;
      entry.object.castShadow = false;
      hidden.push(entry.object);
    }
    return () => {
      for (const object of hidden) object.castShadow = true;
    };
  }

  staticCount(): number {
    return this.entries.size - this.dynamic.size;
  }

  dynamicCount(): number {
    return this.dynamicCasters.length;
  }

  alwaysDynamicCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) if (entry.alwaysDynamic && entry.drawable) count += 1;
    return count;
  }

  dispose(): void {
    for (const entry of this.entries.values()) entry.batchEdits?.release();
    this.entries.clear();
    this.dynamic.clear();
    this.drawn.length = 0;
    this.dynamicRoots.length = 0;
    this.dynamicCasters.length = 0;
  }
}

interface LightRecord {
  readonly state: ShadowLayerState;
  layer: THREE.WebGLRenderTarget | null;
  /** The light's frustum when its layer was drawn: what a changed caster must reach to stale it. */
  readonly frustum: THREE.Frustum;
  readonly key: number[];
  seenFrame: number;
  /** Frame token of the last pass that left this light's map correct; -1 before the first. */
  servedFrame: number;
}

interface ManagedShadow {
  map: THREE.WebGLRenderTarget;
  camera: THREE.Camera;
  mapSize: THREE.Vector2;
  autoUpdate: boolean;
  needsUpdate: boolean;
  updateMatrices(light: THREE.Light, camera?: THREE.Camera): void;
  getViewportCount(): number;
  getFrustum(): THREE.Frustum;
  getFrameExtents(): THREE.Vector2;
}

function managedShadow(light: THREE.Light): ManagedShadow | null {
  const shadow = (light as THREE.Light & { shadow?: THREE.LightShadow }).shadow as unknown as ManagedShadow | undefined;
  if (shadow === undefined || (light as THREE.PointLight).isPointLight === true) return null;
  if (!shadow.autoUpdate && !shadow.needsUpdate) return null;
  const map = shadow.map as THREE.WebGLRenderTarget | null;
  if (map === null || (map as Partial<THREE.WebGLCubeRenderTarget>).isWebGLCubeRenderTarget === true || map.depthTexture === null) return null;
  if (shadow.getViewportCount() !== 1) return null;
  const extents = shadow.getFrameExtents();
  if (map.width !== shadow.mapSize.x * extents.x || map.height !== shadow.mapSize.y * extents.y) return null;
  return shadow;
}

/** What three would use: the shadow camera's own layers when it sets any beyond 0, else the view camera's. */
function passLayers(shadow: ManagedShadow, camera: THREE.Camera): THREE.Layers {
  return (shadow.camera.layers.mask & 0xfffffffe) !== 0 ? shadow.camera.layers : camera.layers;
}

/**
 * Bring the shadow camera to this frame's matrices exactly as three's pass does, then key the pass by
 * everything that decides its depth image apart from the casters.
 */
function lightKey(light: THREE.Light, shadow: ManagedShadow, camera: THREE.Camera, reversed: boolean, type: number, out: number[]): number[] {
  (shadow.camera as THREE.Camera & { _reversedDepth?: boolean })._reversedDepth = reversed;
  shadow.updateMatrices(light, camera);
  const map = shadow.map;
  let at = 0;
  out[at++] = targetId(map);
  out[at++] = map.width;
  out[at++] = map.height;
  out[at++] = passLayers(shadow, camera).mask;
  out[at++] = reversed ? 1 : 0;
  out[at++] = type;
  for (const value of shadow.camera.matrixWorldInverse.elements) out[at++] = value;
  for (const value of shadow.camera.projectionMatrix.elements) out[at++] = value;
  out.length = at;
  return out;
}

function makeLayer(map: THREE.WebGLRenderTarget): THREE.WebGLRenderTarget {
  // Only the depth attachment is ever read; the colour attachment is the smallest one three will draw into.
  const layer = new THREE.WebGLRenderTarget(map.width, map.height, {
    format: THREE.RedFormat,
    type: THREE.UnsignedByteType,
    generateMipmaps: false,
    depthBuffer: true,
  });
  const source = map.depthTexture!;
  const depth = new THREE.DepthTexture(map.width, map.height, source.type);
  depth.format = source.format;
  depth.minFilter = THREE.NearestFilter;
  depth.magFilter = THREE.NearestFilter;
  layer.depthTexture = depth;
  layer.texture.name = "shadowCache.layer";
  return layer;
}

function disposeTarget(target: THREE.WebGLRenderTarget | null): void {
  if (target === null) return;
  target.depthTexture?.dispose();
  target.dispose();
}

/** Side of the square of texels one comparison fragment counts, so the readback is 1/256 of the map. */
const AUDIT_BLOCK = 16;

/** Comparisons still waiting on the GPU at most; while this many are, a cached pass goes uncompared (counted as skipped). */
const AUDIT_PENDING_MAX = 16;

/** One comparison's readback, waiting on its fence. */
interface PendingComparison {
  sync: WebGLSync;
  buffer: WebGLBuffer;
  bytes: number;
  done: (differing: number) => void;
}

/**
 * Bit-exact comparison of two depth textures on the GPU, for the audit. It draws with its own GL
 * program rather than `renderer.render`, so a loading-time draw hold cannot swallow the comparison.
 * The result reads back through a pixel-pack buffer and a fence, landing a frame or more later
 * ({@link poll}): the WebGPU backend has no synchronous readback, and WebGL then never stalls on one.
 */
class DepthComparer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private color: WebGLTexture | null = null;
  private width = 0;
  private height = 0;
  private pixels = new Uint8Array(0);
  private pending: PendingComparison[] = [];
  private spare: WebGLBuffer[] = [];

  /** Whether {@link AUDIT_PENDING_MAX} comparisons are still waiting on their readback, after taking every one that landed. */
  busy(): boolean {
    this.poll();
    return this.pending.length >= AUDIT_PENDING_MAX;
  }

  /**
   * Compare the two maps on the GPU and call `done` with the texels whose depth bits differ once the
   * result is back, or -1 when the comparison did not run. False when it could not start.
   */
  compare(renderer: THREE.WebGLRenderer, cached: THREE.DepthTexture, full: THREE.DepthTexture, width: number, height: number, done: (differing: number) => void): boolean {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const handles = [cached, full].map((texture) => (renderer.properties.get(texture) as { __webglTexture?: WebGLTexture }).__webglTexture);
    const blocksX = Math.ceil(width / AUDIT_BLOCK);
    const blocksY = Math.ceil(height / AUDIT_BLOCK);
    if (handles[0] === undefined || handles[1] === undefined || !this.prepare(gl, blocksX, blocksY)) return false;
    const bytes = blocksX * blocksY * 4;
    const buffer = this.spare.pop() ?? gl.createBuffer();
    let started = false;
    const previous = renderer.getRenderTarget();
    // texelFetch reads raw depth only with comparison off, and a depth texture read that way is
    // incomplete (reads zero) unless it filters NEAREST; three's PCF maps compare and filter LINEAR.
    const setRaw = (raw: boolean) => {
      [cached, full].forEach((texture, unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, handles[unit]!);
        const compare = !raw && texture.compareFunction !== null;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, compare ? gl.COMPARE_REF_TO_TEXTURE : gl.NONE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, raw || texture.minFilter === THREE.NearestFilter ? gl.NEAREST : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, raw || texture.magFilter === THREE.NearestFilter ? gl.NEAREST : gl.LINEAR);
      });
    };
    try {
      setRaw(true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.viewport(0, 0, blocksX, blocksY);
      for (const capability of [gl.BLEND, gl.DEPTH_TEST, gl.STENCIL_TEST, gl.SCISSOR_TEST, gl.CULL_FACE, gl.RASTERIZER_DISCARD]) gl.disable(capability);
      gl.colorMask(true, true, true, true);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.uniform1i(gl.getUniformLocation(this.program!, "cached"), 0);
      gl.uniform1i(gl.getUniformLocation(this.program!, "full"), 1);
      gl.uniform2i(gl.getUniformLocation(this.program!, "size"), width, height);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
      gl.readPixels(0, 0, blocksX, blocksY, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (sync !== null) {
        this.pending.push({ sync, buffer, bytes, done });
        started = true;
      }
      setRaw(false);
    } finally {
      if (!started) this.spare.push(buffer);
      // three caches GL state; after raw calls it must forget it all, then rebind the pass's target.
      renderer.resetState();
      renderer.setRenderTarget(previous);
    }
    return started;
  }

  /** Hand every comparison whose readback has landed to its callback. */
  poll(): void {
    const gl = this.gl;
    if (gl === null || this.pending.length === 0) return;
    const waiting: PendingComparison[] = [];
    for (const p of this.pending) {
      if (gl.getSyncParameter(p.sync, gl.SYNC_STATUS) !== gl.SIGNALED) {
        waiting.push(p);
        continue;
      }
      gl.deleteSync(p.sync);
      if (this.pixels.length < p.bytes) this.pixels = new Uint8Array(p.bytes);
      const pixels = this.pixels.subarray(0, p.bytes);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, p.buffer);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      this.spare.push(p.buffer);
      p.done(countDiffering(pixels));
    }
    this.pending = waiting;
  }

  private prepare(gl: WebGL2RenderingContext, width: number, height: number): boolean {
    // A restored context drops every object; isProgram says so.
    if (this.gl !== gl || this.program === null || !gl.isProgram(this.program)) {
      this.release();
      this.gl = gl;
      const program = linkProgram(gl, [
        "#version 300 es",
        "void main() {",
        // One triangle that covers the viewport, with no vertex buffer.
        "  vec2 corner = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);",
        "  gl_Position = vec4(corner, 0.0, 1.0);",
        "}",
      ].join("\n"), [
        "#version 300 es",
        "precision highp float;",
        "precision highp sampler2D;",
        "uniform sampler2D cached;",
        "uniform sampler2D full;",
        "uniform ivec2 size;",
        "out vec4 outColor;",
        "void main() {",
        `  ivec2 block = ivec2(gl_FragCoord.xy) * ${AUDIT_BLOCK};`,
        "  int count = 0;",
        `  for (int y = 0; y < ${AUDIT_BLOCK}; y++) for (int x = 0; x < ${AUDIT_BLOCK}; x++) {`,
        "    ivec2 texel = block + ivec2(x, y);",
        "    if (texel.x < size.x && texel.y < size.y && texelFetch(cached, texel, 0).r != texelFetch(full, texel, 0).r) count++;",
        "  }",
        // Differing texels in red (low byte) and blue (high byte); green marks every block the comparison wrote.
        "  outColor = vec4(float(count % 256) / 255.0, 1.0, float(count / 256) / 255.0, 1.0);",
        "}",
      ].join("\n"));
      if (program === null) return false;
      this.program = program;
      this.vao = gl.createVertexArray();
      this.framebuffer = gl.createFramebuffer();
      this.width = 0;
    }
    if (this.width !== width || this.height !== height) {
      if (this.color !== null) gl.deleteTexture(this.color);
      this.color = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.color);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.color, 0);
      this.width = width;
      this.height = height;
      this.pixels = new Uint8Array(width * height * 4);
    }
    return true;
  }

  private release(): void {
    const gl = this.gl;
    if (gl === null) return;
    for (const p of this.pending) {
      gl.deleteSync(p.sync);
      gl.deleteBuffer(p.buffer);
    }
    for (const buffer of this.spare) gl.deleteBuffer(buffer);
    this.pending = [];
    this.spare = [];
    if (this.program !== null) gl.deleteProgram(this.program);
    if (this.vao !== null) gl.deleteVertexArray(this.vao);
    if (this.framebuffer !== null) gl.deleteFramebuffer(this.framebuffer);
    if (this.color !== null) gl.deleteTexture(this.color);
    this.program = this.vao = this.framebuffer = this.color = null;
  }

  dispose(): void {
    this.release();
    this.gl = null;
  }
}

/**
 * The comparison's readback summed: red and blue hold each block's differing texels (low and high
 * byte), green marks a block the comparison wrote. -1 when a block was never written: the comparison
 * did not run, so there is no verdict rather than a false one.
 * @internal
 */
export function countDiffering(pixels: Uint8Array): number {
  let differing = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 1] !== 255) return -1;
    differing += pixels[index]! + 256 * pixels[index + 2]!;
  }
  return differing;
}

function linkProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram | null {
  const program = gl.createProgram();
  const shaders = ([[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const).map(([type, source]) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    return shader;
  });
  gl.linkProgram(program);
  for (const shader of shaders) gl.deleteShader(shader);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) === true) return program;
  gl.deleteProgram(program);
  return null;
}

/** One renderer's cache: the wrapped shadow pass, its scene's casters and one record per light. */
class ShadowCache {
  private readonly lights = new Map<THREE.Light, LightRecord>();
  private readonly tracker: ShadowCasterTracker;
  private readonly proxy = new THREE.Object3D();
  private readonly rest: THREE.Light[] = [];
  private readonly planned: { light: THREE.Light; shadow: ManagedShadow; record: LightRecord; key: number[]; plan: ShadowPassPlan; reaches: boolean }[] = [];
  private readonly single: THREE.Light[] = [];
  private readonly original: ShadowCacheRenderer["shadowMap"]["render"];
  private readonly wrapper: ShadowCacheRenderer["shadowMap"]["render"];
  private readonly passes: Record<ShadowPassPlan, number> = { full: 0, rebuild: 0, reuse: 0, hold: 0 };
  private readonly auditStats = { maps: 0, mismatchedMaps: 0, mismatchedTexels: 0, failed: 0, skipped: 0 };
  private comparer: DepthComparer | null = null;
  private auditTarget: THREE.WebGLRenderTarget | null = null;
  private enabled = true;
  private audit = false;
  private frame = 0;
  private checks = 0;
  private invocations = 0;
  private cpuMs = 0;
  private lastType: number;
  private lastCheckToken: number | undefined;

  constructor(
    private readonly renderer: ShadowCacheRenderer,
    scene: THREE.Object3D,
    private readonly now: () => number,
    private readonly frameToken?: () => number,
  ) {
    this.tracker = new ShadowCasterTracker(scene, (sphere) => this.stale(sphere), now);
    this.lastType = renderer.shadowMap.type;
    const shadowMap = renderer.shadowMap;
    this.original = shadowMap.render;
    this.wrapper = (lights, renderScene, camera) => {
      const start = this.now();
      try {
        this.render(lights, renderScene, camera);
      } finally {
        this.cpuMs += this.now() - start;
      }
    };
    shadowMap.render = this.wrapper;
  }

  private stale(sphere: THREE.Sphere | null): void {
    for (const record of this.lights.values()) {
      if (record.state.layerKey === null || record.state.layerStale) continue;
      if (sphere === null || record.frustum.intersectsSphere(sphere)) record.state.layerStale = true;
    }
  }

  private callOriginal(lights: THREE.Light[], scene: THREE.Object3D, camera: THREE.Camera, needsUpdate: boolean): void {
    // three clears the renderer-wide `needsUpdate` after each call; every sub-pass must see the frame's value.
    this.renderer.shadowMap.needsUpdate = needsUpdate;
    this.original.call(this.renderer.shadowMap, lights, scene as THREE.Scene, camera);
  }

  /** One sub-pass of a light that asked for a pass this frame; three clears the light's `needsUpdate` after each. */
  private passOf(light: THREE.Light, shadow: ManagedShadow, scene: THREE.Object3D, camera: THREE.Camera, needsUpdate: boolean): void {
    const single = this.single;
    single[0] = light;
    single.length = 1;
    shadow.needsUpdate = true;
    this.callOriginal(single, scene, camera, needsUpdate);
  }

  private resetLights(): void {
    for (const record of this.lights.values()) disposeTarget(record.layer);
    this.lights.clear();
  }

  private render(lights: THREE.Light[], scene: THREE.Object3D, camera: THREE.Camera): void {
    this.invocations += 1;
    const renderer = this.renderer;
    const shadowMap = renderer.shadowMap;
    const type = shadowMap.type;
    const typeChanged = type !== this.lastType;
    this.lastType = type;
    if (typeChanged) this.resetLights();
    // A render with shadow updates off (a postfx prepass, a probe or impostor bake) draws no map, so
    // every map and layer still holds what its record says.
    if (!shadowMap.enabled || (!shadowMap.autoUpdate && !shadowMap.needsUpdate)) {
      this.original.call(shadowMap, lights, scene as THREE.Scene, camera);
      return;
    }
    if (!this.enabled || typeChanged || scene !== this.tracker.scene || type === THREE.VSMShadowMap || renderer.clippingPlanes.length > 0) {
      // A map three draws on its own no longer holds what its record says.
      if (scene === this.tracker.scene) {
        for (const light of lights) {
          const record = this.lights.get(light);
          if (record === undefined) continue;
          disposeTarget(record.layer);
          this.lights.delete(light);
        }
      }
      this.original.call(shadowMap, lights, scene as THREE.Scene, camera);
      return;
    }
    const needsUpdate = shadowMap.needsUpdate;
    const frameToken = this.frameToken?.();
    this.frame += 1;
    const reversed = renderer.state.buffers.depth.getReversed();
    const rest = this.rest;
    const planned = this.planned;
    rest.length = 0;
    planned.length = 0;
    let checked = false;
    let allFull = true;
    try {
      for (const light of lights) {
        const shadow = managedShadow(light);
        if (shadow === null) {
          rest.push(light);
          continue;
        }
        let record = this.lights.get(light);
        if (record === undefined) {
          record = { state: createShadowLayerState(), layer: null, frustum: new THREE.Frustum(), key: [], seenFrame: this.frame, servedFrame: -1 };
          this.lights.set(light, record);
        }
        record.seenFrame = this.frame;
        const key = lightKey(light, shadow, camera, reversed, type, record.key);
        // Only a light that may skip casters needs them checked: a far cascade stepping a texel draws them all.
        const mayCache = shadowPassMayCache(record.state, key);
        if (mayCache && !checked) {
          checked = true;
          // The scene does not change between a frame's renders, so one check serves them all.
          if (frameToken === undefined || frameToken !== this.lastCheckToken) {
            this.tracker.check();
            this.checks += 1;
            this.lastCheckToken = frameToken;
          }
        }
        const reaches = mayCache && this.tracker.dynamicReaches(shadow.getFrustum(), passLayers(shadow, camera));
        // A post pass that renders the scene again in the same frame asks for the same maps the
        // first render just drew: the light's map already holds this key's image, so the pass holds.
        const repeat = frameToken !== undefined && record.servedFrame === frameToken && sameShadowKey(record.state.drawnKey, key);
        const plan = repeat ? "hold" : planShadowPass(record.state, key, reaches);
        if (plan !== "full") allFull = false;
        planned.push({ light, shadow, record, key, plan, reaches });
      }
      if (allFull) {
        // Every light draws all its casters (a walking camera moves every cascade it updates): one
        // call, exactly three's own pass, so a frame the cache cannot help costs what it did without it.
        this.callOriginal(lights, scene, camera, needsUpdate);
      } else {
        for (const { light, shadow, record, plan } of planned) {
          this.run(plan, light, shadow, record, scene, camera, needsUpdate);
          if (this.audit && plan !== "full") this.auditPass(light, shadow, scene, camera, needsUpdate);
        }
        if (rest.length > 0) this.callOriginal(rest, scene, camera, needsUpdate);
      }
      for (const { record, key, plan, reaches } of planned) {
        recordShadowPass(record.state, key, plan, reaches);
        if (frameToken !== undefined) record.servedFrame = frameToken;
        this.passes[plan] += 1;
      }
    } finally {
      rest.length = 0;
      planned.length = 0;
      shadowMap.needsUpdate = false;
    }
    if (this.frame % LIGHT_RETIRE_FRAMES === 0) this.retire();
  }

  private run(plan: ShadowPassPlan, light: THREE.Light, shadow: ManagedShadow, record: LightRecord, scene: THREE.Object3D, camera: THREE.Camera, needsUpdate: boolean): void {
    if (plan === "full") {
      this.passOf(light, shadow, scene, camera, needsUpdate);
      return;
    }
    if (plan === "hold") {
      shadow.needsUpdate = false;
      return;
    }
    const map = shadow.map;
    if (plan === "rebuild") {
      const layer = record.layer;
      if (layer === null || layer.width !== map.width || layer.height !== map.height || layer.depthTexture?.type !== map.depthTexture!.type) {
        disposeTarget(layer);
        record.layer = makeLayer(map);
      }
      this.drawStatic(light, shadow, record.layer!, scene, camera, needsUpdate);
      record.frustum.copy(shadow.getFrustum());
    }
    this.drawDynamic(light, shadow, record.layer!, camera, needsUpdate);
  }

  /** Draw every static caster, and nothing else, into the light's layer. */
  private drawStatic(light: THREE.Light, shadow: ManagedShadow, layer: THREE.WebGLRenderTarget, scene: THREE.Object3D, camera: THREE.Camera, needsUpdate: boolean): void {
    const map = shadow.map;
    const restoreDynamic = this.tracker.hideDynamic();
    shadow.map = layer;
    try {
      this.passOf(light, shadow, scene, camera, needsUpdate);
    } finally {
      shadow.map = map;
      restoreDynamic();
    }
  }

  /** Start the map as a copy of the layer, then draw the changed casters over it with the depth test on. */
  private drawDynamic(light: THREE.Light, shadow: ManagedShadow, layer: THREE.WebGLRenderTarget, camera: THREE.Camera, needsUpdate: boolean): void {
    const renderer = this.renderer;
    const map = shadow.map;
    const clear = renderer.clear;
    renderer.clear = function (this: unknown, ...args: never[]) {
      clear.apply(this, args);
      renderer.copyTextureToTexture(layer.depthTexture!, map.depthTexture!);
      renderer.setRenderTarget(map);
    } as typeof clear;
    const proxy = this.proxy;
    proxy.children = this.tracker.dynamicRoots;
    try {
      this.passOf(light, shadow, proxy, camera, needsUpdate);
    } finally {
      proxy.children = NO_CHILDREN;
      renderer.clear = clear;
    }
  }

  /** Draw the same pass the uncached way into a spare target and count the texels that differ. */
  private auditPass(light: THREE.Light, shadow: ManagedShadow, scene: THREE.Object3D, camera: THREE.Camera, needsUpdate: boolean): void {
    const renderer = this.renderer as unknown as THREE.WebGLRenderer;
    if (typeof renderer.readRenderTargetPixels !== "function") return;
    const map = shadow.map;
    this.comparer ??= new DepthComparer();
    // Checked before the redraw, so a pass that cannot be compared costs no second draw.
    if (this.comparer.busy()) {
      this.auditStats.skipped += 1;
      return;
    }
    if (this.auditTarget === null || this.auditTarget.width !== map.width || this.auditTarget.height !== map.height) {
      disposeTarget(this.auditTarget);
      this.auditTarget = makeLayer(map);
    }
    shadow.map = this.auditTarget;
    try {
      this.passOf(light, shadow, scene, camera, needsUpdate);
    } finally {
      shadow.map = map;
    }
    const started = this.comparer.compare(renderer, map.depthTexture!, this.auditTarget.depthTexture!, map.width, map.height, (differing) => {
      if (differing < 0) {
        this.auditStats.failed += 1;
        return;
      }
      this.auditStats.maps += 1;
      if (differing > 0) {
        this.auditStats.mismatchedMaps += 1;
        this.auditStats.mismatchedTexels += differing;
      }
    });
    if (!started) this.auditStats.failed += 1;
  }

  private retire(): void {
    for (const [light, record] of this.lights) {
      if (this.frame - record.seenFrame < LIGHT_RETIRE_FRAMES) continue;
      disposeTarget(record.layer);
      this.lights.delete(light);
    }
  }

  handle(): ShadowCacheHandle {
    return {
      stats: () => {
        // Audit comparisons land asynchronously; a read takes every one that has.
        this.comparer?.poll();
        return {
          enabled: this.enabled,
          casters: this.tracker.entries.size,
          staticCasters: this.tracker.staticCount(),
          dynamicCasters: this.tracker.dynamicCount(),
          alwaysDynamicCasters: this.tracker.alwaysDynamicCount(),
          checks: this.checks,
          invocations: this.invocations,
          cpuMs: this.cpuMs,
          passes: { ...this.passes },
          audit: { on: this.audit, ...this.auditStats },
        };
      },
      setEnabled: (on) => {
        if (on === this.enabled) return;
        this.enabled = on;
        this.resetLights();
      },
      setAudit: (on) => {
        this.audit = on;
      },
      resetStats: () => {
        for (const plan of Object.keys(this.passes) as ShadowPassPlan[]) this.passes[plan] = 0;
        this.checks = 0;
        this.invocations = 0;
        this.cpuMs = 0;
        this.auditStats.maps = 0;
        this.auditStats.mismatchedMaps = 0;
        this.auditStats.mismatchedTexels = 0;
        this.auditStats.failed = 0;
        this.auditStats.skipped = 0;
      },
    };
  }

  /** A lost context takes every layer's memory with it. */
  contextRestored(): void {
    for (const record of this.lights.values()) {
      dropShadowLayer(record.state);
      record.state.drawnKey = null;
      disposeTarget(record.layer);
      record.layer = null;
    }
  }

  dispose(): void {
    const shadowMap = this.renderer.shadowMap;
    if (shadowMap.render === this.wrapper) shadowMap.render = this.original;
    else this.enabled = false;
    this.resetLights();
    disposeTarget(this.auditTarget);
    this.comparer?.dispose();
    this.tracker.dispose();
  }
}

/**
 * Cache every light's static shadow casters for `scene` on `renderer`: casters that have not changed
 * are drawn once per projection into a layer, and each pass copies that layer and draws only the
 * changed casters over it, so the maps stay bit-identical to drawing every caster. Lights that only
 * redraw when their projection moves (far cascades) keep three's pass. Returns the page handle and
 * the uninstall.
 * @internal
 */
export function installShadowCache(
  renderer: ShadowCacheRenderer,
  scene: THREE.Object3D,
  now: () => number = () => performance.now(),
  frameToken?: () => number,
): { handle: ShadowCacheHandle; dispose: () => void } {
  const cache = new ShadowCache(renderer, scene, now, frameToken);
  const canvas = (renderer as unknown as Partial<THREE.WebGLRenderer>).domElement;
  const restored = () => cache.contextRestored();
  canvas?.addEventListener?.("webglcontextrestored", restored);
  return {
    handle: cache.handle(),
    dispose: () => {
      canvas?.removeEventListener?.("webglcontextrestored", restored);
      cache.dispose();
    },
  };
}
