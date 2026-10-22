import type { RagdollConfig, RagdollLinkSpec } from "../physics/ragdoll";
import { multiplyQuaternions, quaternionFromUnitVectors, type Quat } from "./ikSolver";
import { SKELETON_PARENT, SKELETON_SLOTS, type SkeletonMap, type SkeletonSlot } from "./skeletonStandard";

/**
 * One standard slot's world pose, sampled at the moment a character is killed. The orientation is
 * the reference the ragdoll's aim rotates from, so every bone keeps the roll it died with.
 */
export interface RagdollPose {
  slot: SkeletonSlot;
  position: readonly [number, number, number];
  /** World orientation of the bone, as `[x, y, z, w]`. */
  orientation: readonly [number, number, number, number];
}

/** Half-extents and mass of one standard slot's physics body, in the rig's own world units. */
export interface RagdollBodyShape {
  halfExtents: readonly [number, number, number];
  mass: number;
}

/**
 * Humanoid body shapes for the standard slots, sized for a roughly 1.8 m character standing on the
 * ground. A rig of another scale multiplies them (see {@link RagdollRigOptions.scale}).
 */
export const HUMANOID_RAGDOLL_BODIES: Readonly<Partial<Record<SkeletonSlot, RagdollBodyShape>>> = {
  root: { halfExtents: [0.1, 0.1, 0.08], mass: 4 },
  hips: { halfExtents: [0.1, 0.09, 0.08], mass: 8 },
  spine: { halfExtents: [0.1, 0.1, 0.08], mass: 6 },
  chest: { halfExtents: [0.13, 0.12, 0.09], mass: 10 },
  head: { halfExtents: [0.09, 0.1, 0.09], mass: 5 },
  "upperArm.l": { halfExtents: [0.05, 0.13, 0.05], mass: 2 },
  "upperArm.r": { halfExtents: [0.05, 0.13, 0.05], mass: 2 },
  "lowerArm.l": { halfExtents: [0.04, 0.12, 0.04], mass: 1.5 },
  "lowerArm.r": { halfExtents: [0.04, 0.12, 0.04], mass: 1.5 },
  "hand.l": { halfExtents: [0.04, 0.05, 0.03], mass: 0.5 },
  "hand.r": { halfExtents: [0.04, 0.05, 0.03], mass: 0.5 },
  "upperLeg.l": { halfExtents: [0.07, 0.18, 0.07], mass: 4 },
  "upperLeg.r": { halfExtents: [0.07, 0.18, 0.07], mass: 4 },
  "lowerLeg.l": { halfExtents: [0.06, 0.17, 0.06], mass: 3 },
  "lowerLeg.r": { halfExtents: [0.06, 0.17, 0.06], mass: 3 },
  "foot.l": { halfExtents: [0.06, 0.04, 0.1], mass: 1 },
  "foot.r": { halfExtents: [0.06, 0.04, 0.1], mass: 1 },
  "toes.l": { halfExtents: [0.06, 0.03, 0.06], mass: 0.3 },
  "toes.r": { halfExtents: [0.06, 0.03, 0.06], mass: 0.3 },
};

/** Tuning for {@link ragdollConfigFromPoses}. */
export interface RagdollRigOptions {
  /** Overrides {@link HUMANOID_RAGDOLL_BODIES} per slot. A slot absent from both is skipped. */
  bodies?: Readonly<Partial<Record<SkeletonSlot, RagdollBodyShape>>>;
  /** Multiplies every half-extent; a rig taller than 1.8 m passes its height over 1.8. Default 1. */
  scale?: number;
  /** Also build a body for slots with no shape of their own. Default false. */
  includeUnshaped?: boolean;
}

/**
 * World orientations for a ragdoll's bones from its bodies' current positions: each bone rotates
 * from its rest direction-to-child onto the current one, so the aim follows the joints while every
 * bone keeps the roll it had in the death pose. A bone with no posed child keeps its rest
 * orientation. The physics bodies carry translation only, so this is what gives the ragdoll a
 * skeleton instead of a pile of boxes.
 *
 * @capability animation orient a ragdoll's bones from its physics bodies' positions
 */
export function ragdollBoneOrientations(
  rest: readonly RagdollPose[],
  positions: Readonly<Partial<Record<SkeletonSlot, readonly [number, number, number]>>>,
): Partial<Record<SkeletonSlot, [number, number, number, number]>> {
  const restBySlot = new Map(rest.map((pose) => [pose.slot, pose]));
  const present = new Set(restBySlot.keys());
  // The nearest posed descendant, walking down through slots the rig or shape table skipped.
  const childOf = new Map<SkeletonSlot, SkeletonSlot>();
  for (const slot of present) {
    for (const candidate of SKELETON_SLOTS) {
      let parent = SKELETON_PARENT[candidate];
      while (parent !== undefined && !present.has(parent)) parent = SKELETON_PARENT[parent];
      if (parent === slot && !childOf.has(slot)) {
        childOf.set(slot, candidate);
        break;
      }
    }
  }
  const out: Partial<Record<SkeletonSlot, [number, number, number, number]>> = {};
  for (const slot of present) {
    const pose = restBySlot.get(slot)!;
    const current = positions[slot];
    const child = childOf.get(slot);
    const childPose = child === undefined ? undefined : restBySlot.get(child);
    const childCurrent = child === undefined ? undefined : positions[child];
    if (current === undefined || childPose === undefined || childCurrent === undefined) {
      out[slot] = [pose.orientation[0], pose.orientation[1], pose.orientation[2], pose.orientation[3]];
      continue;
    }
    const restDirection: [number, number, number] = [
      childPose.position[0] - pose.position[0],
      childPose.position[1] - pose.position[1],
      childPose.position[2] - pose.position[2],
    ];
    const currentDirection: [number, number, number] = [
      childCurrent[0] - current[0],
      childCurrent[1] - current[1],
      childCurrent[2] - current[2],
    ];
    if (Math.hypot(...restDirection) <= 1e-6 || Math.hypot(...currentDirection) <= 1e-6) {
      out[slot] = [pose.orientation[0], pose.orientation[1], pose.orientation[2], pose.orientation[3]];
      continue;
    }
    const aim = quaternionFromUnitVectors(restDirection, currentDirection);
    const base: Quat = [pose.orientation[0], pose.orientation[1], pose.orientation[2], pose.orientation[3]];
    const composed = multiplyQuaternions(aim, base);
    out[slot] = [composed[0], composed[1], composed[2], composed[3]];
  }
  return out;
}

/**
 * A jointed ragdoll for a mapped rig from its bones' world poses at the moment of death: one box
 * body per standard slot that has a shape, sized to the character, and one distance link per slot
 * that has its parent present, holding the bones' own separation. The bodies start where the
 * character actually was, so the collapse continues the death pose instead of snapping to a preset.
 *
 * `handSlot.l`/`handSlot.r` carry no body: they are prop sockets, not body parts. A slot whose bone
 * the rig does not have is skipped, and its children link to the nearest present ancestor instead.
 *
 * @capability animation build a physics ragdoll from a mapped rig's death pose
 */
export function ragdollConfigFromPoses(
  map: SkeletonMap,
  poses: readonly RagdollPose[],
  options: RagdollRigOptions = {},
): RagdollConfig {
  const scale = options.scale ?? 1;
  const poseBySlot = new Map(poses.map((pose) => [pose.slot, pose.position]));
  const present: SkeletonSlot[] = [];
  const bones: RagdollConfig["bones"] = [];
  for (const slot of SKELETON_SLOTS) {
    if (map.slots[slot] === undefined) continue;
    const position = poseBySlot.get(slot);
    if (position === undefined) continue;
    const shape = options.bodies?.[slot] ?? HUMANOID_RAGDOLL_BODIES[slot];
    if (shape === undefined && options.includeUnshaped !== true) continue;
    const halfExtents = shape?.halfExtents ?? [0.1, 0.1, 0.1];
    bones.push({
      name: slot,
      position: [position[0], position[1], position[2]],
      halfExtents: [halfExtents[0] * scale, halfExtents[1] * scale, halfExtents[2] * scale],
      mass: shape?.mass ?? 1,
    });
    present.push(slot);
  }
  const included = new Set(present);
  const links: RagdollLinkSpec[] = [];
  for (const slot of present) {
    let parent = SKELETON_PARENT[slot];
    // Walk up past slots this rig or this shape table does not cover, so a legless rig still links
    // its head to the chest rather than dropping the bone out of the joint chain.
    while (parent !== undefined && !included.has(parent)) parent = SKELETON_PARENT[parent];
    if (parent === undefined) continue;
    links.push({ a: parent, b: slot, kind: "distance" });
  }
  return { bones, links };
}
