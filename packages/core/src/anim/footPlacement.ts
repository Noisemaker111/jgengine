import { clamp } from "../math/scalar";

export interface FootGroundSample {
  ankleY: number;
  groundY: number | null;
}

export interface FootPlacementInput {
  feet: readonly FootGroundSample[];
  originY: number;
  /** Ankle height above the sole in the rig's rest pose; the sole never ends below the ground. */
  ankleHeight: number;
  maxAdjust: number;
  airborneGap: number;
}

export interface FootPlacement {
  /** Vertical pelvis shift, `<= 0`, so the lowest planted foot can reach its ground. */
  pelvisOffset: number;
  ankleTargets: (number | null)[];
  /** `false` while the feet are clear of the ground, so callers fade the correction out. */
  grounded: boolean;
}

/**
 * Resolves foot placement for a rig whose clips were authored on flat ground at its origin.
 * Each foot keeps its animated lift and moves by its ground's height above or below the origin,
 * the sole is never left under the ground, and the pelvis drops by the deepest reach so both legs
 * stay within length. Pure and allocation-light; the renderer applies the targets with
 * {@link solveTwoBone}.
 *
 * @capability animation ground rigged feet on slopes and steps without hiding the swing leg
 */
export function placeFeet(input: FootPlacementInput, out?: FootPlacement): FootPlacement {
  const result = out ?? { pelvisOffset: 0, ankleTargets: [], grounded: false };
  result.ankleTargets.length = input.feet.length;
  const limit = Math.max(0, input.maxAdjust);
  let lowestGap = Infinity;
  let pelvis = 0;
  for (let i = 0; i < input.feet.length; i += 1) {
    const foot = input.feet[i]!;
    if (foot.groundY === null) {
      result.ankleTargets[i] = null;
      continue;
    }
    lowestGap = Math.min(lowestGap, foot.ankleY - input.ankleHeight - foot.groundY);
    const followed = foot.ankleY + clamp(foot.groundY - input.originY, -limit, limit);
    const target = Math.min(foot.ankleY + limit, Math.max(followed, foot.groundY + input.ankleHeight));
    result.ankleTargets[i] = target;
    pelvis = Math.min(pelvis, target - foot.ankleY);
  }
  result.grounded = lowestGap <= input.airborneGap;
  result.pelvisOffset = result.grounded ? Math.max(-limit, pelvis) : 0;
  return result;
}

export interface RigBone {
  name: string;
  parent: string | null;
}

export interface LegChain {
  root: string;
  mid: string;
  tip: string;
}

const THIGH = /(upleg|upperleg|thigh|femur)/;
const HELPER = /(ik|control|ctrl|twist|pole|target|roll)/;

/** @capability animation find thigh, shin and foot bones on a humanoid rig for foot IK */
export function inferLegChains(bones: readonly RigBone[]): LegChain[] {
  const children = new Map<string, string[]>();
  for (const bone of bones) {
    if (bone.parent === null) continue;
    const list = children.get(bone.parent);
    if (list === undefined) children.set(bone.parent, [bone.name]);
    else list.push(bone.name);
  }
  const firstChild = (name: string): string | undefined =>
    children.get(name)?.find((child) => !HELPER.test(child.toLowerCase()));
  const chains: LegChain[] = [];
  for (const bone of bones) {
    const key = bone.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!THIGH.test(key) || HELPER.test(key)) continue;
    const mid = firstChild(bone.name);
    const tip = mid === undefined ? undefined : firstChild(mid);
    if (mid !== undefined && tip !== undefined) chains.push({ root: bone.name, mid, tip });
  }
  return chains;
}
