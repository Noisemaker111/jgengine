import * as THREE from "three";

/** One retargeted bone: the target bone driven by a source bone, and optional children that aim each. */
export interface RetargetBone {
  target: string;
  source: string;
  /** Bones the two point toward at rest; aligning them corrects different rest poses (A-pose onto T-pose). */
  aim?: { target: string; source: string };
}

/** How {@link retargetClipByRest} maps one skeleton's motion onto another. */
export interface RetargetOptions {
  /** Name of the output clip. */
  name: string;
  bones: readonly RetargetBone[];
  /** The hip pair whose travel and bob carry over, scaled by the hips' rest heights. */
  hip: { target: string; source: string };
  /** Left and right legs of each skeleton, used to turn the source to face the way the target faces. */
  sides: { target: readonly [string, string]; source: readonly [string, string] };
  /** Sampling rate in frames per second. Default 30. */
  fps?: number;
  /** Drop the hip's travel on the ground plane, keeping bob. */
  inPlace?: boolean;
}

function named(root: THREE.Object3D, name: string): THREE.Object3D {
  const found = root.getObjectByName(name);
  if (found === undefined) throw new Error(`retarget: no bone named ${name}`);
  return found;
}

function worldPosition(object: THREE.Object3D): THREE.Vector3 {
  return object.getWorldPosition(new THREE.Vector3());
}

function worldQuaternion(object: THREE.Object3D): THREE.Quaternion {
  return object.getWorldQuaternion(new THREE.Quaternion());
}

/** The lowest joint's height: the floor a skeleton stands on, with or without a mesh. */
function lowestJoint(root: THREE.Object3D): number {
  let lowest = Infinity;
  root.traverse((object) => {
    if (object !== root) lowest = Math.min(lowest, worldPosition(object).y);
  });
  return Number.isFinite(lowest) ? lowest : 0;
}

/**
 * Retarget a clip from one skeleton onto another whose bones have different names, orientations
 * and rest pose. Each mapped bone takes the source bone's world-space rotation away from its rest,
 * applied after turning the target's rest bone to point where the source's does (`aim`), so an
 * A-pose body plays T-pose motion with its arms down. Unmapped bones keep their rest pose relative
 * to their parent. Both roots must be at rest when called; the source is posed while sampling and
 * returned to rest. Bone lengths stay the target's; only the hip translates.
 * @capability clip-retarget retarget a clip between differently built humanoid skeletons in an asset pipeline
 */
export function retargetClipByRest(target: THREE.Object3D, source: THREE.Object3D, clip: THREE.AnimationClip, options: RetargetOptions): THREE.AnimationClip {
  target.updateMatrixWorld(true);
  source.updateMatrixWorld(true);
  const [targetLeft, targetRight] = options.sides.target;
  const [sourceLeft, sourceRight] = options.sides.source;
  const across = (root: THREE.Object3D, left: string, right: string) => {
    const vector = worldPosition(named(root, left)).sub(worldPosition(named(root, right)));
    vector.y = 0;
    return vector.normalize();
  };
  const facing = new THREE.Quaternion().setFromUnitVectors(across(source, sourceLeft, sourceRight), across(target, targetLeft, targetRight));

  const plan = options.bones.map((bone) => {
    const targetBone = named(target, bone.target);
    const sourceBone = named(source, bone.source);
    const targetRest = worldQuaternion(targetBone);
    const sourceRest = facing.clone().multiply(worldQuaternion(sourceBone));
    const align = new THREE.Quaternion();
    if (bone.aim !== undefined) {
      const targetDir = worldPosition(named(target, bone.aim.target)).sub(worldPosition(targetBone)).normalize();
      const sourceDir = worldPosition(named(source, bone.aim.source)).sub(worldPosition(sourceBone)).applyQuaternion(facing).normalize();
      align.setFromUnitVectors(targetDir, sourceDir);
    }
    return { targetBone, sourceBone, restAligned: align.multiply(targetRest), sourceRestInverse: sourceRest.invert() };
  });
  const byTarget = new Map(plan.map((entry) => [entry.targetBone, entry]));

  const order: THREE.Object3D[] = [];
  target.traverse((object) => order.push(object));
  const restLocal = new Map(order.map((object) => [object, object.quaternion.clone()]));
  const rootParentWorld = target.parent === null ? new THREE.Quaternion() : worldQuaternion(target.parent);

  const targetHip = named(target, options.hip.target);
  const sourceHip = named(source, options.hip.source);
  const targetHipRest = worldPosition(targetHip);
  const sourceHipRest = worldPosition(sourceHip).applyQuaternion(facing);
  const ratio = (targetHipRest.y - lowestJoint(target)) / Math.max(1e-6, worldPosition(sourceHip).y - lowestJoint(source));
  const hipParentInverse = new THREE.Matrix4();

  const fps = options.fps ?? 30;
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  const rotations = new Map(plan.map((entry) => [entry.targetBone, new Float32Array(frames * 4)]));
  const hipPositions = new Float32Array(frames * 3);

  const sourceRestPose: [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3][] = [];
  source.traverse((object) => sourceRestPose.push([object, object.position.clone(), object.quaternion.clone(), object.scale.clone()]));
  const mixer = new THREE.AnimationMixer(source);
  // One clamped pass: a looping action reads the last frame as the first.
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const world = new Map<THREE.Object3D, THREE.Quaternion>();
  const delta = new THREE.Quaternion();
  const local = new THREE.Quaternion();
  for (let frame = 0; frame < frames; frame += 1) {
    const time = Math.min(clip.duration, frame / fps);
    times[frame] = time;
    mixer.setTime(time);
    source.updateMatrixWorld(true);
    world.clear();
    for (const object of order) {
      const parentWorld = object === target ? rootParentWorld : (object.parent === null ? undefined : world.get(object.parent)) ?? rootParentWorld;
      const entry = byTarget.get(object);
      if (entry === undefined) {
        world.set(object, parentWorld.clone().multiply(restLocal.get(object) ?? object.quaternion));
        continue;
      }
      delta.copy(facing).multiply(worldQuaternion(entry.sourceBone)).multiply(entry.sourceRestInverse);
      const next = delta.clone().multiply(entry.restAligned);
      world.set(object, next);
      local.copy(parentWorld).invert().multiply(next);
      const values = rotations.get(object);
      if (values === undefined) continue;
      // Keep each key in the same hemisphere as the last so interpolation never spins the long way round.
      const previous = frame === 0 ? 1 : (values[frame * 4 - 4] ?? 0) * local.x + (values[frame * 4 - 3] ?? 0) * local.y + (values[frame * 4 - 2] ?? 0) * local.z + (values[frame * 4 - 1] ?? 0) * local.w;
      const sign = previous < 0 ? -1 : 1;
      values.set([local.x * sign, local.y * sign, local.z * sign, local.w * sign], frame * 4);
    }
    const travel = worldPosition(sourceHip).applyQuaternion(facing).sub(sourceHipRest).multiplyScalar(ratio);
    if (options.inPlace === true) {
      travel.x = 0;
      travel.z = 0;
    }
    const hipWorld = targetHipRest.clone().add(travel);
    if (targetHip.parent !== null) hipWorld.applyMatrix4(hipParentInverse.copy(targetHip.parent.matrixWorld).invert());
    hipPositions.set([hipWorld.x, hipWorld.y, hipWorld.z], frame * 3);
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(source);
  for (const [object, position, quaternion, scale] of sourceRestPose) {
    object.position.copy(position);
    object.quaternion.copy(quaternion);
    object.scale.copy(scale);
  }
  source.updateMatrixWorld(true);

  const tracks: THREE.KeyframeTrack[] = [new THREE.VectorKeyframeTrack(`${targetHip.name}.position`, times, hipPositions)];
  for (const [bone, values] of rotations) tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values));
  return new THREE.AnimationClip(options.name, clip.duration, tracks);
}
