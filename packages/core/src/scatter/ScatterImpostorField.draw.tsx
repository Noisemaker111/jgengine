import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import { acquireImpostor, impostorCard, impostorDistance, impostorSettingsForQuality, impostorSwitch, releaseImpostor, type ImpostorEntry } from "@jgengine/core/lod/impostor.draw";
import { uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import { useTerrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import type { ScatterBatch } from "./InstancedScatter.draw";
import type { ScatterModelSource } from "./scatterModels.draw";
import { freezeStaticTransforms } from "@jgengine/core/model/staticTransforms.draw";

/** Camera travel in metres before the near/far split is recomputed. */
const SPLIT_MOVE = 1;

interface NearDraw {
  mesh: THREE.InstancedMesh;
  /** Index of this draw's batch in `batches`. */
  batchIndex: number;
  /** Placement × source matrices, composed once. */
  composed: Float32Array;
  /** Scratch: which placements this frame keeps near, in draw order. */
  kept: Uint32Array;
}

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

/**
 * One scatter species with a far field: placements near the camera draw the real model per chunk, and
 * every placement past the switch distance draws as one camera-facing impostor card in a single
 * instanced draw for the whole species. The split is recomputed only when the camera moves.
 * @internal
 */
export function ScatterImpostorField({ cacheKey, sources, farSources, batches, radius }: {
  cacheKey: string;
  sources: readonly ScatterModelSource[];
  /** What the far card is baked from when it is not `sources` — variants of one species share one atlas. */
  farSources?: readonly ScatterModelSource[] | undefined;
  batches: readonly ScatterBatch[];
  radius: number;
}) {
  const gl = useThree((state) => state.gl);
  const quality = useTerrainQuality();
  const settings = useMemo(() => impostorSettingsForQuality(quality), [quality]);
  const [entry, setEntry] = useState<ImpostorEntry | null>(null);
  useEffect(() => {
    const acquired = acquireImpostor(cacheKey, gl, farSources ?? sources, settings);
    setEntry(acquired);
    return () => releaseImpostor(cacheKey, gl, settings);
  }, [cacheKey, gl, sources, farSources, settings]);

  // Near draws are cached per batch object: a batch that comes back unchanged (every chunk but the one
  // a felled tree stood in) keeps its mesh, so clearing a placement does not rebuild the species.
  const cache = useMemo(() => new Map<ScatterBatch, NearDraw[]>(), [sources]);
  const near = useMemo<NearDraw[]>(() => {
    const live = new Set(batches);
    for (const [batch, draws] of cache) {
      if (live.has(batch)) continue;
      draws.forEach((draw) => draw.mesh.dispose());
      cache.delete(batch);
    }
    return batches.flatMap((batch, batchIndex) => {
      const cached = cache.get(batch);
      if (cached !== undefined) {
        cached.forEach((draw) => { draw.batchIndex = batchIndex; });
        return cached;
      }
      const draws = sources.map((source) => {
        const mesh = new THREE.InstancedMesh(source.geometry, source.material, batch.matrices.length);
        mesh.castShadow = source.skipShadow !== true && (source.castShadow ?? true);
        mesh.receiveShadow = source.receiveShadow ?? true;
        const composed = new Float32Array(batch.matrices.length * 16);
        const scratch = new THREE.Matrix4();
        batch.matrices.forEach((matrix, index) => composed.set(scratch.multiplyMatrices(matrix, source.localMatrix).elements, index * 16));
        uploadInstances(mesh, { count: batch.matrices.length, at: (slot, out) => out.fromArray(composed, slot * 16) });
        return { mesh, batchIndex, composed, kept: new Uint32Array(batch.matrices.length) };
      });
      cache.set(batch, draws);
      return draws;
    });
  }, [batches, sources, cache]);
  useLayoutEffect(() => {
    for (const draw of near) freezeStaticTransforms(draw.mesh);
  }, [near]);
  useEffect(() => () => cache.forEach((draws) => draws.forEach((draw) => draw.mesh.dispose())), [cache]);

  // Capacity in steps of 256, so hiding a few placements (felled trees, hero meshes) keeps the far mesh.
  const total = useMemo(() => Math.ceil(batches.reduce((sum, batch) => sum + batch.matrices.length, 0) / 256) * 256, [batches]);
  const far = useMemo(() => {
    if (entry?.atlas == null || entry.materials === null) return null;
    const mesh = new THREE.InstancedMesh(impostorCard(entry.atlas), entry.materials.material, total);
    mesh.customDepthMaterial = entry.materials.depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    uploadInstances(mesh, []);
    return mesh;
  }, [entry, total]);
  useLayoutEffect(() => {
    if (far !== null) freezeStaticTransforms(far);
  }, [far]);
  useEffect(() => () => { far?.geometry.dispose(); far?.dispose(); }, [far]);

  const flags = useMemo(() => batches.map((batch) => new Uint8Array(batch.instances.length)), [batches]);
  const lastBatches = useRef<readonly ScatterBatch[] | null>(null);
  const dirty = useMemo(() => new Uint8Array(batches.length), [batches]);
  const farMatrices = useMemo<THREE.Matrix4[]>(() => [], []);
  const lastSplit = useRef<THREE.Vector3 | null>(null);
  const lastFar = useRef<THREE.InstancedMesh | null>(null);
  const camera = useMemo(() => new THREE.Vector3(), []);
  const thresholds = useMemo(() => batches.map((batch) => batch.instances.map((instance) => impostorDistance(radius * instance.scale, quality))), [batches, radius, quality]);

  useFrame((state) => {
    state.camera.getWorldPosition(camera);
    const fresh = lastFar.current !== far || lastBatches.current !== batches;
    lastBatches.current = batches;
    if (!fresh && lastSplit.current !== null && lastSplit.current.distanceToSquared(camera) < SPLIT_MOVE * SPLIT_MOVE) return;
    lastFar.current = far;
    lastSplit.current = (lastSplit.current ?? new THREE.Vector3()).copy(camera);
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
  }, CAMERA_POST_FRAME_PRIORITY + 0.1);

  return (
    <>
      {near.map((draw, index) => <primitive key={index} object={draw.mesh} />)}
      {far === null ? null : <primitive object={far} />}
    </>
  );
}
