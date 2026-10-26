import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/shell/camera/cameraRigs";
import { acquireImpostor, impostorCard, impostorDistance, impostorSettingsForQuality, impostorSwitch, releaseImpostor, type ImpostorEntry } from "@jgengine/core/lod/impostor.draw";
import { uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import { useTerrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import type { ScatterBatch } from "./InstancedScatter.draw";
import type { ScatterModelSource } from "./scatterModels.draw";

/** Camera travel in metres before the near/far split is recomputed. */
const SPLIT_MOVE = 1;

interface NearDraw {
  mesh: THREE.InstancedMesh;
  batch: ScatterBatch;
  /** Placement × source matrices, composed once. */
  composed: Float32Array;
  /** Scratch: which placements this frame keeps near, in draw order. */
  kept: Uint32Array;
}

/**
 * Marks each placement near (0) or far (1) from `camera`, holding the switch band so a placement at
 * its threshold does not flicker, and returns how many are far.
 * @internal
 */
export function markFarPlacements(
  instances: readonly { x: number; y: number; z: number }[],
  thresholds: readonly number[],
  flags: Uint8Array,
  camera: { x: number; y: number; z: number },
): number {
  let far = 0;
  instances.forEach((instance, index) => {
    const dx = instance.x - camera.x;
    const dy = instance.y - camera.y;
    const dz = instance.z - camera.z;
    const isFar = impostorSwitch(Math.sqrt(dx * dx + dy * dy + dz * dz), thresholds[index]!, flags[index] === 1);
    flags[index] = isFar ? 1 : 0;
    if (isFar) far += 1;
  });
  return far;
}

/**
 * One scatter species with a far field: placements near the camera draw the real model per chunk, and
 * every placement past the switch distance draws as one camera-facing impostor card in a single
 * instanced draw for the whole species. The split is recomputed only when the camera moves.
 * @internal
 */
export function ScatterImpostorField({ cacheKey, sources, batches, radius }: {
  cacheKey: string;
  sources: readonly ScatterModelSource[];
  batches: readonly ScatterBatch[];
  radius: number;
}) {
  const gl = useThree((state) => state.gl);
  const quality = useTerrainQuality();
  const settings = useMemo(() => impostorSettingsForQuality(quality), [quality]);
  const [entry, setEntry] = useState<ImpostorEntry | null>(null);
  useEffect(() => {
    const acquired = acquireImpostor(cacheKey, gl, sources, settings);
    setEntry(acquired);
    return () => releaseImpostor(cacheKey, settings);
  }, [cacheKey, gl, sources, settings]);

  const near = useMemo<NearDraw[]>(() => batches.flatMap((batch) => sources.map((source) => {
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, batch.matrices.length);
    mesh.castShadow = source.castShadow ?? true;
    mesh.receiveShadow = source.receiveShadow ?? true;
    const composed = new Float32Array(batch.matrices.length * 16);
    const scratch = new THREE.Matrix4();
    batch.matrices.forEach((matrix, index) => composed.set(scratch.multiplyMatrices(matrix, source.localMatrix).elements, index * 16));
    return { mesh, batch, composed, kept: new Uint32Array(batch.matrices.length) };
  })), [batches, sources]);
  useEffect(() => () => near.forEach((draw) => draw.mesh.dispose()), [near]);

  const total = useMemo(() => batches.reduce((sum, batch) => sum + batch.matrices.length, 0), [batches]);
  const far = useMemo(() => {
    if (entry?.atlas == null || entry.materials === null) return null;
    const mesh = new THREE.InstancedMesh(impostorCard(entry.atlas), entry.materials.material, total);
    mesh.customDepthMaterial = entry.materials.depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    uploadInstances(mesh, []);
    return mesh;
  }, [entry, total]);
  useEffect(() => () => { far?.geometry.dispose(); far?.dispose(); }, [far]);

  const flags = useMemo(() => batches.map((batch) => new Uint8Array(batch.instances.length)), [batches]);
  const farMatrices = useMemo<THREE.Matrix4[]>(() => [], []);
  const lastSplit = useRef<THREE.Vector3 | null>(null);
  const lastFar = useRef<THREE.InstancedMesh | null>(null);
  const camera = useMemo(() => new THREE.Vector3(), []);
  const thresholds = useMemo(() => batches.map((batch) => batch.instances.map((instance) => impostorDistance(radius * instance.scale, quality))), [batches, radius, quality]);

  useFrame((state) => {
    state.camera.getWorldPosition(camera);
    const fresh = lastFar.current !== far;
    if (!fresh && lastSplit.current !== null && lastSplit.current.distanceToSquared(camera) < SPLIT_MOVE * SPLIT_MOVE) return;
    lastFar.current = far;
    lastSplit.current = (lastSplit.current ?? new THREE.Vector3()).copy(camera);
    farMatrices.length = 0;
    batches.forEach((batch, batchIndex) => {
      const batchFlags = flags[batchIndex]!;
      if (far === null) {
        batchFlags.fill(0);
        return;
      }
      markFarPlacements(batch.instances, thresholds[batchIndex]!, batchFlags, camera);
      batchFlags.forEach((flag, index) => {
        if (flag === 1) farMatrices.push(batch.matrices[index]!);
      });
    });
    for (const draw of near) {
      const batchFlags = flags[batches.indexOf(draw.batch)]!;
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
