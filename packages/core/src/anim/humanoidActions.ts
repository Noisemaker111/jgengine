import type { ModelAnimationConfig } from "../game/playableGame";
import { SKELETON_SLOTS, type SkeletonSlot } from "./skeletonStandard";

/**
 * Engine-authored action clips for any humanoid rig mapped onto the skeleton standard: the motions
 * a mocap library rarely ships beside its walk cycles (jump, swim, punch, tool swing, gather, hurt,
 * death). Each clip is plain pose data on standard slots, so one authoring serves every rig the
 * standard maps; `buildHumanoidActionClips` (`humanoidActionClips.draw`) turns it into the rig's
 * own clips at load time.
 *
 * Angles are degrees about the model's own axes (+X the character's left, +Y up, +Z its facing),
 * applied at the joint on top of the rig's idle pose. About X a positive angle tips an upright bone
 * forward and swings a hanging limb back; about Z it tips an upright bone to the character's right
 * and swings a hanging limb to its left; about Y it turns the bone toward the character's left. A
 * child's rotation is authored as if its parent stood still, and is carried by the parent.
 */

/** Clip names the authored actions are added under; a rig that already has one keeps its own. */
export const HUMANOID_ACTION_NAMES = ["Jump", "Swim", "Tread", "Punch", "Swing", "Gather", "Hurt", "Death"] as const;

/** One authored action's clip name. */
export type HumanoidActionName = (typeof HUMANOID_ACTION_NAMES)[number];

/** Degrees about the model's X, Y and Z axes, composed in that order. */
export type HumanoidRotation = readonly [x: number, y: number, z: number];

/** One key of an authored clip: the slots it turns and how far the hips move, in model metres. */
export interface HumanoidPoseKey {
  /** Seconds from the clip's start. */
  at: number;
  /** Slot → rotation from the idle pose. A slot a key leaves out sits at the idle pose. */
  rotate?: Readonly<Partial<Record<SkeletonSlot, HumanoidRotation>>>;
  /** Hips translation from the idle pose, `[x, y, z]` in model metres. */
  hips?: readonly [number, number, number];
}

/** One authored action: its keys and whether it loops. */
export interface HumanoidActionClip {
  name: HumanoidActionName;
  /** Seconds; the last key's `at`. */
  duration: number;
  loop: boolean;
  keys: readonly HumanoidPoseKey[];
}

/** Every slot an authored clip may turn. */
export const HUMANOID_ACTION_SLOTS: readonly SkeletonSlot[] = [
  "hips",
  "spine",
  "chest",
  "head",
  "upperArm.l",
  "upperArm.r",
  "lowerArm.l",
  "lowerArm.r",
  "hand.l",
  "hand.r",
  "upperLeg.l",
  "upperLeg.r",
  "lowerLeg.l",
  "lowerLeg.r",
  "foot.l",
  "foot.r",
];

type Pose = Partial<Record<SkeletonSlot, HumanoidRotation>>;

/**
 * The same pose on the other side: left and right slots swap, and turns about Y and Z reverse.
 *
 * @internal
 */
export function mirrorHumanoidPose(pose: Readonly<Pose>): Pose {
  const out: Pose = {};
  for (const slot of SKELETON_SLOTS) {
    const rotation = pose[slot];
    if (rotation === undefined) continue;
    const other = SKELETON_SLOTS.find((candidate) => candidate !== slot && candidate.slice(0, -2) === slot.slice(0, -2) && /\.[lr]$/.test(slot) && /\.[lr]$/.test(candidate)) ?? slot;
    out[other] = [rotation[0], -rotation[1], -rotation[2]];
  }
  return out;
}

const both = (left: Pose): Pose => ({ ...left, ...mirrorHumanoidPose(left) });

const JUMP_TUCK: Pose = {
  spine: [-4, 0, 0],
  ...both({ "upperArm.l": [-30, 0, 22], "lowerArm.l": [-35, 0, 0], "upperLeg.l": [-38, 0, 0], "lowerLeg.l": [55, 0, 0], "foot.l": [-12, 0, 0] }),
};
const JUMP_REACH: Pose = {
  spine: [-6, 0, 0],
  ...both({ "upperArm.l": [-40, 0, 26], "lowerArm.l": [-25, 0, 0], "upperLeg.l": [-30, 0, 0], "lowerLeg.l": [45, 0, 0], "foot.l": [-8, 0, 0] }),
};

/**
 * The arms a first-person body carries in front of it, hands low in view at chest height, so the
 * fists and whatever they hold stay on screen while standing or walking. Turns from the idle pose.
 */
export const HUMANOID_FIRST_PERSON_CARRY: Readonly<Pose> = both({ "upperArm.l": [-50, 0, -12], "lowerArm.l": [-75, 0, 0] });

/** Prone body for the crawl: the hips tip the whole figure forward to lie along the surface. */
const PRONE: Pose = { hips: [82, 0, 0], head: [-38, 0, 0], chest: [-6, 0, 0] };
const SWIM_HIPS = [0, -1.05, -0.2] as const;

/**
 * Crawl step `n` of six per stroke. In the standing frame the arm turns forward about X from hanging
 * (0) back and up through overhead (180); carried by the prone hips that is: along the body, up out of the
 * water, reaching ahead, then pulling down through the water back to the hip. Arms run half a stroke apart.
 */
function crawlArm(sweep: number): Pose {
  const angle = ((sweep % 360) + 360) % 360;
  const recovering = angle > 0 && angle <= 180;
  return { "upperArm.l": [angle, 0, 18], "lowerArm.l": [recovering ? -50 : -12, 0, 0] };
}
function crawl(n: number): Pose {
  const flutter = n % 2 === 0 ? 14 : -14;
  return {
    ...PRONE,
    ...crawlArm(n * 60),
    ...mirrorHumanoidPose(crawlArm(n * 60 + 180)),
    "upperLeg.l": [flutter, 0, 0],
    "upperLeg.r": [-flutter, 0, 0],
    "lowerLeg.l": [18, 0, 0],
    "lowerLeg.r": [18, 0, 0],
    "foot.l": [30, 0, 0],
    "foot.r": [30, 0, 0],
  };
}

const TREAD_OPEN: Pose = {
  ...both({ "upperArm.l": [-30, 20, 45], "lowerArm.l": [-30, 0, 0], "upperLeg.l": [-30, 0, 8], "lowerLeg.l": [50, 0, 0] }),
};
const TREAD_CLOSE: Pose = {
  ...both({ "upperArm.l": [-35, -20, 35], "lowerArm.l": [-40, 0, 0] }),
  "upperLeg.l": [-10, 0, 8],
  "lowerLeg.l": [25, 0, 0],
  "upperLeg.r": [-40, 0, -8],
  "lowerLeg.r": [65, 0, 0],
};

const GUARD: Pose = { "upperArm.l": [-55, 0, 8], "lowerArm.l": [-115, 0, 0] };

/**
 * The authored action set. Jump is held while airborne, Swim and Tread loop while swimming, and the
 * rest are one-shots that return to locomotion (Death holds its last key).
 *
 * @capability humanoid-actions engine-authored jump, swim, punch, swing, gather, hurt and death clips for any humanoid rig
 */
export const HUMANOID_ACTIONS: Readonly<Record<HumanoidActionName, HumanoidActionClip>> = {
  Jump: {
    name: "Jump",
    duration: 0.8,
    loop: true,
    keys: [
      { at: 0, rotate: JUMP_TUCK },
      { at: 0.4, rotate: JUMP_REACH },
      { at: 0.8, rotate: JUMP_TUCK },
    ],
  },
  Swim: {
    name: "Swim",
    duration: 1.2,
    loop: true,
    keys: [0, 1, 2, 3, 4, 5, 6].map((n) => ({ at: (n * 2) / 10, rotate: crawl(n), hips: SWIM_HIPS })),
  },
  Tread: {
    name: "Tread",
    duration: 1.6,
    loop: true,
    keys: [
      { at: 0, rotate: TREAD_OPEN, hips: [0, -1.25, 0] },
      { at: 0.8, rotate: TREAD_CLOSE, hips: [0, -1.2, 0] },
      { at: 1.6, rotate: TREAD_OPEN, hips: [0, -1.25, 0] },
    ],
  },
  Punch: {
    name: "Punch",
    duration: 0.6,
    loop: false,
    keys: [
      { at: 0 },
      { at: 0.14, rotate: { chest: [0, -18, 0], ...GUARD, "upperArm.r": [-45, 0, -10], "lowerArm.r": [-120, 0, 0], "upperLeg.l": [-12, 0, 0], "lowerLeg.l": [14, 0, 0] } },
      { at: 0.26, rotate: { chest: [4, 26, 0], ...GUARD, "upperArm.r": [-88, 0, 8], "lowerArm.r": [-6, 0, 0], "hand.r": [0, 0, 0], "upperLeg.l": [-14, 0, 0], "lowerLeg.l": [16, 0, 0] } },
      { at: 0.4, rotate: { chest: [2, 10, 0], ...GUARD, "upperArm.r": [-60, 0, 0], "lowerArm.r": [-80, 0, 0] } },
      { at: 0.6 },
    ],
  },
  Swing: {
    name: "Swing",
    duration: 0.85,
    loop: false,
    keys: [
      { at: 0 },
      { at: 0.32, rotate: { spine: [-8, -10, 0], chest: [-6, -8, 0], "upperArm.r": [-165, 0, -12], "lowerArm.r": [-55, 0, 0], "hand.r": [-20, 0, 0], "upperArm.l": [-35, 0, 10], "lowerArm.l": [-40, 0, 0] } },
      { at: 0.48, rotate: { spine: [16, 6, 0], chest: [14, 8, 0], head: [6, 0, 0], "upperArm.r": [-55, 0, -4], "lowerArm.r": [-10, 0, 0], "hand.r": [25, 0, 0], "upperArm.l": [-25, 0, 8], "lowerArm.l": [-30, 0, 0], "upperLeg.l": [-14, 0, 0], "lowerLeg.l": [22, 0, 0], "upperLeg.r": [-6, 0, 0], "lowerLeg.r": [12, 0, 0] }, hips: [0, -0.06, 0] },
      { at: 0.62, rotate: { spine: [12, 4, 0], chest: [10, 4, 0], "upperArm.r": [-40, 0, -4], "lowerArm.r": [-20, 0, 0], "upperArm.l": [-20, 0, 8], "lowerArm.l": [-25, 0, 0], "upperLeg.l": [-10, 0, 0], "lowerLeg.l": [16, 0, 0] }, hips: [0, -0.04, 0] },
      { at: 0.85 },
    ],
  },
  Gather: {
    name: "Gather",
    duration: 1.1,
    loop: false,
    keys: [
      { at: 0 },
      { at: 0.38, rotate: { spine: [30, 0, 0], chest: [18, 0, 0], head: [10, 0, 0], "upperArm.r": [-55, 0, -6], "lowerArm.r": [-20, 0, 0], "upperArm.l": [-20, 0, 10], "lowerArm.l": [-30, 0, 0], ...both({ "upperLeg.l": [-48, 0, 6], "lowerLeg.l": [78, 0, 0], "foot.l": [-28, 0, 0] }) }, hips: [0, -0.26, -0.06] },
      { at: 0.7, rotate: { spine: [28, 0, 0], chest: [16, 0, 0], head: [6, 0, 0], "upperArm.r": [-40, 0, -6], "lowerArm.r": [-60, 0, 0], "upperArm.l": [-20, 0, 10], "lowerArm.l": [-30, 0, 0], ...both({ "upperLeg.l": [-48, 0, 6], "lowerLeg.l": [78, 0, 0], "foot.l": [-28, 0, 0] }) }, hips: [0, -0.26, -0.06] },
      { at: 1.1 },
    ],
  },
  Hurt: {
    name: "Hurt",
    duration: 0.5,
    loop: false,
    keys: [
      { at: 0 },
      { at: 0.1, rotate: { spine: [-12, 6, 0], chest: [-10, 4, 0], head: [-18, 0, 6], ...both({ "upperArm.l": [12, 0, 18], "lowerArm.l": [-25, 0, 0] }) }, hips: [0, 0, -0.05] },
      { at: 0.5 },
    ],
  },
  Death: {
    name: "Death",
    duration: 1.5,
    loop: false,
    keys: [
      { at: 0 },
      { at: 0.3, rotate: { spine: [12, 0, 0], head: [14, 0, 0], ...both({ "upperArm.l": [-10, 0, 10], "upperLeg.l": [-32, 0, 0], "lowerLeg.l": [62, 0, 0], "foot.l": [-20, 0, 0] }) }, hips: [0, -0.3, 0] },
      { at: 0.7, rotate: { hips: [-50, 0, 0], spine: [-4, 0, 0], head: [10, 0, 0], ...both({ "upperArm.l": [-30, 0, 30], "lowerArm.l": [-20, 0, 0], "upperLeg.l": [-45, 0, 0], "lowerLeg.l": [50, 0, 0] }) }, hips: [0, -0.62, -0.25] },
      { at: 1.05, rotate: { hips: [-88, 0, 0], head: [-6, 12, 0], ...both({ "upperArm.l": [-10, 0, 62], "lowerArm.l": [-12, 0, 0], "upperLeg.l": [-8, 0, 4], "lowerLeg.l": [10, 0, 0] }) }, hips: [0, -0.86, -0.45] },
      { at: 1.5, rotate: { hips: [-90, 0, 0], head: [-4, 16, 0], ...both({ "upperArm.l": [-8, 0, 66], "lowerArm.l": [-10, 0, 0], "upperLeg.l": [-6, 0, 4], "lowerLeg.l": [8, 0, 0] }) }, hips: [0, -0.88, -0.45] },
    ],
  },
};

/** Locomotion clip names and speeds a humanoid body's own library supplies. */
export interface HumanoidAnimationInput {
  idle: string;
  walk: string;
  run?: string;
  /** Default 0.3. */
  walkSpeed?: number;
  /** Default 3.2. */
  runSpeed?: number;
}

/**
 * The animation config for a humanoid body: its own idle, walk and run, plus the authored actions
 * as the airborne, swimming and one-shot states. One-shot keys: `attack` (Punch), `swing`, `gather`,
 * and the reserved `hit` (Hurt) and `death`, which fire from combat on their own; play the others
 * with `ctx.game.playEntityAnimation(id, "swing")`.
 *
 * @capability humanoid-actions the full locomotion, jump, swim and action animation config for a humanoid body
 */
export function humanoidAnimation(input: HumanoidAnimationInput): ModelAnimationConfig {
  return {
    humanoidActions: true,
    states: {
      idle: input.idle,
      walk: input.walk,
      ...(input.run === undefined ? {} : { run: input.run }),
      jump: HUMANOID_ACTIONS.Jump.name,
      swim: HUMANOID_ACTIONS.Swim.name,
      tread: HUMANOID_ACTIONS.Tread.name,
      walkSpeed: input.walkSpeed ?? 0.3,
      runSpeed: input.runSpeed ?? 3.2,
    },
    oneShots: {
      attack: HUMANOID_ACTIONS.Punch.name,
      swing: HUMANOID_ACTIONS.Swing.name,
      gather: HUMANOID_ACTIONS.Gather.name,
      hit: HUMANOID_ACTIONS.Hurt.name,
      death: HUMANOID_ACTIONS.Death.name,
    },
  };
}
