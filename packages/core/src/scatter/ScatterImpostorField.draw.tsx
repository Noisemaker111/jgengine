import { memo } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import { impostorCard, impostorDistance, impostorSettingsForQuality, impostorSwitch, acquireImpostor, releaseImpostor, type ImpostorEntry } from "@jgengine/core/lod/impostor.draw";
import { warmupWaitsFor } from "@jgengine/core/render/shaderWarmup.draw";
import { uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import { terrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import type { ScatterBatch } from "./InstancedScatter.draw";
import type { ScatterModelSource } from "./scatterModels.draw";
import { freezeStaticTransforms } from "@jgengine/core/model/staticTransforms.draw";

/** Camera travel in metres before the near/far split is recomputed. */
const SPLIT_MOVE = 1;

/**
 * Marks each placement near (0) or far (1) from `camera`, holding the switch band so a placement at
 * its threshold does not flicker. Returns how many are far and whether any placement switched, so a
 * chunk nobody crossed a threshold in keeps its uploaded instances.
 * @internal
 */
export function markFarPlacements(
  instances: readonly { x: number; y: number; z: number }[],
  thresholds: readonly number[],
  flags: Uint8Array,
  camera: { x: number; y: number; z: number },
): { far: number; changed: boolean } {
  let far = 0;
  let changed = false;
  const cx = camera.x, cy = camera.y, cz = camera.z;
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index]!;
    const dx = instance.x - cx;
    const dy = instance.y - cy;
    const dz = instance.z - cz;
    const isFar = impostorSwitch(Math.sqrt(dx * dx + dy * dy + dz * dz), thresholds[index]!, flags[index] === 1);
    const flag = isFar ? 1 : 0;
    if (flags[index] !== flag) changed = true;
    flags[index] = flag;
    if (isFar) far += 1;
  }
  return { far, changed };
}

export interface ScatterImpostorFieldDrawOptions {
  cacheKey: string;
  sources: readonly ScatterModelSource[];
  /** What the far card is baked from when it is not `sources` — variants of one species share one atlas. */
  farSources?: readonly ScatterModelSource[] | undefined;
  batches: readonly ScatterBatch[];
  radius: number;
}

/**
 * Draw-side form of {@link ScatterImpostorField}: near placements draw the real model per chunk and
 * far ones one camera-facing impostor card for the whole species. Batches are fixed for the draw's
 * life; terrain-quality changes re-acquire the impostor entry and rebuild the split.
 * @internal
 */
export function scatterImpostorFieldDraw(options: ScatterImpostorFieldDrawOptions): EngineDraw {
  const { cacheKey, sources, farSources, batches, radius } = options;
  const bakeSources = farSources ?? sources;

  interface NearDraw {
    mesh: THREE.InstancedMesh;
    batchIndex: number;
    composed: Float32Array;
    kept: Uint32Array;
  }

  const near: NearDraw[] = [];
  const flags = batches.map((batch) => new Uint8Array(batch.instances.length));
  const dirty = new Uint8Array(batches.length);
  const farMatrices: THREE.Matrix4[] = [];
  const camera = new THREE.Vector3();
  const lastSplit = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0);
  let quality = terrainQuality();
  let settings = impostorSettingsForQuality(quality);
  let thresholds = batches.map((batch) => batch.instances.map((instance) => impostorDistance(radius * instance.scale, quality)));
  let entry: ImpostorEntry | null = null;
  let entryLive = false;
  let far: THREE.InstancedMesh | null = null;
  /** The far mesh the last split wrote: a card mesh that lands or drops re-splits without a camera move. */
  let splitFar: THREE.InstancedMesh | null = null;
  let releaseLanded = (): void => {};
  let state: EngineFrameState | null = null;

  const dropFar = () => {
    if (far === null) return;
    far.parent?.remove(far);
    far.geometry.dispose();
    far.dispose();
    far = null;
  };

  const buildFar = () => {
    dropFar();
    if (entry === null || entry.atlas === null || entry.materials === null || state === null) return;
    const mesh = new THREE.InstancedMesh(impostorCard(entry.atlas), entry.materials.material, Math.ceil(batches.reduce((sum, batch) => sum + batch.matrices.length, 0) / 256) * 256);
    mesh.name = `impostor-far:${cacheKey}`;
    mesh.customDepthMaterial = entry.materials.depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    uploadInstances(mesh, []);
    freezeStaticTransforms(mesh);
    state.scene.add(mesh);
    far = mesh;
  };

  const acquire = (mountState: EngineFrameState) => {
    entry = acquireImpostor(cacheKey, mountState.gl, bakeSources, settings);
    entryLive = true;
    if (entry.baked) buildFar();
    else {
      const acquired = entry;
      // The covered warmup waits for the bake and for the cards built from it to be in the scene,
      // so a reveal never links the card program mid-frame. Released on every path out.
      let release = (): void => {};
      warmupWaitsFor(mountState.rootScene ?? mountState.scene, new Promise<void>((resolve) => { release = resolve; }), `scatter impostor ${cacheKey}`);
      releaseLanded = release;
      void acquired.ready.then(() => {
        if (entryLive && entry === acquired) buildFar();
        release();
      });
    }
  };

  const syncQuality = (mountState: EngineFrameState) => {
    const next = terrainQuality();
    if (next === quality) return;
    quality = next;
    const previous = settings;
    settings = impostorSettingsForQuality(quality);
    thresholds = batches.map((batch) => batch.instances.map((instance) => impostorDistance(radius * instance.scale, quality)));
    releaseLanded();
    if (entryLive && entry !== null) releaseImpostor(cacheKey, mountState.gl, previous);
    entryLive = false;
    dropFar();
    lastSplit.set(Number.POSITIVE_INFINITY, 0, 0);
    acquire(mountState);
  };

  return {
    priority: CAMERA_POST_FRAME_PRIORITY + 0.1,
    mount(mountState: EngineFrameState) {
      state = mountState;
      // Near draws are cached per batch object: a batch that comes back unchanged keeps its mesh.
      batches.forEach((batch, batchIndex) => {
        sources.forEach((source) => {
          const mesh = new THREE.InstancedMesh(source.geometry, source.material, batch.matrices.length);
          mesh.name = `impostor:${cacheKey}`;
          mesh.castShadow = source.skipShadow !== true && (source.castShadow ?? true);
          mesh.receiveShadow = source.receiveShadow ?? true;
          const composed = new Float32Array(batch.matrices.length * 16);
          const scratch = new THREE.Matrix4();
          batch.matrices.forEach((matrix, index) => composed.set(scratch.multiplyMatrices(matrix, source.localMatrix).elements, index * 16));
          uploadInstances(mesh, { count: batch.matrices.length, at: (slot, out) => out.fromArray(composed, slot * 16) });
          freezeStaticTransforms(mesh);
          mountState.scene.add(mesh);
          near.push({ mesh, batchIndex, composed, kept: new Uint32Array(batch.matrices.length) });
        });
      });
      acquire(mountState);
    },
    update(mountState: EngineFrameState) {
      syncQuality(mountState);
    },
    frame(frameState: EngineFrameState) {
      syncQuality(frameState);
      frameState.camera.getWorldPosition(camera);
      const fresh = splitFar !== far;
      if (!fresh && lastSplit.distanceToSquared(camera) < SPLIT_MOVE * SPLIT_MOVE) return;
      splitFar = far;
      lastSplit.copy(camera);
      let anyDirty = false;
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex]!;
        const batchFlags = flags[batchIndex]!;
        if (far === null) {
          dirty[batchIndex] = batchFlags.includes(1) || fresh ? 1 : 0;
          batchFlags.fill(0);
        } else {
          dirty[batchIndex] = markFarPlacements(batch.instances, thresholds[batchIndex]!, batchFlags, camera).changed || fresh ? 1 : 0;
        }
        if (dirty[batchIndex] === 1) anyDirty = true;
      }
      // No placement crossed its switch distance: the near draws and the far list are what they were.
      if (!anyDirty) return;
      if (far !== null) {
        farMatrices.length = 0;
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
          const batchFlags = flags[batchIndex]!;
          const matrices = batches[batchIndex]!.matrices;
          for (let index = 0; index < batchFlags.length; index += 1) if (batchFlags[index] === 1) farMatrices.push(matrices[index]!);
        }
      }
      // Only chunks where a placement crossed its switch distance re-upload their near draws.
      for (const draw of near) {
        if (dirty[draw.batchIndex] !== 1) continue;
        const batchFlags = flags[draw.batchIndex]!;
        let count = 0;
        for (let index = 0; index < batchFlags.length; index += 1) if (batchFlags[index] !== 1) draw.kept[count++] = index;
        uploadInstances(draw.mesh, { count, at: (slot, out) => out.fromArray(draw.composed, draw.kept[slot]! * 16) });
      }
      if (far !== null) uploadInstances(far, farMatrices);
    },
    dispose(disposeState: EngineFrameState) {
      releaseLanded();
      if (entryLive && entry !== null) releaseImpostor(cacheKey, disposeState.gl, settings);
      entryLive = false;
      entry = null;
      dropFar();
      for (const draw of near) {
        draw.mesh.parent?.remove(draw.mesh);
        draw.mesh.dispose();
      }
      near.length = 0;
      state = null;
    },
  };
}

/**
 * One scatter species with a far field: placements near the camera draw the real model per chunk, and
 * every placement past the switch distance draws as one camera-facing impostor card in a single
 * instanced draw for the whole species. The split is recomputed only when the camera moves.
 * @internal
 */
export const ScatterImpostorField = memo(function ScatterImpostorField(props: ScatterImpostorFieldDrawOptions) {
  useEngineDraw(() => scatterImpostorFieldDraw(props), [props.cacheKey, props.sources, props.farSources, props.batches, props.radius]);
  return null;
});
