import * as THREE from "three";

import { devtools } from "@jgengine/core/devtools/devtools";
import { compilesBatched, withoutCompileLayers } from "@jgengine/core/material/compileLayers.draw";
import { freezeStaticTransforms } from "@jgengine/core/model/staticTransforms.draw";
import { isPostfxOverlay } from "@jgengine/core/postfx/postfxOverlay.draw";
import { Lingering } from "@jgengine/core/run/lingering";
import { visitShownMeshes } from "@jgengine/core/visibility/culledTransforms.draw";
import { batchableGeometry, geometryLayout, materialSignature, mirrorSourceTextures } from "./staticDrawPool.draw";

/**
 * The layer a mesh drawn through a {@link DrawBatcher} sits on instead of layer 0, so three's own
 * scene and shadow passes skip it while its batch draws it. Raycasters that pick visible meshes enable
 * it (`raycaster.layers.enable(BATCHED_SOURCE_LAYER)`), or `enableAll()`.
 */
export const BATCHED_SOURCE_LAYER = 31;
const BATCHED_SOURCE_MASK = 1 << BATCHED_SOURCE_LAYER;
const DEFAULT_MASK = 1;

/** Marks the `BatchedMesh` draws a {@link DrawBatcher} owns. @internal */
export const DRAW_BATCH_MESH_KEY = "jgDrawBatch";

/** Passes a mesh the batcher stopped seeing keeps its instance, so a culled actor comes back without a rebuild. */
const RELEASE_AFTER_PASSES = 600;
/** Passes before a mesh that could not be batched is asked again when nothing about it changed. */
const RETRY_AFTER_PASSES = 240;
/** Passes a material keeps its meshes on their own draws after its look changed, so a flash or a fade does not rebuild batches every frame. */
const SETTLE_PASSES = 90;

const BASE = THREE.Object3D.prototype;

interface BatchGroup {
  readonly key: string;
  readonly mesh: THREE.BatchedMesh;
  readonly material: THREE.Material;
  readonly geometries: Map<THREE.BufferGeometry, { id: number; refs: number }>;
  vertexCapacity: number;
  indexCapacity: number;
  instances: number;
  shown: number;
}

/** What a source material looked like when its meshes were batched, compared once per pass. */
class MaterialRecord {
  readonly entries = new Set<DrawEntry>();
  checked = -1;
  version: number;
  signature: string | null;
  /** Pass until which the material's meshes keep their own draws after a change. */
  settleUntil = -1;
  private keys: string[] = [];
  /** Per key what it held at the snapshot: a plain value, a colour, a texture or a 2-vector. */
  private kinds: ValueKind[] = [];
  private values: unknown[] = [];

  constructor(readonly material: THREE.Material) {
    this.version = material.version;
    this.signature = materialSignature(material);
    this.snapshot();
  }

  /**
   * True when anything a draw reads changed since the last snapshot (and takes a new one). Runs for
   * every batched material every pass, so it reads by the kinds the snapshot found rather than testing
   * each value's class again.
   */
  changed(): boolean {
    const material = this.material;
    if (material.version !== this.version) return this.resnap();
    const { keys, kinds, values } = this;
    let at = 0;
    for (let index = 0; index < keys.length; index += 1) {
      const value: unknown = Reflect.get(material, keys[index] ?? "");
      switch (kinds[index]) {
        case ValueKind.Color: {
          const color = value as THREE.Color;
          if (values[at] !== color || values[at + 1] !== color.r || values[at + 2] !== color.g || values[at + 3] !== color.b) return this.resnap();
          at += 4;
          break;
        }
        case ValueKind.Texture: {
          const texture = value as THREE.Texture;
          if (values[at] !== texture || values[at + 1] !== texture.offset.x || values[at + 2] !== texture.offset.y ||
            values[at + 3] !== texture.repeat.x || values[at + 4] !== texture.repeat.y || values[at + 5] !== texture.rotation) return this.resnap();
          at += 6;
          break;
        }
        case ValueKind.Vector2: {
          const vector = value as THREE.Vector2;
          if (values[at] !== vector || values[at + 1] !== vector.x || values[at + 2] !== vector.y) return this.resnap();
          at += 3;
          break;
        }
        default:
          if (values[at] !== value) return this.resnap();
          at += 1;
      }
    }
    return false;
  }

  private resnap(): true {
    this.version = this.material.version;
    this.snapshot();
    return true;
  }

  private snapshot(): void {
    const material = this.material;
    const keys: string[] = [];
    const kinds: ValueKind[] = [];
    const values: unknown[] = [];
    for (const key of Object.keys(material)) {
      if (key.startsWith("_") || key === "uuid" || key === "name" || key === "id" || key === "userData" || key === "version") continue;
      const value: unknown = Reflect.get(material, key);
      if (value instanceof THREE.Color) {
        kinds.push(ValueKind.Color);
        values.push(value, value.r, value.g, value.b);
      } else if (value instanceof THREE.Texture) {
        kinds.push(ValueKind.Texture);
        values.push(value, value.offset.x, value.offset.y, value.repeat.x, value.repeat.y, value.rotation);
      } else if (value instanceof THREE.Vector2) {
        kinds.push(ValueKind.Vector2);
        values.push(value, value.x, value.y);
      } else if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
        kinds.push(ValueKind.Plain);
        values.push(value);
      } else continue;
      keys.push(key);
    }
    this.keys = keys;
    this.kinds = kinds;
    this.values = values;
  }
}

const enum ValueKind {
  Plain,
  Color,
  Texture,
  Vector2,
}

class DrawEntry {
  group: BatchGroup | null = null;
  instance = -1;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  record: MaterialRecord | null = null;
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
  seen = -1;
  shown = false;
  /** Pass at which a mesh drawn on its own is asked again. */
  retryAt = 0;
  /** Index in the batcher's entry list, for removal by swap. */
  slot = -1;
  /** Why it draws on its own, when it does. */
  reason = "new";

  constructor(readonly mesh: THREE.Mesh) {
    this.geometry = mesh.geometry;
    this.material = mesh.material;
    this.castShadow = mesh.castShadow;
    this.receiveShadow = mesh.receiveShadow;
    this.renderOrder = mesh.renderOrder;
  }

  /** Whether anything the batch key or the draw is made of changed since the mesh was placed. */
  drifted(): boolean {
    const mesh = this.mesh;
    return mesh.geometry !== this.geometry || mesh.material !== this.material || mesh.castShadow !== this.castShadow ||
      mesh.receiveShadow !== this.receiveShadow || mesh.renderOrder !== this.renderOrder;
  }
}

/** What a {@link DrawBatcher} holds, for the devtools probe and perf scripts. @internal */
export interface DrawBatchStats {
  /** Meshes drawn through a batch. */
  batched: number;
  /** Meshes the pass met that draw on their own (a shape the batch cannot take, or settling after a change). */
  single: number;
  /** Batches, and those drawing at least one instance this frame. */
  batches: number;
  drawn: number;
  /** Instances shown across every batch. */
  shown: number;
  /** Meshes on their own draw by the first rule each broke (`settling` for a material whose look just changed). */
  reasons: Record<string, number>;
}

/** The per-mesh hook the scene's matrix pass calls. @internal */
export interface ShownMeshVisitor {
  /** One plain mesh the pass reached: `moved` when its world matrix was rebuilt, `shown` when it and every ancestor are visible. */
  visit(mesh: THREE.Mesh, moved: boolean, shown: boolean): void;
  /** After the pass: hide what it did not reach. */
  endPass(): void;
}

/** Why the last {@link batchKeyOf} call gave null, for the probe: the first rule the mesh broke. */
let rejection = "";

function reject(reason: string): null {
  rejection = reason;
  return null;
}

/** Whether a mesh's batch would draw exactly what three draws for it, and if so the batch it joins. */
function batchKeyOf(mesh: THREE.Mesh): string | null {
  if (mesh.layers.mask !== DEFAULT_MASK) return reject("layers");
  if (!mesh.frustumCulled) return reject("unculled");
  if (!mesh.matrixWorldAutoUpdate) return reject("handWorldMatrix");
  if (mesh.onBeforeRender !== BASE.onBeforeRender || mesh.onAfterRender !== BASE.onAfterRender) return reject("renderHook");
  if (mesh.onBeforeShadow !== BASE.onBeforeShadow || mesh.onAfterShadow !== BASE.onAfterShadow) return reject("shadowHook");
  if (mesh.customDepthMaterial !== undefined || mesh.customDistanceMaterial !== undefined) return reject("customDepth");
  if (mesh.matrixWorld.determinant() <= 0) return reject("mirrored");
  if (geometryLayout(mesh.geometry) === null) return reject("geometry");
  const material = mesh.material;
  if (Array.isArray(material)) return reject("multiMaterial");
  if (material.transparent) return reject("transparent");
  if (material instanceof THREE.ShaderMaterial) return reject("shaderMaterial");
  if (!compilesBatched(material)) return reject("compileHook");
  const signature = materialSignature(material);
  if (signature === null) return reject("materialValue");
  for (let node: THREE.Object3D | null = mesh; node !== null; node = node.parent) if (isPostfxOverlay(node)) return reject("overlay");
  return `${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}#${mesh.renderOrder}#${geometryLayout(mesh.geometry) ?? ""}#${signature}`;
}

function vertexCount(geometry: THREE.BufferGeometry): number {
  return geometry.getAttribute("position").count;
}

/**
 * The scene's one draw path for plain meshes: every mesh its matrix pass reaches that a shared draw
 * can take (one material, opaque, no per-object hooks) joins a `BatchedMesh` per material signature,
 * shadow flags and vertex layout, whatever model or system made it. A street of cars cut from one
 * palette draws once per material instead of once per car and part, in the scene pass and in every
 * shadow cascade. The batch culls instance by instance against each camera as three culls meshes,
 * and per frame the pass hands it only what moved or changed visibility, so a still mesh costs a compare.
 *
 * The mesh stays in the scene as the thing games move, pick and parent; it moves to
 * {@link BATCHED_SOURCE_LAYER} so three's own passes skip it. Per-mesh state lives here, never on the mesh.
 * @internal
 */
export class DrawBatcher implements ShownMeshVisitor {
  private readonly entries = new WeakMap<THREE.Mesh, DrawEntry>();
  private readonly list: DrawEntry[] = [];
  private readonly groups = new Map<string, BatchGroup>();
  private readonly emptied = new Lingering<string, BatchGroup>((group) => this.disposeGroup(group));
  private readonly materials = new Map<string, { material: THREE.Material; refs: number }>();
  private readonly records = new WeakMap<THREE.Material, MaterialRecord>();
  private pass = 0;
  private enabled = true;

  constructor(private readonly parent: THREE.Object3D) {}

  /** Turn batching on or off; off gives every mesh its own draw back. */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.releaseAll();
  }

  visit(mesh: THREE.Mesh, moved: boolean, shown: boolean): void {
    if (!this.enabled) return;
    const flags = mesh as THREE.Mesh & Partial<THREE.SkinnedMesh & THREE.InstancedMesh & THREE.BatchedMesh>;
    if (flags.isSkinnedMesh === true || flags.isInstancedMesh === true || flags.isBatchedMesh === true) return;
    const pass = this.pass;
    let entry = this.entries.get(mesh);
    if (entry === undefined) {
      entry = new DrawEntry(mesh);
      entry.slot = this.list.length;
      this.list.push(entry);
      this.entries.set(mesh, entry);
      this.place(entry);
      moved = true;
    } else if (entry.group === null) {
      if (pass < entry.retryAt && !entry.drifted()) {
        entry.seen = pass;
        return;
      }
      entry.geometry = mesh.geometry;
      entry.material = mesh.material;
      entry.castShadow = mesh.castShadow;
      entry.receiveShadow = mesh.receiveShadow;
      entry.renderOrder = mesh.renderOrder;
      this.place(entry);
      moved = true;
    } else if (entry.drifted() || mesh.layers.mask !== BATCHED_SOURCE_MASK || mesh.onBeforeRender !== BASE.onBeforeRender || !mesh.frustumCulled) {
      this.unplace(entry);
      entry.geometry = mesh.geometry;
      entry.material = mesh.material;
      entry.castShadow = mesh.castShadow;
      entry.receiveShadow = mesh.receiveShadow;
      entry.renderOrder = mesh.renderOrder;
      this.place(entry);
      moved = true;
    }
    entry.seen = pass;
    const record = entry.record;
    if (record !== null && record.checked !== pass) {
      record.checked = pass;
      if (record.changed()) this.unsettle(record);
    }
    const group = entry.group;
    if (group === null) return;
    if (moved) {
      if (mesh.matrixWorld.determinant() <= 0) {
        this.unplace(entry);
        entry.retryAt = pass + RETRY_AFTER_PASSES;
        entry.reason = "mirrored";
        return;
      }
      group.mesh.setMatrixAt(entry.instance, mesh.matrixWorld);
    }
    if (shown !== entry.shown) this.show(entry, group, shown);
  }

  endPass(): void {
    const pass = this.pass++;
    const list = this.list;
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const entry = list[index];
      if (entry === undefined || entry.seen === pass) continue;
      if (entry.group !== null && entry.shown) this.show(entry, entry.group, false);
      if (pass - entry.seen < RELEASE_AFTER_PASSES) continue;
      this.unplace(entry);
      this.forget(entry);
    }
  }

  /** What the batcher holds right now. */
  stats(): DrawBatchStats {
    let batched = 0;
    for (const entry of this.list) if (entry.group !== null) batched += 1;
    let drawn = 0;
    let shown = 0;
    for (const group of this.groups.values()) {
      if (group.shown > 0) drawn += 1;
      shown += group.shown;
    }
    const reasons: Record<string, number> = {};
    for (const entry of this.list) if (entry.group === null) reasons[entry.reason] = (reasons[entry.reason] ?? 0) + 1;
    return { batched, single: this.list.length - batched, batches: this.groups.size, drawn, shown, reasons };
  }

  /** Give every mesh its own draw back and free every batch. */
  dispose(): void {
    this.releaseAll();
    this.emptied.flush();
  }

  private releaseAll(): void {
    for (let index = this.list.length - 1; index >= 0; index -= 1) {
      const entry = this.list[index];
      if (entry === undefined) continue;
      this.unplace(entry);
      this.forget(entry);
    }
  }

  private forget(entry: DrawEntry): void {
    const list = this.list;
    const last = list.pop();
    if (last !== undefined && last !== entry) {
      list[entry.slot] = last;
      last.slot = entry.slot;
    }
    entry.slot = -1;
    this.entries.delete(entry.mesh);
  }

  private show(entry: DrawEntry, group: BatchGroup, shown: boolean): void {
    entry.shown = shown;
    group.mesh.setVisibleAt(entry.instance, shown);
    group.shown += shown ? 1 : -1;
    group.mesh.visible = group.shown > 0;
  }

  /** A material's look changed: its meshes draw on their own until it holds still, then rejoin a batch matching it. */
  private unsettle(record: MaterialRecord): void {
    record.settleUntil = this.pass + SETTLE_PASSES;
    for (const entry of [...record.entries]) {
      this.unplace(entry);
      entry.retryAt = record.settleUntil;
      entry.reason = "settling";
    }
  }

  private place(entry: DrawEntry): void {
    const mesh = entry.mesh;
    const material = mesh.material;
    const known = Array.isArray(material) ? undefined : this.records.get(material);
    if (known !== undefined && this.pass < known.settleUntil) {
      entry.retryAt = known.settleUntil;
      entry.reason = "settling";
      return;
    }
    const key = batchKeyOf(mesh);
    if (key === null || Array.isArray(material)) {
      entry.retryAt = this.pass + RETRY_AFTER_PASSES;
      entry.reason = key === null ? rejection : "multiMaterial";
      return;
    }
    let record = known;
    if (record === undefined) {
      record = new MaterialRecord(material);
      this.records.set(material, record);
    }
    let group = this.groups.get(key);
    if (group === undefined) {
      const emptied = this.emptied.take(key);
      if (emptied !== undefined) this.parent.add(emptied.mesh);
      group = emptied ?? this.createGroup(key, mesh, material);
      this.groups.set(key, group);
    }
    const geometry = batchableGeometry(mesh.geometry);
    const geometryId = this.addGeometry(group, geometry);
    const batch = group.mesh;
    if (batch.instanceCount >= batch.maxInstanceCount) batch.setInstanceCount(batch.maxInstanceCount * 2);
    const instance = batch.addInstance(geometryId);
    batch.setVisibleAt(instance, false);
    group.instances += 1;
    entry.group = group;
    entry.instance = instance;
    entry.shown = false;
    entry.record = record;
    record.entries.add(entry);
    mesh.layers.mask = BATCHED_SOURCE_MASK;
  }

  private unplace(entry: DrawEntry): void {
    const group = entry.group;
    if (group === null) return;
    if (entry.shown) this.show(entry, group, false);
    group.mesh.deleteInstance(entry.instance);
    group.instances -= 1;
    const geometry = batchableGeometry(entry.geometry);
    const known = group.geometries.get(geometry);
    if (known !== undefined && --known.refs === 0) {
      group.mesh.deleteGeometry(known.id);
      group.geometries.delete(geometry);
    }
    entry.record?.entries.delete(entry);
    entry.record = null;
    entry.group = null;
    entry.instance = -1;
    if (entry.mesh.layers.mask === BATCHED_SOURCE_MASK) entry.mesh.layers.mask = DEFAULT_MASK;
    if (group.instances > 0) return;
    group.mesh.removeFromParent();
    this.groups.delete(group.key);
    this.emptied.park(group.key, group);
  }

  private createGroup(key: string, mesh: THREE.Mesh, material: THREE.Material): BatchGroup {
    const geometry = batchableGeometry(mesh.geometry);
    const vertexCapacity = Math.max(1024, vertexCount(geometry) * 4);
    const indexCapacity = Math.max(2048, (geometry.index?.count ?? 0) * 4);
    // One copy per signature and layout, shared by every batch made from it (a batch per shadow flag).
    const materialKey = key.slice(key.indexOf("#", key.indexOf("#") + 1) + 1);
    let shared = this.materials.get(materialKey);
    if (shared === undefined) {
      shared = { material: withoutCompileLayers(material), refs: 0 };
      this.materials.set(materialKey, shared);
    }
    shared.refs += 1;
    const batch = new THREE.BatchedMesh(64, vertexCapacity, indexCapacity, shared.material);
    batch.castShadow = mesh.castShadow;
    batch.receiveShadow = mesh.receiveShadow;
    batch.renderOrder = mesh.renderOrder;
    // Instances move anywhere, so the batch has no bounds of its own; it culls each instance per camera.
    batch.frustumCulled = false;
    batch.perObjectFrustumCulled = true;
    batch.userData[DRAW_BATCH_MESH_KEY] = true;
    // Picking hits the source meshes, which stay in the scene; the batch is only their picture.
    batch.raycast = () => {};
    mirrorSourceTextures(batch, material, shared.material);
    batch.visible = false;
    this.parent.add(batch);
    freezeStaticTransforms(batch);
    return { key, mesh: batch, material: shared.material, geometries: new Map(), vertexCapacity, indexCapacity, instances: 0, shown: 0 };
  }

  private disposeGroup(group: BatchGroup): void {
    group.mesh.removeFromParent();
    group.mesh.dispose();
    const materialKey = group.key.slice(group.key.indexOf("#", group.key.indexOf("#") + 1) + 1);
    const shared = this.materials.get(materialKey);
    if (shared === undefined || --shared.refs > 0) return;
    this.materials.delete(materialKey);
    shared.material.dispose();
  }

  private addGeometry(group: BatchGroup, geometry: THREE.BufferGeometry): number {
    const known = group.geometries.get(geometry);
    if (known !== undefined) {
      known.refs += 1;
      return known.id;
    }
    const vertices = vertexCount(geometry);
    const indices = geometry.index?.count ?? 0;
    const batch = group.mesh;
    const fits = () => vertices <= batch.unusedVertexCount && indices <= batch.unusedIndexCount;
    if (!fits()) batch.optimize();
    if (!fits()) {
      const usedVertices = group.vertexCapacity - batch.unusedVertexCount;
      const usedIndices = group.indexCapacity - batch.unusedIndexCount;
      group.vertexCapacity = Math.max(group.vertexCapacity * 2, usedVertices + vertices);
      group.indexCapacity = Math.max(group.indexCapacity * 2, usedIndices + indices);
      batch.setGeometrySize(group.vertexCapacity, group.indexCapacity);
    }
    const id = batch.addGeometry(geometry);
    group.geometries.set(geometry, { id, refs: 1 });
    return id;
  }
}

const batchers = new WeakMap<THREE.Object3D, DrawBatcher>();

/** The draw batcher of a scene, or null when the scene draws every mesh on its own. @internal */
export function drawBatcherOf(scene: THREE.Object3D): DrawBatcher | null {
  return batchers.get(scene) ?? null;
}

/**
 * Draw the scene's plain meshes through a {@link DrawBatcher}, fed by the scene's matrix pass
 * (`skipCulledMatrices`), and let `raycaster` (the canvas's pointer raycaster) keep hitting them.
 * @internal
 */
export function batchSceneDraws(scene: THREE.Object3D, raycaster: THREE.Raycaster): DrawBatcher {
  let batcher = batchers.get(scene);
  if (batcher === undefined) {
    batcher = new DrawBatcher(scene);
    batchers.set(scene, batcher);
    visitShownMeshes(scene, batcher);
    const probe = batcher;
    devtools.probes.registerSystem("render/drawBatches", {
      counters: () => {
        const { reasons, ...stats } = probe.stats();
        const counters: Record<string, number> = { ...stats };
        for (const [reason, count] of Object.entries(reasons)) counters[`single.${reason}`] = count;
        return counters;
      },
      state: () => {
        const stats = probe.stats();
        return `${stats.batched} meshes in ${stats.batches} batches (${stats.drawn} drawn) · ${stats.single} on their own`;
      },
    });
  }
  raycaster.layers.enable(BATCHED_SOURCE_LAYER);
  return batcher;
}

/**
 * A raycaster that hits every mesh the player sees, the ones a draw batch draws included. Use it for
 * any ray cast against visible scene meshes (camera collision, surface hits, editor picking).
 */
export function sceneRaycaster(): THREE.Raycaster {
  const raycaster = new THREE.Raycaster();
  raycaster.layers.enable(BATCHED_SOURCE_LAYER);
  return raycaster;
}
