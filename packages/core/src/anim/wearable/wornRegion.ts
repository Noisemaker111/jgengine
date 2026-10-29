// @skill jgengine-world
import type { ModelMaterialOverride } from "../../game/playableGame";
import { detectHumanoidRig, SKELETON_SLOTS, type SkeletonSlot } from "../skeletonStandard";

/**
 * A stretch of a humanoid body: the skin weighted to these standard bones, kept between two heights.
 * Heights are a share of the ankle-to-head span in the bind pose: 0 at the ankles, 1 at the head bone
 * (the top of the neck), about 1.15 at the crown. A bone the standard does not name (a finger, the
 * neck, a face bone) counts as its nearest named ancestor, so a hand region takes the fingers too.
 */
export interface WearRegion {
  slots: readonly SkeletonSlot[];
  /** Lowest height covered. Omit for no floor. */
  from?: number;
  /** Highest height covered. Omit for no ceiling. */
  to?: number;
}

/** A body area a worn piece can name instead of spelling out its own {@link WearRegion}. */
export type WearRegionName = "head" | "torso" | "legs" | "feet" | "hands";

/** The engine's region for each body area: a cap over the crown, a long-sleeved top, trousers, boots to mid-shin, gloves. */
export const WEAR_REGIONS: Readonly<Record<WearRegionName, WearRegion>> = {
  head: { slots: ["head"], from: 1.13 },
  torso: { slots: ["hips", "spine", "chest", "upperArm.l", "upperArm.r", "lowerArm.l", "lowerArm.r"], from: 0.52, to: 0.96 },
  legs: { slots: ["hips", "upperLeg.l", "upperLeg.r", "lowerLeg.l", "lowerLeg.r"], to: 0.6 },
  feet: { slots: ["foot.l", "foot.r", "toes.l", "toes.r", "lowerLeg.l", "lowerLeg.r"], to: 0.2 },
  hands: { slots: ["hand.l", "hand.r"] },
};

/** How thick each body area's piece stands off what it covers by default, so a top sits over trousers and boots over both. */
const DEFAULT_THICKNESS: Readonly<Record<WearRegionName, number>> = { head: 0.012, torso: 0.006, legs: 0.004, feet: 0.008, hands: 0.003 };

/**
 * One piece of clothing a rigged humanoid can wear: a layer of the body's own skin, cut to a region
 * and pushed out a little, skinned to the same skeleton so it moves with every clip.
 */
export interface WornLayer {
  /** What it covers: a body area or a custom region. */
  region: WearRegionName | WearRegion;
  /** Its surface: colour, roughness, a `scan` for cloth grain. Texture `maps` are not read. */
  material?: ModelMaterialOverride;
  /** How far it stands off the skin, as a share of the ankle-to-head span (0.005 is about 7 mm on an adult). Defaults per body area. */
  thickness?: number;
}

/** The region a worn layer covers. @internal */
export function wornRegion(layer: WornLayer): WearRegion {
  return typeof layer.region === "string" ? WEAR_REGIONS[layer.region] : layer.region;
}

/** How far a worn layer stands off the skin, as a share of the ankle-to-head span. @internal */
export function wornThickness(layer: WornLayer): number {
  return layer.thickness ?? (typeof layer.region === "string" ? DEFAULT_THICKNESS[layer.region] : 0.005);
}

/** One bone of a skin: its name and the index of its parent bone in the same list, or -1. */
export interface SkinBone {
  name: string;
  parent: number;
}

/**
 * The standard slot each bone of a skin belongs to: its own when the humanoid standard maps it,
 * else its nearest mapped ancestor's. `null` throughout when the rig is not a humanoid. @internal
 */
export function boneSlots(bones: readonly SkinBone[]): (SkeletonSlot | null)[] {
  const map = detectHumanoidRig(bones.map((bone) => bone.name));
  if (map === null) return bones.map(() => null);
  const own = new Map<string, SkeletonSlot>();
  for (const slot of SKELETON_SLOTS) {
    const name = map.slots[slot];
    if (name !== undefined) own.set(name, slot);
  }
  const slots: (SkeletonSlot | null | undefined)[] = bones.map(() => undefined);
  const resolve = (index: number, depth: number): SkeletonSlot | null => {
    const known = slots[index];
    if (known !== undefined) return known;
    const bone = bones[index];
    if (bone === undefined || depth > bones.length) return null;
    const slot = own.get(bone.name) ?? (bone.parent < 0 ? null : resolve(bone.parent, depth + 1));
    slots[index] = slot;
    return slot;
  };
  return bones.map((_, index) => resolve(index, 0));
}

/** Where the body stands in a skin's bind space: the point between the ankles, the unit up axis, and the ankle-to-head length. */
export interface BodyFrame {
  origin: readonly [number, number, number];
  up: readonly [number, number, number];
  span: number;
}

/** The body frame from the bind-space positions of the head and both feet; `null` when they coincide. @internal */
export function bodyFrame(head: readonly number[], footL: readonly number[], footR: readonly number[]): BodyFrame | null {
  const mid = (axis: number): number => ((footL[axis] ?? 0) + (footR[axis] ?? 0)) / 2;
  const origin: [number, number, number] = [mid(0), mid(1), mid(2)];
  const x = (head[0] ?? 0) - origin[0];
  const y = (head[1] ?? 0) - origin[1];
  const z = (head[2] ?? 0) - origin[2];
  const span = Math.hypot(x, y, z);
  if (!(span > 0)) return null;
  return { origin, up: [x / span, y / span, z / span], span };
}

/** A skinned mesh's data, read in the skin's bind space. */
export interface SkinGeometry {
  /** Bind-space positions, three per vertex. */
  positions: ArrayLike<number>;
  /** Four bone indices per vertex. */
  skinIndex: ArrayLike<number>;
  /** Four weights per vertex. */
  skinWeight: ArrayLike<number>;
  /** Triangle corners, three per triangle; `null` for an unindexed mesh. */
  index: ArrayLike<number> | null;
}

/**
 * The triangles of a skin a region covers, as corner indices ready for an index buffer: a vertex is
 * in when its heaviest bone belongs to one of the region's slots and it sits between the region's
 * heights; a triangle is in when two of its three corners are, so the cut edge follows the mesh. @internal
 */
export function wornTriangles(skin: SkinGeometry, slotOfBone: readonly (SkeletonSlot | null)[], frame: BodyFrame, region: WearRegion): Uint32Array {
  const vertexCount = Math.floor(skin.positions.length / 3);
  const wanted = new Set(region.slots);
  const from = region.from ?? -Infinity;
  const to = region.to ?? Infinity;
  const inside = new Uint8Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    let best = -1;
    let bestWeight = 0;
    for (let k = 0; k < 4; k++) {
      const weight = skin.skinWeight[v * 4 + k] ?? 0;
      if (weight > bestWeight) {
        bestWeight = weight;
        best = skin.skinIndex[v * 4 + k] ?? -1;
      }
    }
    const slot = best < 0 ? null : slotOfBone[best] ?? null;
    if (slot === null || !wanted.has(slot)) continue;
    const height =
      (((skin.positions[v * 3] ?? 0) - frame.origin[0]) * frame.up[0] +
        ((skin.positions[v * 3 + 1] ?? 0) - frame.origin[1]) * frame.up[1] +
        ((skin.positions[v * 3 + 2] ?? 0) - frame.origin[2]) * frame.up[2]) /
      frame.span;
    if (height >= from && height <= to) inside[v] = 1;
  }
  const index = skin.index;
  const corners = index === null ? vertexCount - (vertexCount % 3) : index.length - (index.length % 3);
  const corner = (at: number): number => (index === null ? at : index[at] ?? 0);
  const kept: number[] = [];
  for (let t = 0; t < corners; t += 3) {
    const a = corner(t);
    const b = corner(t + 1);
    const c = corner(t + 2);
    if ((inside[a] ?? 0) + (inside[b] ?? 0) + (inside[c] ?? 0) >= 2) kept.push(a, b, c);
  }
  return Uint32Array.from(kept);
}
