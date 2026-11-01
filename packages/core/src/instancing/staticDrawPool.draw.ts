import * as THREE from "three";

import { POINTER_OBJECT_INSTANCES_KEY } from "@jgengine/core/input/pointerService.draw";
import { batchHookSignature, compilesBatched, isHookUserData, isLayerDefine, isLayerUserData, ownCacheKey, withoutCompileLayers } from "@jgengine/core/material/compileLayers.draw";
import { freezeStaticTransforms } from "@jgengine/core/model/staticTransforms.draw";
import { runSliced, type SlicedRun } from "@jgengine/core/run/slicedWork";
import type { HlodConfig } from "@jgengine/core/visibility/config";
import { cellProxyJob, type ProxyPart } from "./cellProxy.draw";
import { showCulled } from "@jgengine/core/visibility/culledTransforms.draw";

/** Marks the `BatchedMesh` draws a {@link StaticDrawPool} owns. @internal */
export const STATIC_POOL_MESH_KEY = "jgStaticDrawPool";

/** One draw source a pool can take: a material and a geometry, both shared with their model. @internal */
export interface PooledSource {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  castShadow?: boolean | undefined;
  receiveShadow?: boolean | undefined;
}

/** A placement a slot draws: its id names it to picking. @internal */
export interface PooledPlacement {
  readonly instanceId: string;
}

/**
 * A source's part in its cells' far proxies. `"part"` adds its geometry to the proxy and hides behind
 * it (a model's coarsest mesh level); `"hidden"` hides behind the proxy without adding to it (a finer
 * level of a model whose coarsest level stands in for it); `"own"` neither adds nor hides, for a model
 * whose far placements draw as impostor cards.
 */
export type ProxyRole = "part" | "hidden" | "own";

/** Marks the merged far proxies a {@link StaticDrawPool} draws. @internal */
export const STATIC_POOL_PROXY_KEY = "jgStaticDrawProxy";

/**
 * Edge in metres of the cells far proxies stand in for. Finer than a batch's cell: a block of a city
 * goes far while the batch it shares with the street the camera stands on stays near, its props hidden
 * one instance at a time.
 * @internal
 */
export const STATIC_PROXY_CELL = 128;

interface ProxyCell {
  readonly key: string;
  /** Each member is one slot instance placed inside the cell. */
  readonly members: Set<ProxyMember>;
  readonly sphere: THREE.Sphere;
  boundsDirty: boolean;
  far: boolean;
  /** Bumped whenever a placement in the cell is added, moved or removed. */
  version: number;
  proxy: THREE.Mesh | null;
  proxyVersion: number;
}

interface ProxyMember {
  readonly slot: StaticDrawSlot;
  readonly index: number;
}

interface PoolGroup {
  readonly key: string;
  readonly mesh: THREE.BatchedMesh;
  readonly slots: Set<StaticDrawSlot>;
  readonly material: THREE.Material;
  /** Placement id per batch instance, read by picking. */
  readonly ids: string[];
  readonly geometries: Map<THREE.BufferGeometry, { id: number; refs: number }>;
  vertexCapacity: number;
  indexCapacity: number;
  instances: number;
  shown: number;
  boundsDirty: boolean;
}

const sourceIds = new WeakMap<object, number>();
let nextSourceId = 1;

function sourceId(source: object): number {
  let id = sourceIds.get(source);
  if (id === undefined) {
    id = nextSourceId++;
    sourceIds.set(source, id);
  }
  return id;
}

function textureSignature(texture: THREE.Texture): string {
  return [
    sourceId(texture.source), texture.offset.x, texture.offset.y, texture.repeat.x, texture.repeat.y, texture.rotation,
    texture.center.x, texture.center.y, texture.wrapS, texture.wrapT, texture.magFilter, texture.minFilter, texture.anisotropy,
    texture.colorSpace, texture.flipY, texture.channel, texture.format, texture.type, texture.generateMipmaps,
    texture.premultiplyAlpha, texture.mapping, texture.matrixAutoUpdate,
  ].join(",");
}

const SKIPPED_KEYS = new Set(["uuid", "name", "id", "version", "userData", "defines", "onBeforeCompile", "customProgramCacheKey"]);

/** A plain record without the keys scene-wide layers own, for a signature. */
function ownEntries(record: Record<string, unknown> | undefined, isLayer: (key: string) => boolean): Record<string, unknown> {
  const own: Record<string, unknown> = {};
  for (const key of Object.keys(record ?? {}).sort()) if (!isLayer(key)) own[key] = record?.[key];
  return own;
}

function valueSignature(value: unknown): string | null {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "function") return "";
  if (typeof value !== "object") return null;
  if (value instanceof THREE.Texture) return `t(${textureSignature(value)})`;
  if (value instanceof THREE.Color) return `c(${value.r},${value.g},${value.b})`;
  if (value instanceof THREE.Vector2 || value instanceof THREE.Vector3 || value instanceof THREE.Vector4 || value instanceof THREE.Euler) {
    return `v(${value.toArray().join(",")})`;
  }
  if (Array.isArray(value)) return value.length === 0 ? "[]" : null;
  if (Object.getPrototypeOf(value) !== Object.prototype) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/** The one material of a source, or null for a multi-material mesh. */
function singleMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | null {
  return Array.isArray(material) ? null : material;
}

/**
 * Every value that changes what a material draws, as one string: two materials with the same signature
 * draw the same pixels, so their meshes can share one draw. Null for a material a pool cannot share —
 * several materials, a shader material, a transparent one, or a compile hook that does not read the
 * batched instance matrix. Scene-wide layers (wet surfaces, cascaded shadows) are left out: they patch
 * every material in the scene alike, and patch the batch's own copy when it is drawn.
 * @internal
 */
export function materialSignature(material: THREE.Material | THREE.Material[]): string | null {
  const single = singleMaterial(material);
  if (single === null || single instanceof THREE.ShaderMaterial || single.transparent || !compilesBatched(single)) return null;
  const parts = [single.type, ownCacheKey(single).call(single), batchHookSignature(single)];
  for (const key of Object.keys(single).sort()) {
    if (key.startsWith("_") || SKIPPED_KEYS.has(key)) continue;
    const value = valueSignature(Reflect.get(single, key));
    if (value === null) return null;
    parts.push(`${key}=${value}`);
  }
  const defines = valueSignature(ownEntries(single.defines, isLayerDefine));
  if (defines === null) return null;
  parts.push(`defines=${defines}`);
  const userData = valueSignature(ownEntries(single.userData, (key) => isLayerUserData(key) || isHookUserData(key)));
  if (userData === null) return null;
  parts.push(`userData=${userData}`);
  return parts.join(";");
}

/**
 * The vertex layout a batch's shared buffers are made from: index or none, then each attribute's name,
 * width, array type and normalization (a quantized model's 16-bit positions never mix with float
 * ones). Null for a geometry a batch cannot hold.
 * @internal
 */
export function geometryLayout(geometry: THREE.BufferGeometry): string | null {
  return plainLayout(batchableGeometry(geometry));
}

function plainLayout(geometry: THREE.BufferGeometry): string | null {
  if (geometry.groups.length > 1 || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return null;
  if (Object.keys(geometry.morphAttributes).length > 0 || !geometry.hasAttribute("position")) return null;
  const parts = [geometry.index === null ? "n" : "i"];
  for (const name of Object.keys(geometry.attributes).sort()) {
    const attribute = geometry.getAttribute(name);
    if (!(attribute instanceof THREE.BufferAttribute)) return null;
    parts.push(`${name}:${attribute.itemSize}:${attribute.array.constructor.name}:${attribute.normalized}`);
  }
  return parts.join("|");
}

const plainCopies = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/**
 * The geometry a batch copies from: the geometry itself, or once per geometry a copy whose
 * interleaved attributes (a compressed model's packed vertices) are laid out one array each, since a
 * batch copies vertices attribute by attribute anyway.
 * @internal
 */
export function batchableGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!Object.values(geometry.attributes).some((attribute) => attribute instanceof THREE.InterleavedBufferAttribute)) return geometry;
  const known = plainCopies.get(geometry);
  if (known !== undefined) return known;
  const plain = new THREE.BufferGeometry();
  plain.setIndex(geometry.index);
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (!(attribute instanceof THREE.InterleavedBufferAttribute)) {
      plain.setAttribute(name, attribute);
      continue;
    }
    const ArrayType = arrayTypeOf(attribute.data.array);
    const copy = new THREE.BufferAttribute(new ArrayType(attribute.count * attribute.itemSize), attribute.itemSize, attribute.normalized);
    for (let index = 0; index < attribute.count; index += 1) {
      for (let component = 0; component < attribute.itemSize; component += 1) copy.setComponent(index, component, attribute.getComponent(index, component));
    }
    plain.setAttribute(name, copy);
  }
  for (const group of geometry.groups) plain.addGroup(group.start, group.count, group.materialIndex);
  plain.boundingBox = geometry.boundingBox?.clone() ?? null;
  plain.boundingSphere = geometry.boundingSphere?.clone() ?? null;
  plainCopies.set(geometry, plain);
  return plain;
}

type VertexArrayType = Float32ArrayConstructor | Int8ArrayConstructor | Uint8ArrayConstructor | Int16ArrayConstructor | Uint16ArrayConstructor | Int32ArrayConstructor | Uint32ArrayConstructor;

function arrayTypeOf(array: THREE.TypedArray): VertexArrayType {
  if (array instanceof Int8Array) return Int8Array;
  if (array instanceof Uint8Array) return Uint8Array;
  if (array instanceof Int16Array) return Int16Array;
  if (array instanceof Uint16Array) return Uint16Array;
  if (array instanceof Int32Array) return Int32Array;
  if (array instanceof Uint32Array) return Uint32Array;
  return Float32Array;
}

function vertexCount(geometry: THREE.BufferGeometry): number {
  return geometry.getAttribute("position").count;
}

const scratchMatrix = new THREE.Matrix4();

const pools = new WeakMap<THREE.Object3D, StaticDrawPool>();

/** The pool whose batches hang under `parent` (a scene), made on first use. @internal */
export function staticDrawPoolFor(parent: THREE.Object3D): StaticDrawPool {
  let pool = pools.get(parent);
  if (pool === undefined) {
    pool = new StaticDrawPool(parent);
    pools.set(parent, pool);
  }
  return pool;
}

/** The placement ids a pooled batch shows this frame, for the batching probe. @internal */
export function shownPooledIds(mesh: THREE.BatchedMesh, into: Set<string>): void {
  const ids = mesh.userData[POINTER_OBJECT_INSTANCES_KEY];
  if (!Array.isArray(ids)) return;
  ids.forEach((id: unknown, instance) => {
    if (typeof id === "string" && id !== "" && mesh.getVisibleAt(instance)) into.add(id);
  });
}

/**
 * Static props drawn through shared `BatchedMesh`es: one per cell, material signature, shadow flags and
 * vertex layout, whatever model a prop came from. A cell full of different props cut from one palette
 * material draws once instead of once per model and material. Culling stays per instance (a prop the
 * visibility pass culls is hidden in its batch, and three culls the rest per instance against every
 * camera, shadow cascades included), and the cell keeps each batch's bounds small enough for three's
 * own frustum test to drop the whole batch. With {@link HlodConfig} set, each {@link STATIC_PROXY_CELL}
 * far enough away draws one merged proxy and hides its props in their batches.
 * @internal
 */
export class StaticDrawPool {
  private readonly groups = new Map<string, PoolGroup>();
  private readonly cells = new Map<string, ProxyCell>();
  private hlod: HlodConfig | null = null;
  private building: { cell: ProxyCell; run: SlicedRun<THREE.BufferGeometry> } | null = null;
  private proxyMaterial: THREE.MeshStandardMaterial | null = null;

  constructor(private readonly parent: THREE.Object3D) {}

  /** Turn far-cell proxies on with a game's distances, or off with null (every prop draws in its batch). */
  configure(hlod: HlodConfig | null): void {
    if (hlod !== null && !(hlod.distance > 0 && hlod.hysteresis >= 0 && hlod.cluster > 0)) {
      throw new Error("hlod needs a positive distance and cluster size and a non-negative hysteresis");
    }
    const cluster = this.hlod?.cluster;
    this.hlod = hlod;
    for (const cell of this.cells.values()) {
      if (hlod === null || hlod.cluster !== cluster) this.dropProxy(cell);
      if (hlod === null) this.switchCell(cell, false);
    }
  }

  /**
   * Switch each proxy cell between its props and its proxy for a camera at `eye`, and build at most one
   * stale proxy at a time in small slices. Bounded per frame: one distance test per cell. Run it before
   * the slots sync, so a cell's props and its proxy change over in the same frame.
   */
  update(eye: THREE.Vector3): void {
    const hlod = this.hlod;
    if (hlod === null) return;
    for (const cell of this.cells.values()) {
      if (cell.boundsDirty) refreshCellBounds(cell);
      if (cell.sphere.isEmpty()) continue;
      const distance = Math.max(0, cell.sphere.distanceToPoint(eye));
      const far = cell.far ? distance > hlod.distance - hlod.hysteresis / 2 : distance > hlod.distance + hlod.hysteresis / 2;
      if (far && (cell.proxy === null || cell.proxyVersion !== cell.version)) this.buildProxy(cell, hlod);
      if (far !== cell.far) this.switchCell(cell, far);
    }
  }

  /** Cells drawing their proxy right now. */
  proxiesShown(): number {
    let shown = 0;
    for (const cell of this.cells.values()) if (cell.proxy?.visible === true) shown += 1;
    return shown;
  }

  /** Batches the pool holds. */
  batches(): number {
    return this.groups.size;
  }

  /** Batches holding at least one shown instance: the draws the pool submits before three's own culling. */
  draws(): number {
    let draws = 0;
    for (const group of this.groups.values()) if (group.shown > 0) draws += 1;
    return draws;
  }

  /** Instances shown across every batch. */
  shownInstances(): number {
    let shown = 0;
    for (const group of this.groups.values()) shown += group.shown;
    return shown;
  }

  /**
   * Take `capacity` instances of one source in one cell; null when its material or geometry cannot be
   * shared, and the caller draws it on its own. `proxy` is the source's part in its cells' far proxies
   * ({@link ProxyRole}).
   */
  acquire(source: PooledSource, cell: string, capacity: number, proxy: ProxyRole = "part"): StaticDrawSlot | null {
    const signature = materialSignature(source.material);
    const layout = geometryLayout(source.geometry);
    const material = singleMaterial(source.material);
    if (signature === null || layout === null || material === null || capacity <= 0) return null;
    const key = `${cell}#${source.castShadow === true}${source.receiveShadow === true}#${layout}#${signature}`;
    let group = this.groups.get(key);
    if (group === undefined) {
      group = this.createGroup(key, source, material, capacity);
      this.groups.set(key, group);
    }
    const geometryId = this.addGeometry(group, batchableGeometry(source.geometry));
    const mesh = group.mesh;
    if (mesh.instanceCount + capacity > mesh.maxInstanceCount) {
      mesh.setInstanceCount(Math.max(mesh.maxInstanceCount * 2, mesh.instanceCount + capacity));
    }
    const instances: number[] = [];
    for (let index = 0; index < capacity; index += 1) {
      const id = mesh.addInstance(geometryId);
      mesh.setVisibleAt(id, false);
      instances.push(id);
    }
    group.instances += capacity;
    const slot = new StaticDrawSlot(this, group, batchableGeometry(source.geometry), instances, proxy);
    group.slots.add(slot);
    return slot;
  }

  /** Remove every batch and proxy from the scene and free their buffers. */
  dispose(): void {
    this.building?.run.cancel();
    this.building = null;
    for (const group of this.groups.values()) disposeGroup(group);
    for (const cell of this.cells.values()) this.dropProxy(cell);
    this.groups.clear();
    this.cells.clear();
    this.proxyMaterial?.dispose();
    this.proxyMaterial = null;
  }

  /** Whether a member's props give way to its cell's proxy. @internal */
  proxied(cell: ProxyCell | null): boolean {
    return cell !== null && cell.far && cell.proxy !== null;
  }

  /** File a placed instance under the proxy cell its position falls in. @internal */
  file(member: ProxyMember, from: ProxyCell | null, x: number, z: number): ProxyCell {
    const key = `${Math.floor(x / STATIC_PROXY_CELL)},${Math.floor(z / STATIC_PROXY_CELL)}`;
    let cell = this.cells.get(key);
    if (cell === undefined) {
      cell = { key, members: new Set(), sphere: new THREE.Sphere(), boundsDirty: true, far: false, version: 0, proxy: null, proxyVersion: -1 };
      this.cells.set(key, cell);
    }
    if (from !== null && from !== cell) this.unfile(member, from);
    cell.members.add(member);
    cell.version += 1;
    cell.boundsDirty = true;
    return cell;
  }

  /** @internal */
  unfile(member: ProxyMember, cell: ProxyCell): void {
    cell.members.delete(member);
    cell.version += 1;
    cell.boundsDirty = true;
    if (cell.members.size > 0) return;
    this.dropProxy(cell);
    this.cells.delete(cell.key);
  }

  private switchCell(cell: ProxyCell, far: boolean): void {
    cell.far = far;
    if (cell.proxy !== null) showCulled(cell.proxy, far);
    for (const member of cell.members) member.slot.refresh(member.index);
  }

  private buildProxy(cell: ProxyCell, hlod: HlodConfig): void {
    if (this.building !== null) return;
    const version = cell.version;
    const parts: ProxyPart[] = [];
    for (const member of cell.members) {
      const part = member.slot.partAt(member.index);
      if (part !== null) parts.push(part);
    }
    if (parts.length === 0) return;
    const run = runSliced(cellProxyJob(parts, hlod.cluster), { budgetMs: 2 });
    this.building = { cell, run };
    run.done.then(
      (geometry) => {
        if (this.building?.run === run) this.building = null;
        if (this.cells.get(cell.key) !== cell || this.hlod === null) {
          geometry.dispose();
          return;
        }
        this.placeProxy(cell, geometry, version);
      },
      () => {
        if (this.building?.run === run) this.building = null;
      },
    );
  }

  private placeProxy(cell: ProxyCell, geometry: THREE.BufferGeometry, version: number): void {
    const first = cell.proxy === null;
    if (cell.proxy === null) {
      this.proxyMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
      const proxy = new THREE.Mesh(geometry, this.proxyMaterial);
      proxy.userData[STATIC_POOL_PROXY_KEY] = true;
      this.parent.add(proxy);
      freezeStaticTransforms(proxy);
      cell.proxy = proxy;
    } else {
      cell.proxy.geometry.dispose();
      cell.proxy.geometry = geometry;
    }
    cell.proxyVersion = version;
    if (first) this.switchCell(cell, cell.far);
  }

  private dropProxy(cell: ProxyCell): void {
    if (this.building?.cell === cell) {
      this.building.run.cancel();
      this.building = null;
    }
    if (cell.proxy === null) return;
    cell.proxy.removeFromParent();
    cell.proxy.geometry.dispose();
    cell.proxy = null;
    cell.proxyVersion = -1;
    for (const member of cell.members) member.slot.refresh(member.index);
  }

  /** @internal */
  release(slot: StaticDrawSlot, group: PoolGroup, geometry: THREE.BufferGeometry, instances: readonly number[], shown: number): void {
    group.slots.delete(slot);
    for (const id of instances) {
      group.mesh.deleteInstance(id);
      group.ids[id] = "";
    }
    group.instances -= instances.length;
    group.shown -= shown;
    const entry = group.geometries.get(geometry);
    if (entry !== undefined && --entry.refs === 0) {
      group.mesh.deleteGeometry(entry.id);
      group.geometries.delete(geometry);
    }
    if (group.instances === 0) {
      disposeGroup(group);
      this.groups.delete(group.key);
      return;
    }
    group.boundsDirty = true;
    settleGroup(group);
  }

  private createGroup(key: string, source: PooledSource, material: THREE.Material, capacity: number): PoolGroup {
    const geometry = batchableGeometry(source.geometry);
    const vertexCapacity = Math.max(1024, vertexCount(geometry) * 2);
    const indexCapacity = Math.max(2048, (geometry.index?.count ?? 0) * 2);
    // The pool owns its copy, so a model batch disposing its harvested materials leaves this draw alone.
    const owned = withoutCompileLayers(material);
    const mesh = new THREE.BatchedMesh(Math.max(16, capacity), vertexCapacity, indexCapacity, owned);
    mesh.castShadow = source.castShadow === true;
    mesh.receiveShadow = source.receiveShadow === true;
    const ids: string[] = [];
    mesh.userData[STATIC_POOL_MESH_KEY] = true;
    mesh.userData[POINTER_OBJECT_INSTANCES_KEY] = ids;
    this.parent.add(mesh);
    freezeStaticTransforms(mesh);
    showCulled(mesh, false);
    return { key, mesh, slots: new Set(), material: owned, ids, geometries: new Map(), vertexCapacity, indexCapacity, instances: 0, shown: 0, boundsDirty: true };
  }

  private addGeometry(group: PoolGroup, geometry: THREE.BufferGeometry): number {
    const known = group.geometries.get(geometry);
    if (known !== undefined) {
      known.refs += 1;
      return known.id;
    }
    const vertices = vertexCount(geometry);
    const indices = geometry.index?.count ?? 0;
    const mesh = group.mesh;
    const fits = () => vertices <= mesh.unusedVertexCount && indices <= mesh.unusedIndexCount;
    if (!fits()) mesh.optimize();
    if (!fits()) {
      const usedVertices = group.vertexCapacity - mesh.unusedVertexCount;
      const usedIndices = group.indexCapacity - mesh.unusedIndexCount;
      group.vertexCapacity = Math.max(group.vertexCapacity * 2, usedVertices + vertices);
      group.indexCapacity = Math.max(group.indexCapacity * 2, usedIndices + indices);
      mesh.setGeometrySize(group.vertexCapacity, group.indexCapacity);
    }
    const id = mesh.addGeometry(geometry);
    group.geometries.set(geometry, { id, refs: 1 });
    return id;
  }
}

function settleGroup(group: PoolGroup): void {
  if (group.boundsDirty && group.instances > 0) {
    group.boundsDirty = false;
    const sphere = (group.mesh.boundingSphere ??= new THREE.Sphere());
    sphere.makeEmpty();
    for (const slot of group.slots) slot.unionBounds(sphere);
  }
  showCulled(group.mesh, group.shown > 0);
}

const instanceSphere = new THREE.Sphere();

function refreshCellBounds(cell: ProxyCell): void {
  cell.boundsDirty = false;
  cell.sphere.makeEmpty();
  for (const member of cell.members) {
    if (member.slot.sphereAt(member.index, instanceSphere)) cell.sphere.union(instanceSphere);
  }
}

function disposeGroup(group: PoolGroup): void {
  group.mesh.removeFromParent();
  group.mesh.dispose();
  group.material.dispose();
}

/**
 * One source's instances in a pool batch, one per placement of its model batch. Placements keep their
 * instance for the slot's life, so a prop that leaves the view is hidden rather than shifting every
 * later prop's matrix down a slot.
 * @internal
 */
export class StaticDrawSlot {
  private readonly placed: (PooledPlacement | null)[];
  private readonly wanted: boolean[];
  private readonly shownAt: boolean[];
  private readonly stamp: number[];
  private readonly cells: (ProxyCell | null)[];
  private readonly members: ProxyMember[];
  private shown = 0;
  private frame = 0;
  private released = false;

  constructor(
    private readonly pool: StaticDrawPool,
    private readonly group: PoolGroup,
    private readonly geometry: THREE.BufferGeometry,
    private readonly instances: readonly number[],
    private readonly proxy: ProxyRole = "part",
  ) {
    this.placed = instances.map(() => null);
    this.wanted = instances.map(() => false);
    this.shownAt = instances.map(() => false);
    this.stamp = instances.map(() => -1);
    this.cells = instances.map(() => null);
    this.members = instances.map((_, index) => ({ slot: this, index }));
  }

  /** The batch this slot draws into. */
  get mesh(): THREE.BatchedMesh {
    return this.group.mesh;
  }

  /**
   * Show this frame's placements: `slotOf` names each one's instance (its index in the model batch),
   * and `matrixOf` writes its world matrix whenever the placement record changed. Every other instance
   * of the slot is hidden, and so is one whose cell draws its far proxy.
   */
  sync<T extends PooledPlacement>(
    members: readonly T[],
    slotOf: (member: T) => number | undefined,
    matrixOf: (member: T, out: THREE.Matrix4) => THREE.Matrix4,
  ): void {
    if (this.released) return;
    const frame = ++this.frame;
    for (const member of members) {
      const index = slotOf(member);
      const instance = index === undefined ? undefined : this.instances[index];
      if (index === undefined || instance === undefined) continue;
      this.stamp[index] = frame;
      this.write(index, instance, member, matrixOf);
      this.wanted[index] = true;
      this.refresh(index);
    }
    for (let index = 0; index < this.instances.length; index += 1) {
      if (this.stamp[index] === frame) continue;
      this.wanted[index] = false;
      this.refresh(index);
    }
    settleGroup(this.group);
  }

  /**
   * Write every placement's matrix whether or not it is shown this frame, so the batch's bounds and
   * its cell's far proxy hold props the camera has not looked at yet. Call when placements change.
   */
  place<T extends PooledPlacement>(
    members: readonly T[],
    slotOf: (member: T) => number | undefined,
    matrixOf: (member: T, out: THREE.Matrix4) => THREE.Matrix4,
  ): void {
    if (this.released) return;
    for (const member of members) {
      const index = slotOf(member);
      const instance = index === undefined ? undefined : this.instances[index];
      if (index !== undefined && instance !== undefined) this.write(index, instance, member, matrixOf);
    }
    settleGroup(this.group);
  }

  /** Show or hide one instance from what culling wants and whether its cell draws a proxy. @internal */
  refresh(index: number): void {
    const instance = this.instances[index];
    if (instance === undefined) return;
    const shown = this.wanted[index] === true && (this.proxy === "own" || !this.pool.proxied(this.cells[index] ?? null));
    if (this.shownAt[index] === shown) return;
    this.shownAt[index] = shown;
    this.group.mesh.setVisibleAt(instance, shown);
    const delta = shown ? 1 : -1;
    this.shown += delta;
    this.group.shown += delta;
    showCulled(this.group.mesh, this.group.shown > 0);
  }

  /** Grow `sphere` by every placed instance of this slot; an instance not yet placed has no bounds. @internal */
  unionBounds(sphere: THREE.Sphere): void {
    this.instances.forEach((_, index) => {
      if (this.sphereAt(index, instanceSphere)) sphere.union(instanceSphere);
    });
  }

  /** The world bounds of one placed instance into `target`; false when it is not placed. @internal */
  sphereAt(index: number, target: THREE.Sphere): boolean {
    const instance = this.instances[index];
    const geometry = this.group.geometries.get(this.geometry);
    if (instance === undefined || geometry === undefined || this.placed[index] === null) return false;
    const mesh = this.group.mesh;
    mesh.getBoundingSphereAt(geometry.id, target);
    target.applyMatrix4(mesh.getMatrixAt(instance, scratchMatrix));
    return true;
  }

  /** One placed instance as a proxy part, or null when it is not placed. @internal */
  partAt(index: number): ProxyPart | null {
    const instance = this.instances[index];
    if (this.proxy !== "part" || instance === undefined || this.placed[index] === null) return null;
    return { geometry: this.geometry, matrix: this.group.mesh.getMatrixAt(instance, new THREE.Matrix4()), material: this.group.material };
  }

  /** Give the instances back; the batch goes when its last slot does. */
  release(): void {
    if (this.released) return;
    this.released = true;
    this.cells.forEach((cell, index) => {
      const member = this.members[index];
      if (cell !== null && member !== undefined) this.pool.unfile(member, cell);
    });
    this.pool.release(this, this.group, this.geometry, this.instances, this.shown);
  }

  private write<T extends PooledPlacement>(index: number, instance: number, member: T, matrixOf: (member: T, out: THREE.Matrix4) => THREE.Matrix4): void {
    if (this.placed[index] === member) return;
    const group = this.group;
    this.placed[index] = member;
    const matrix = matrixOf(member, scratchMatrix);
    group.mesh.setMatrixAt(instance, matrix);
    group.ids[instance] = member.instanceId;
    group.boundsDirty = true;
    const filed = this.members[index];
    if (filed !== undefined && this.proxy !== "own") this.cells[index] = this.pool.file(filed, this.cells[index] ?? null, matrix.elements[12] ?? 0, matrix.elements[14] ?? 0);
  }
}
