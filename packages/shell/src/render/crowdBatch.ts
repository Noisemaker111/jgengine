import * as THREE from "three";

import { animationPhaseOf } from "./characterLod";
import {
  crowdClipForSpeed,
  type CrowdMember,
  type CrowdSpeedBands,
} from "./crowdRegistry";

/** How a batch places every member of one character kind. @internal */
export interface CrowdBatchPlacement {
  /** Uniform scale applied to the baked geometry. */
  scale: number;
  /** Translation applied after the member's own pose, so the baked rig stands where its own rig would. */
  offset: THREE.Vector3;
}

/** The clip and time offset a batch is playing for one member. @internal */
export interface CrowdPlayback {
  clip: number;
  offset: number;
}

/** Everything one frame of a character batch needs. @internal */
export interface CrowdBatchFrame {
  mesh: THREE.InstancedMesh;
  /** Per-instance clip, time offset and speed; `null` for a static character kind. */
  play: THREE.InstancedBufferAttribute | null;
  /** Drawn members in batch order, already filtered by visibility. */
  members: readonly { id: string; member: CrowdMember }[];
  placement: CrowdBatchPlacement;
  /** Baked clip names in `[idle, walk, run]` order. */
  clips: readonly string[];
  bands: CrowdSpeedBands;
  clipIndex: ReadonlyMap<string, number>;
  /** Seconds of batch time, so a member entering mid-clip continues the pose it was holding. */
  time: number;
  /** Per-member playback state, kept across frames; cleared by the caller when the batch unmounts. */
  playback: Map<string, CrowdPlayback>;
  /** Ids written into the compacted instance slots, in draw order. */
  ids: string[];
}

const scratchMatrix = new THREE.Matrix4();
const scratchOffset = new THREE.Matrix4();
const scratchQuaternion = new THREE.Quaternion();
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();

/** A stable non-zero time offset for a member with no recorded pose, so a crowd is not in lockstep. */
export function poseTimeOffset(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return (Math.abs(hash) % 1000) / 1000 + 0.05;
}

/**
 * Writes one frame of instances for a batch and returns how many it drew. Slots are compacted from
 * zero every frame and `ids` is truncated to the drawn range, so a character that left the batch or
 * went out of view never leaves its last matrix or id behind for the next member to inherit.
 * @internal
 */
export function writeCrowdBatch(frame: CrowdBatchFrame): number {
  const { mesh, play, members, placement, clips, bands, clipIndex, time, playback, ids } = frame;
  let count = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const { id, member } of members) {
    if (count >= mesh.instanceMatrix.count) break;
    if (play !== null) {
      const clipName = crowdClipForSpeed(clips, member.speed, bands);
      const clip = clipName === undefined ? 0 : clipIndex.get(clipName) ?? 0;
      let entry = playback.get(id);
      if (entry === undefined || entry.clip !== clip) {
        // Hand the batch the pose the rig was holding, so the swap continues the same gait instead
        // of restarting the clip at a different phase.
        const phase = animationPhaseOf(id);
        entry = { clip, offset: phase !== undefined && phase.clip === clipName ? phase.time - time : poseTimeOffset(id) };
        playback.set(id, entry);
      }
      play.setXYZ(count, entry.clip, entry.offset, 1);
    }
    scratchQuaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, member.rotationY);
    scratchMatrix.compose(scratchPosition.set(member.x, member.y, member.z), scratchQuaternion, scratchScale.setScalar(placement.scale));
    scratchMatrix.multiply(scratchOffset.makeTranslation(placement.offset.x, placement.offset.y, placement.offset.z));
    mesh.setMatrixAt(count, scratchMatrix);
    ids[count] = id;
    minX = Math.min(minX, member.x); maxX = Math.max(maxX, member.x);
    minY = Math.min(minY, member.y); maxY = Math.max(maxY, member.y);
    minZ = Math.min(minZ, member.z); maxZ = Math.max(maxZ, member.z);
    count += 1;
  }
  ids.length = count;
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (play !== null) play.needsUpdate = true;
  if (count > 0) {
    // One batch spans every drawn member, so its cull sphere has to follow them; three cannot cull
    // an InstancedMesh per instance.
    const sphere = mesh.boundingSphere ?? (mesh.boundingSphere = new THREE.Sphere());
    sphere.center.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    sphere.radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 + placement.scale * 1.2;
  }
  return count;
}
