import type * as THREE from "three";
import type { ModelConfig, ModelVariantConfig, ModelVariantLodConfig } from "@jgengine/core/game/playableGame";
import type { ModelVariantSelector } from "@jgengine/core/world/modelLod";

/**
 * Shadow participation one variant level may declare for itself. `"inherit"` (the default) keeps the
 * model's own `shadows`, which is what every level did before a level could choose.
 */
export type VariantShadowMode = "inherit" | NonNullable<ModelConfig["shadows"]>;

/**
 * One variant level as a game writes it: the level's asset, how far it draws, and whether that level
 * shadows. A far level that stops casting leaves the shadow pass entirely, which is the pass that
 * redraws it on top of the visible one.
 */
export interface VariantShadowLevel extends ModelVariantConfig {
  /** This level's shadow participation; omit or `"inherit"` for the model's `shadows`. */
  shadows?: VariantShadowMode;
}

/** Variant levels that may each declare their own shadow participation. */
export interface VariantShadowLodConfig extends Omit<ModelVariantLodConfig, "levels"> {
  levels: readonly VariantShadowLevel[];
}

/**
 * Declares a model's detail levels, each able to say how it shadows. The result is a plain
 * `ModelVariantLodConfig`; the level's `shadows` rides along and the renderer reads it, so a palm's
 * far level can stop casting while a hero prop keeps its shadow.
 */
export function variantLevels(config: VariantShadowLodConfig): ModelVariantLodConfig {
  return config;
}

function levelOf(model: ModelConfig, level: number): VariantShadowLevel | undefined {
  const levels = model.variants?.levels;
  if (levels === undefined) return undefined;
  return levels[Math.min(levels.length - 1, Math.max(0, level))] as VariantShadowLevel;
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
