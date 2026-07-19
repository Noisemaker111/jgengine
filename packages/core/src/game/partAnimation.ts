/**
 * Procedural animation for part-composed (rig-less) models — characters kit-bashed from
 * primitives/`ModelPart`s with no skeleton or clips. Pure, deterministic curve sampling:
 * the same (time, speed, phase, flinch, death) input always yields the same pose, so
 * replays and multi-client renders stay in lockstep and the hot path allocates nothing
 * when an `out` pose is reused.
 */

/** Semantic motion role of one `ModelPart` in a part-composed character. */
export type PartRole = "head" | "arm.l" | "arm.r" | "leg.l" | "leg.r" | "tail" | "wing.l" | "wing.r";

/** Tuning for {@link samplePartPose}/{@link sampleBodyPose}; every field has a sensible default. */
export interface PartMotionParams {
  /** Full stride cycles per second at walking speed. Default 1.6. */
  strideHz?: number;
  /** Limb swing amplitude in radians at full walk. Default 0.7. */
  swingRad?: number;
  /** Body bob height in model units at full walk. Default 0.04. */
  bobAmp?: number;
  /** Idle sway/breathe amplitude in radians. Default 0.05. */
  swayRad?: number;
  /** Speed (world units/sec) treated as a full walk; swing/bob scale linearly below it. Default 2. */
  walkSpeed?: number;
  /** Backward flinch pitch in radians at flinch = 1. Default 0.35. */
  flinchRad?: number;
  /** Sideways topple roll in radians at death = 1. Default PI / 2. */
  toppleRad?: number;
  /**
   * Squash-and-stretch amplitude for soft characters (blobs, slimes): footfall squash while
   * walking, jelly breathe while idle, a squash pulse on flinch. Volume-conserving — the body
   * bulges horizontally as it compresses. Default 0 (rigid; scale stays exactly 1).
   */
  squashAmp?: number;
  /** How death reads: `"topple"` rolls sideways (default, hard characters); `"splat"` flattens the body out — right for blobs. */
  deathStyle?: "topple" | "splat";
}

/** Sampled offsets to add onto a part's authored transform (or the character root). `scale` is multiplicative (1 = unchanged). */
export interface PartPose {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

/** Live signals a driver feeds the samplers each frame. All values are render-side only. */
export interface PartMotionInput {
  /** Seconds since the driver started (any monotonic clock). */
  timeSec: number;
  /** Horizontal speed in world units/sec (smoothed by the driver). */
  speed: number;
  /** Per-character phase offset in [0, 1) so crowds don't stride in sync — see {@link partMotionPhase}. */
  phase: number;
  /** Hit-flinch envelope in [0, 1]; the driver sets 1 on a hit and decays it. */
  flinch: number;
  /** Death ramp in [0, 1]; the driver eases it to 1 after the entity dies. */
  death: number;
}

const DEFAULT_STRIDE_HZ = 1.6;
const DEFAULT_SWING_RAD = 0.7;
const DEFAULT_BOB_AMP = 0.04;
const DEFAULT_SWAY_RAD = 0.05;
const DEFAULT_WALK_SPEED = 2;
const DEFAULT_FLINCH_RAD = 0.35;
const DEFAULT_TOPPLE_RAD = Math.PI / 2;
const IDLE_BREATHE_HZ = 0.45;
const TWO_PI = Math.PI * 2;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function zeroPose(out: PartPose): PartPose {
  out.position[0] = 0;
  out.position[1] = 0;
  out.position[2] = 0;
  out.rotation[0] = 0;
  out.rotation[1] = 0;
  out.rotation[2] = 0;
  out.scale[0] = 1;
  out.scale[1] = 1;
  out.scale[2] = 1;
  return out;
}

/** Volume-conserving vertical squash: compress y by `amount`, bulge x/z by half of it. */
function applySquash(out: PartPose, amount: number): void {
  out.scale[1] *= 1 - amount;
  const bulge = 1 + amount * 0.5;
  out.scale[0] *= bulge;
  out.scale[2] *= bulge;
}

/** A reusable identity pose (zero offsets, unit scale). */
export function createPartPose(): PartPose {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}

/**
 * Deterministic per-character stride phase in [0, 1) from an id (e.g. the entity instance id),
 * so a crowd of identical part-composed characters doesn't animate in lockstep.
 */
export function partMotionPhase(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return (hash % 1000) / 1000;
}

const SPLAT_FLATTEN = 0.7;

/**
 * Sample the character-root pose: walk bob, idle breathe/sway, backward hit flinch, and death —
 * a sideways topple by default, or a flatten-out splat with `deathStyle: "splat"`. With
 * `squashAmp > 0` the body also squashes and stretches (footfall squash, jelly idle breathe,
 * flinch squash pulse), volume-conserving. A driver applies this to the group wrapping the
 * whole composition (base model plus parts) — limbs ride along, as they would on a real torso.
 *
 * @capability part-motion sample the root bob/sway/squash/flinch/death pose for a rig-less part-composed character
 */
export function sampleBodyPose(
  input: PartMotionInput,
  params?: PartMotionParams,
  out: PartPose = createPartPose(),
): PartPose {
  zeroPose(out);
  const walkSpeed = params?.walkSpeed ?? DEFAULT_WALK_SPEED;
  const strideHz = params?.strideHz ?? DEFAULT_STRIDE_HZ;
  const bobAmp = params?.bobAmp ?? DEFAULT_BOB_AMP;
  const swayRad = params?.swayRad ?? DEFAULT_SWAY_RAD;
  const squashAmp = params?.squashAmp ?? 0;
  const death = clamp01(input.death);
  const alive = 1 - death;
  const walk = clamp01(input.speed / walkSpeed) * alive;
  const idle = (1 - walk) * alive;
  const stride = TWO_PI * (input.timeSec * strideHz + input.phase);
  const breathe = TWO_PI * (input.timeSec * IDLE_BREATHE_HZ + input.phase);
  const step = Math.abs(Math.sin(stride));
  // Double-bounce bob: the body rises on each step, twice per stride cycle.
  out.position[1] = step * bobAmp * walk + Math.sin(breathe) * bobAmp * 0.5 * idle;
  out.rotation[2] = Math.sin(breathe) * swayRad * idle;
  out.rotation[0] = -clamp01(input.flinch) * (params?.flinchRad ?? DEFAULT_FLINCH_RAD) * alive;
  if (squashAmp > 0) {
    // Footfall squash: deepest where the bob is lowest (step ≈ 0), released at the top of the step.
    applySquash(out, (1 - step) * squashAmp * walk);
    // Jelly breathe: idle scale oscillation, gentler than a footfall.
    applySquash(out, Math.sin(breathe) * squashAmp * 0.4 * idle);
    // Flinch reads as a squash pulse on a soft body.
    applySquash(out, clamp01(input.flinch) * squashAmp * alive);
  }
  if ((params?.deathStyle ?? "topple") === "splat") {
    applySquash(out, death * SPLAT_FLATTEN);
  } else {
    out.rotation[2] += death * (params?.toppleRad ?? DEFAULT_TOPPLE_RAD);
  }
  return out;
}

/**
 * Sample one part's pose offset by role: counter-phase leg/arm swing driven by speed, a head
 * counter-sway, tail wag, and wing flap. Offsets are added onto the part's authored
 * position/rotation. Motion fades to zero as `death` ramps so the topple reads as one piece.
 *
 * @capability part-motion sample a limb/head/tail/wing pose offset for a role-tagged ModelPart
 */
export function samplePartPose(
  role: PartRole,
  input: PartMotionInput,
  params?: PartMotionParams,
  out: PartPose = createPartPose(),
): PartPose {
  zeroPose(out);
  const walkSpeed = params?.walkSpeed ?? DEFAULT_WALK_SPEED;
  const strideHz = params?.strideHz ?? DEFAULT_STRIDE_HZ;
  const swingRad = params?.swingRad ?? DEFAULT_SWING_RAD;
  const swayRad = params?.swayRad ?? DEFAULT_SWAY_RAD;
  const alive = 1 - clamp01(input.death);
  const walk = clamp01(input.speed / walkSpeed) * alive;
  const idle = (1 - walk) * alive;
  const stride = TWO_PI * (input.timeSec * strideHz + input.phase);
  const breathe = TWO_PI * (input.timeSec * IDLE_BREATHE_HZ + input.phase);
  switch (role) {
    case "leg.l":
      out.rotation[0] = Math.sin(stride) * swingRad * walk;
      break;
    case "leg.r":
      out.rotation[0] = Math.sin(stride + Math.PI) * swingRad * walk;
      break;
    case "arm.l":
      // Arms counter their same-side leg, at slightly lower amplitude.
      out.rotation[0] = Math.sin(stride + Math.PI) * swingRad * 0.8 * walk;
      out.rotation[2] = Math.sin(breathe) * swayRad * idle;
      break;
    case "arm.r":
      out.rotation[0] = Math.sin(stride) * swingRad * 0.8 * walk;
      out.rotation[2] = -Math.sin(breathe) * swayRad * idle;
      break;
    case "head":
      out.rotation[2] = -Math.sin(breathe) * swayRad * idle;
      out.rotation[1] = Math.sin(stride) * swayRad * 0.5 * walk;
      out.rotation[0] = -clamp01(input.flinch) * 0.5 * (params?.flinchRad ?? DEFAULT_FLINCH_RAD) * alive;
      break;
    case "tail":
      out.rotation[1] = Math.sin(stride) * swingRad * 0.5 * walk + Math.sin(breathe) * swayRad * 2 * idle;
      break;
    case "wing.l":
      out.rotation[2] = Math.abs(Math.sin(stride)) * swingRad * walk + Math.sin(breathe) * swayRad * idle;
      break;
    case "wing.r":
      out.rotation[2] = -Math.abs(Math.sin(stride)) * swingRad * walk - Math.sin(breathe) * swayRad * idle;
      break;
  }
  return out;
}
