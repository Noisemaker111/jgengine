import type * as THREE from "three";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { ModelVariantConfig, ModelVariantSelector } from "@jgengine/core/world/modelLod";

function levelOf(model: ModelConfig, level: number): ModelVariantConfig | undefined {
  const levels = model.variants?.levels;
  if (levels === undefined) return undefined;
  return levels[Math.min(levels.length - 1, Math.max(0, level))]!;
}

/**
 * Shadow participation the model draws with at one level: the level's own choice when it made one,
 * otherwise the model's `shadows` untouched.
 * @internal
 */
export function variantLevelShadows(model: ModelConfig, level: number): ModelConfig["shadows"] {
  const chosen = levelOf(model, level)?.shadows;
  return chosen === undefined || chosen === "inherit" ? model.shadows : chosen;
}

/**
 * The model any path draws at one variant level: that level's asset, its shadow participation, and no
 * nested variants, so a prop rendered on its own, a batched instance and a scatter cell all switch
 * the same way. Out-of-range levels clamp to the nearest one, and a model without variants is
 * returned untouched.
 * @internal
 */
export function variantLevelModel(model: ModelConfig, level: number): ModelConfig {
  const chosen = levelOf(model, level);
  if (chosen === undefined) return model;
  const shadows = variantLevelShadows(model, level);
  return {
    ...model,
    url: chosen.url,
    variants: undefined,
    ...(shadows === undefined ? {} : { shadows }),
  };
}

/**
 * Metres from the camera's world position to a placement, written through the caller's scratch vectors
 * so a frame allocates nothing.
 * @internal
 */
export function placementDistance(
  camera: THREE.Camera,
  position: readonly number[],
  cameraAt: THREE.Vector3,
  probe: THREE.Vector3,
): number {
  camera.getWorldPosition(cameraAt);
  probe.set(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0);
  return cameraAt.distanceTo(probe);
}

/**
 * The level one isolated prop draws this frame. The answer comes from the same
 * {@link ModelVariantSelector} the batched prop path asks, at the prop's own camera distance, so the
 * hysteresis and the `lodBandIndex` boundary are identical for a prop placed at runtime and one
 * authored in the scene.
 * @internal
 */
export function singleVariantLevel(
  selector: ModelVariantSelector,
  id: string,
  camera: THREE.Camera,
  position: readonly number[],
  cameraAt: THREE.Vector3,
  probe: THREE.Vector3,
): number {
  return selector.level(id, placementDistance(camera, position, cameraAt, probe));
}
