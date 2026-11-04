import type { ModelConfig } from "../game/playableGame";

/**
 * The model one entity draws for its `look` (`SceneEntity.look`): that entry of `model.looks` laid
 * over the model, so a look swaps the body while keeping the model's held, worn and attachment
 * tables unless it names its own. No look, or a name the model lacks, returns the model itself.
 * @capability entity-look pick one of a model's alternative bodies per entity, for character creators and skins
 */
export function modelForLook(model: ModelConfig, look: string | undefined): ModelConfig {
  if (look === undefined) return model;
  const over = model.looks?.[look];
  if (over === undefined) return model;
  // One object per model and look: renderers key their materials and bakes on the model they are
  // given, so a fresh copy each render rebuilt them (and relinked their shaders) every time.
  let known = drawnLooks.get(model);
  if (known === undefined) {
    known = new Map();
    drawnLooks.set(model, known);
  }
  const cached = known.get(look);
  if (cached !== undefined && cached.over === over) return cached.drawn;
  const drawn: ModelConfig = { ...model, ...over };
  delete drawn.looks;
  known.set(look, { over, drawn });
  return drawn;
}

const drawnLooks = new WeakMap<ModelConfig, Map<string, { over: object; drawn: ModelConfig }>>();

/** Every body a model can draw: itself, then each of its looks, for preloading or crowd batching. */
export function modelLooks(model: ModelConfig): ModelConfig[] {
  return [model, ...Object.keys(model.looks ?? {}).map((look) => modelForLook(model, look))];
}
