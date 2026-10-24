import type * as THREE from "three";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import type { ModelVariantLodConfig, ModelVariantSelector } from "@jgengine/core/world/modelLod";
import { DEFAULT_VARIANT_HYSTERESIS } from "@jgengine/core/world/modelLod";
import type { SystemProbe } from "@jgengine/core/devtools/types";

/**
 * Metres of camera travel a path tolerates before it re-runs its level pass when it cannot tell how
 * close an instance sits to a switch edge. The scatter path passes this as its margin; a path that
 * knows the switch distances passes their real margin instead.
 * @internal
 */
export const LEVEL_PASS_MIN_CAMERA_MOVE = 0.5;

let passes = 0;
let skips = 0;
let frames = 0;

/** Count one frame a level pass was offered. @internal */
export function noteLevelPassFrame(): void {
  frames += 1;
}

/** Count one level pass that ran or was skipped. @internal */
export function noteLevelPass(ran: boolean): void {
  if (ran) passes += 1;
  else skips += 1;
}

/** Clear the level pass counters. For tests and between capture runs. @internal */
export function resetLevelPassStats(): void {
  passes = 0;
  skips = 0;
  frames = 0;
}

function readLevelPass(): { counters: Record<string, number>; line: string } {
  const perFrame = frames === 0 ? 0 : Math.round((passes / frames) * 100) / 100;
  return {
    counters: { levelPasses: passes, levelPassSkips: skips, levelPassFrames: frames, levelPassesPerFrame: perFrame },
    line: `${passes} level passes / ${frames} frames (${perFrame}/frame) � ${skips} skipped`,
  };
}

/**
 * The level-pass system probe: how many per-instance variant level passes ran, how many the
 * camera-unchanged skip removed, and the per-frame average. `debug_snapshot().systems` names the CPU
 * cost a still or distant camera no longer pays instead of leaving it to a profile.
 * @internal
 */
export function levelPassProbe(): SystemProbe {
  return {
    counters: () => readLevelPass().counters,
    state: () => readLevelPass().line,
  };
}

/**
 * True when the camera has moved far enough that some instance's level could differ from the last
 * pass. Moving the camera by `d` changes every instance distance by at most `d`, so a pass whose
 * smallest margin to a switch edge was `margin` cannot change until the camera moves that far. A
 * margin of `0` (an instance sitting on its edge) always runs.
 * @internal
 */
export function levelPassNeeded(last: THREE.Vector3, camera: THREE.Vector3, margin: number): boolean {
  return camera.distanceToSquared(last) >= margin * margin;
}

/** Holds the last pass's camera position and its distance to the nearest switch edge. @internal */
export interface LevelPassGate {
  /** True when this frame's pass could change an answer, or when no pass has run yet. */
  needsPass(camera: THREE.Vector3): boolean;
  /** Record a pass that ran: its camera position and the smallest margin it measured. */
  record(camera: THREE.Vector3, margin: number): void;
  /** Forget the last pass, so the next frame runs one. */
  invalidate(): void;
}

/** A skip gate for one batch's level pass. @internal */
export function createLevelPassGate(): LevelPassGate {
  let x = 0;
  let y = 0;
  let z = 0;
  let margin = 0;
  let recorded = false;
  return {
    needsPass(camera) {
      if (!recorded) return true;
      const dx = camera.x - x;
      const dy = camera.y - y;
      const dz = camera.z - z;
      return dx * dx + dy * dy + dz * dz >= margin * margin;
    },
    record(camera, next) {
      x = camera.x;
      y = camera.y;
      z = camera.z;
      margin = next;
      recorded = true;
    },
    invalidate() {
      recorded = false;
    },
  };
}

/**
 * A model's switch edges as the level pass measures against them: one finite boundary per level
 * below the last, and the hysteresis an instance must clear before it crosses one.
 * @internal
 */
export interface VariantSwitch {
  readonly boundaries: readonly number[];
  readonly hysteresis: number;
}

/** Read a model's variant config as {@link VariantSwitch}. @internal */
export function variantSwitchOf(variants: ModelVariantLodConfig): VariantSwitch {
  const boundaries: number[] = [];
  for (let index = 0; index < variants.levels.length - 1; index += 1) {
    boundaries.push(variants.levels[index]!.maxDistance!);
  }
  return { boundaries, hysteresis: Math.max(0, variants.hysteresis ?? DEFAULT_VARIANT_HYSTERESIS) };
}

/**
 * Metres from one instance's distance to the nearest distance at which its level would change: the
 * level's own boundary plus the hysteresis going out, the level below's boundary minus it coming
 * back. Zero means the instance sits on its edge.
 * @internal
 */
export function levelEdgeMargin(distance: number, level: number, variantSwitch: VariantSwitch): number {
  const { boundaries, hysteresis } = variantSwitch;
  let margin = Number.POSITIVE_INFINITY;
  if (level < boundaries.length) margin = Math.abs(distance - (boundaries[level]! + hysteresis));
  if (level > 0) margin = Math.min(margin, Math.abs(distance - (boundaries[level - 1]! - hysteresis)));
  return margin;
}

/**
 * One batch's per-instance level pass: asks the shared {@link ModelVariantSelector} for every live
 * instance's level at its camera distance, writes the answers into `into`, and returns the smallest
 * margin any instance had to its switch edge so the caller can skip the next pass that cannot change
 * an answer.
 * @internal
 */
export function assignVariantLevels(
  selector: ModelVariantSelector,
  variantSwitch: VariantSwitch,
  objects: readonly SceneObject[],
  live: (id: string) => SceneObject | null,
  camera: THREE.Vector3,
  into: Map<string, number>,
  probe: THREE.Vector3,
): number {
  let margin = Number.POSITIVE_INFINITY;
  for (const object of objects) {
    const current = live(object.instanceId) ?? object;
    probe.set(current.position[0] ?? 0, current.position[1] ?? 0, current.position[2] ?? 0);
    const distance = camera.distanceTo(probe);
    const level = selector.level(object.instanceId, distance);
    into.set(object.instanceId, level);
    const edge = levelEdgeMargin(distance, level, variantSwitch);
    if (edge < margin) margin = edge;
  }
  return margin;
}
