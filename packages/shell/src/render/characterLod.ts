import type { ModelLodConfig } from "@jgengine/core/game/playableGame";
import type { SystemProbe } from "@jgengine/core/devtools/types";

/** Distance policy a character model's {@link ModelLodConfig} resolves to; every distance is metres. */
export interface CharacterLodPolicy {
  fullRateDistance: number;
  halfRateDistance: number;
  crowdDistance: number;
  crowdHysteresis: number;
}

/** The engine's default character tiers: full under 15 m, half under 40 m, GPU crowd beyond 25 m. */
export const DEFAULT_CHARACTER_LOD: CharacterLodPolicy = {
  fullRateDistance: 15,
  halfRateDistance: 40,
  crowdDistance: 25,
  crowdHysteresis: 2,
};

/** What a character's distance from the camera costs it this frame. */
export type CharacterLodTier = "full" | "half" | "quarter" | "crowd";

/**
 * Fills a model's authoring gaps with {@link DEFAULT_CHARACTER_LOD}. A missing, negative or
 * non-finite distance falls back to the default rather than producing a tier that never matches.
 * @internal
 */
export function characterLodPolicy(config: ModelLodConfig | undefined): CharacterLodPolicy {
  const finite = (value: number | undefined, fallback: number): number =>
    value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
  const policy: CharacterLodPolicy = {
    fullRateDistance: finite(config?.fullRateDistance, DEFAULT_CHARACTER_LOD.fullRateDistance),
    halfRateDistance: finite(config?.halfRateDistance, DEFAULT_CHARACTER_LOD.halfRateDistance),
    crowdDistance: finite(config?.crowdDistance, DEFAULT_CHARACTER_LOD.crowdDistance),
    crowdHysteresis: finite(config?.crowdHysteresis, DEFAULT_CHARACTER_LOD.crowdHysteresis),
  };
  // Tiers read in order, so a game that sets half below full would otherwise make "full" unreachable.
  policy.halfRateDistance = Math.max(policy.halfRateDistance, policy.fullRateDistance);
  return policy;
}

/**
 * The tier a character at `distance` falls in. Passing the tier it held last frame applies the crowd
 * hysteresis, so a character walking along the crowd boundary does not swap representation every frame.
 */
export function characterLodTier(
  distance: number,
  config: ModelLodConfig | undefined,
  previous?: CharacterLodTier,
): CharacterLodTier {
  const policy = characterLodPolicy(config);
  const crowdBoundary = previous === "crowd" ? policy.crowdDistance - policy.crowdHysteresis : policy.crowdDistance;
  if (distance >= crowdBoundary) return "crowd";
  if (distance < policy.fullRateDistance) return "full";
  if (distance < policy.halfRateDistance) return "half";
  return "quarter";
}

/** Share of frames a tier poses the rig: 1, 0.5, 0.25, and 0 once the GPU crowd draws it. */
export function characterLodRate(tier: CharacterLodTier): number {
  switch (tier) {
    case "full":
      return 1;
    case "half":
      return 0.5;
    case "quarter":
      return 0.25;
    case "crowd":
      return 0;
  }
}

/** Frames between pose updates for a tier: 1, 2, 4, and `0` meaning "never" for the crowd tier. */
export function characterLodInterval(tier: CharacterLodTier): number {
  const rate = characterLodRate(tier);
  return rate === 0 ? 0 : Math.round(1 / rate);
}

interface RigRecord {
  /** Skinned meshes the model renders. */
  parts: number;
  /** Bones one pose write touches. */
  bones: number;
}

const rigs = new Map<string, RigRecord>();
const tiers = new Map<string, CharacterLodTier>();
const phases = new Map<string, { clip: string; time: number }>();
let poseWrites = 0;
let poses = 0;
let frames = 0;
const crowdInstances = new Map<string, number>();

/** Record a mounted character rig so the probe can report its parts and bones. @internal */
export function registerCharacterRig(instanceId: string, parts: number, bones: number): void {
  rigs.set(instanceId, { parts, bones });
}

/** Drop a character rig that unmounted. @internal */
export function unregisterCharacterRig(instanceId: string): void {
  rigs.delete(instanceId);
  tiers.delete(instanceId);
  phases.delete(instanceId);
}

/** The tier the world marker decided this frame; the animation driver reads it instead of measuring distance twice. @internal */
export function setCharacterLodTier(instanceId: string, tier: CharacterLodTier): void {
  tiers.set(instanceId, tier);
}

/** Forget a tier when its marker unmounts. @internal */
export function clearCharacterLodTier(instanceId: string): void {
  tiers.delete(instanceId);
}

/** The tier a mounted character is on; full rate when nothing decided (previews, custom renderers). @internal */
export function characterLodTierOf(instanceId: string | undefined): CharacterLodTier {
  return instanceId === undefined ? "full" : tiers.get(instanceId) ?? "full";
}

/** Record one pose write (a mixer update) for a rig, in bones. @internal */
export function noteCharacterPose(instanceId: string): void {
  const rig = rigs.get(instanceId);
  if (rig === undefined) return;
  poseWrites += rig.bones;
  poses += 1;
}

/** Publish the clip and time a rig is posing at, so the crowd can continue the same pose at the swap. @internal */
export function noteAnimationPhase(instanceId: string, clip: string, time: number): void {
  phases.set(instanceId, { clip, time });
}

/** The clip phase a character was last posed at, or `undefined` when it never posed. @internal */
export function animationPhaseOf(instanceId: string): { clip: string; time: number } | undefined {
  return phases.get(instanceId);
}

/** Record how many crowd members each batch drew this frame. @internal */
export function noteCrowdInstances(kind: string, count: number): void {
  crowdInstances.set(kind, count);
}

/** Drop a crowd batch's instance count when it unmounts. @internal */
export function clearCrowdKind(kind: string): void {
  crowdInstances.delete(kind);
}

/** Count one animated frame, so pose writes report as a per-frame average. @internal */
export function noteCharacterFrame(): void {
  frames += 1;
}

/** Clear every character counter. For tests and between capture runs. @internal */
export function resetCharacterLodStats(): void {
  rigs.clear();
  tiers.clear();
  phases.clear();
  poseWrites = 0;
  poses = 0;
  frames = 0;
  crowdInstances.clear();
}

function readCharacterLod(): { counters: Record<string, number>; line: string } {
  const counts = { full: 0, half: 0, quarter: 0, crowd: 0 };
  let parts = 0;
  let bones = 0;
  for (const [id, rig] of rigs) {
    parts += rig.parts;
    bones += rig.bones;
    counts[tiers.get(id) ?? "full"] += 1;
  }
  const boneWrites = frames === 0 ? 0 : Math.round(poseWrites / frames);
  let crowd = 0;
  for (const count of crowdInstances.values()) crowd += count;
  return {
    counters: {
      rigs: rigs.size,
      skinnedParts: parts,
      bones,
      boneWritesPerFrame: boneWrites,
      poses,
      crowdInstances: crowd,
      fullRate: counts.full,
      halfRate: counts.half,
      quarterRate: counts.quarter,
      crowdRate: counts.crowd,
    },
    line: `${rigs.size} rigs · ${parts} skinned parts · ${boneWrites}/${bones} bone writes/frame · crowd ${crowd}`,
  };
}

/**
 * The character-LOD system probe: rigs by tier, skinned parts, and the bone pose writes per frame the
 * distance tiers leave. Mounted by the world's crowd layer, so `debug_snapshot` names the cost a
 * character change removed instead of leaving it to a profile.
 * @internal
 */
export function characterLodProbe(): SystemProbe {
  return {
    counters: () => readCharacterLod().counters,
    state: () => readCharacterLod().line,
  };
}

