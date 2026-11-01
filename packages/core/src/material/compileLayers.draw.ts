import * as THREE from "three";

type CompileHook = THREE.Material["onBeforeCompile"];
type CacheKey = THREE.Material["customProgramCacheKey"];

const priorHooks = new WeakMap<CompileHook, CompileHook>();
const priorKeys = new WeakMap<CacheKey, CacheKey>();
const layerDefines = new Set<string>();
const layerUserData = new Set<string>();
const batchSafe = new WeakMap<CompileHook, string>([[THREE.Material.prototype.onBeforeCompile, ""]]);
const hookUserData = new Set<string>();

/**
 * Record a scene-wide shader layer (wet surfaces, cascaded shadows) a binder wrapped around a
 * material's own compile hook: what the hook and cache key were before it, and the defines and
 * `userData` keys the layer adds. The layer's binder applies it again to any material it finds in the
 * scene, so a copy made without it (see {@link withoutCompileLayers}) gets it back once it is drawn.
 * @internal
 */
export function recordCompileLayer(
  material: THREE.Material,
  prior: { hook: CompileHook; key?: CacheKey | undefined },
  owns: { defines?: readonly string[]; userData?: readonly string[] } = {},
): void {
  if (material.onBeforeCompile !== prior.hook) priorHooks.set(material.onBeforeCompile, prior.hook);
  if (prior.key !== undefined && material.customProgramCacheKey !== prior.key) priorKeys.set(material.customProgramCacheKey, prior.key);
  for (const name of owns.defines ?? []) layerDefines.add(name);
  for (const key of owns.userData ?? []) layerUserData.add(key);
}

/** The material's own compile hook under every recorded scene-wide layer. @internal */
export function ownCompileHook(material: THREE.Material): CompileHook {
  let hook = material.onBeforeCompile;
  for (let prior = priorHooks.get(hook); prior !== undefined; prior = priorHooks.get(hook)) hook = prior;
  return hook;
}

/** The material's own program cache key function under every recorded scene-wide layer. @internal */
export function ownCacheKey(material: THREE.Material): CacheKey {
  let key = material.customProgramCacheKey;
  for (let prior = priorKeys.get(key); prior !== undefined; prior = priorKeys.get(key)) key = prior;
  return key;
}

/** Whether a define or `userData` key belongs to a scene-wide layer rather than the material. @internal */
export function isLayerDefine(name: string): boolean {
  return layerDefines.has(name);
}

/** @internal */
export function isLayerUserData(key: string): boolean {
  return layerUserData.has(key);
}

/**
 * Declare that a compile hook reads the instance matrix the same way under a `BatchedMesh`
 * (`batchingMatrix`, `USE_BATCHING`) as under an `InstancedMesh`, or reads none. Materials whose own
 * hook is batch-safe can share a batched draw. A hook that keeps its own uniforms names what they
 * hold in `signature` (two materials draw alike only when it matches) and the `userData` keys it
 * keeps them in, which a material's signature then leaves out.
 * @internal
 */
export function markBatchSafe(hook: CompileHook, own: { signature?: string; userData?: readonly string[] } = {}): void {
  batchSafe.set(hook, own.signature ?? "");
  for (const key of own.userData ?? []) hookUserData.add(key);
}

/** A batch-safe hook's signature, or undefined for a hook not declared batch-safe. @internal */
export function batchSafeSignature(hook: CompileHook): string | undefined {
  return batchSafe.get(hook);
}

/** Whether a material's own hook (scene-wide layers aside) compiles correctly under a `BatchedMesh`. @internal */
export function compilesBatched(material: THREE.Material): boolean {
  return batchSafe.has(ownCompileHook(material));
}

/** What a material's own batch-safe hook draws with, beyond the material's values; empty for none. @internal */
export function batchHookSignature(material: THREE.Material): string {
  return batchSafe.get(ownCompileHook(material)) ?? "";
}

/** Whether a `userData` key holds a hook's own state (see {@link markBatchSafe}). @internal */
export function isHookUserData(key: string): boolean {
  return hookUserData.has(key);
}

/**
 * A copy of `material` as it was before any scene-wide layer: its own compile hook and cache key, and
 * none of the layers' defines or `userData` keys. The layers' binders patch the copy when it is drawn.
 * @internal
 */
export function withoutCompileLayers(material: THREE.Material): THREE.Material {
  const copy = material.clone();
  copy.onBeforeCompile = ownCompileHook(material);
  copy.customProgramCacheKey = ownCacheKey(material);
  for (const name of Object.keys(copy.defines ?? {})) if (layerDefines.has(name)) delete copy.defines?.[name];
  for (const key of Object.keys(copy.userData)) if (layerUserData.has(key)) delete copy.userData[key];
  return copy;
}
