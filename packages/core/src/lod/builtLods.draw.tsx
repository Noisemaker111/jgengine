// @skill jgengine-world
import { useEffect, type ReactNode } from "react";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import { assetFileListed, resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import {
  builtLodFileUrl,
  builtLodMetaUrl,
  hasBuiltLodPath,
  meshLodSettings,
  parseBuiltLodMeta,
  resolveBuiltLods,
  type BuiltLodMeta,
  type MeshLodConfig,
} from "@jgengine/core/lod/builtLods";
import type { ImpostorAtlas } from "@jgengine/core/lod/impostor.draw";
import { scatterModelBaseTransform } from "@jgengine/core/scatter/scatterModels.draw";
import { trackSceneWork } from "@jgengine/core/model/modelLoad.draw";

// Draws cannot read the React context, so MeshLodSettings also pushes its config on a module stack;
// the world canvas is the only tree that sets it, and nested preview canvases never do.
const meshLodStack: (MeshLodConfig | undefined)[] = [];

/** The `visibility.meshLods` config of the nearest enclosing MeshLodSettings, for draw code. @internal */
export function currentMeshLodGame(): MeshLodConfig | undefined {
  return meshLodStack.at(-1);
}

/** Push a meshLods config for draws below; returns the pop. @internal */
export function pushMeshLodSettings(config: MeshLodConfig | undefined): () => void {
  meshLodStack.push(config);
  return () => {
    const index = meshLodStack.lastIndexOf(config);
    if (index >= 0) meshLodStack.splice(index, 1);
  };
}

/** Hands the game's `visibility.meshLods` to every model draw below it. @internal */
export function MeshLodSettings({ config, children }: { config: MeshLodConfig | undefined; children: ReactNode }) {
  useEffect(() => pushMeshLodSettings(config), [config]);
  return <>{children}</>;
}

/**
 * Reads `<url>.lods/meta.json` through the app's asset base (the dev runner maps a game's files under
 * its own folder), answering null without a request when the host lists the game's files and this
 * one is not among them, and null for a model nothing was built for (a 404, an HTML
 * fallback page, or a meta from another build version), so a checkout without built levels draws
 * exactly what it did before.
 * @internal
 */
export class BuiltLodMetaLoader extends THREE.Loader<BuiltLodMeta | null> {
  override load(url: string, onLoad: (meta: BuiltLodMeta | null) => void): void {
    const done = trackSceneWork(`lod:${url}`);
    const finish = (meta: BuiltLodMeta | null): void => {
      try {
        onLoad(meta);
      } finally {
        done();
      }
    };
    if (assetFileListed(url) === false) {
      queueMicrotask(() => finish(null));
      return;
    }
    fetch(resolveAssetBaseUrl(url))
      .then(async (response) => {
        if (!response.ok) return null;
        const text = await response.text();
        try {
          return parseBuiltLodMeta(JSON.parse(text));
        } catch {
          return null;
        }
      })
      .catch(() => null)
      .then(finish);
  }
}

/** What the runtime knows about one built level url: the source it was simplified from and its bounds. */
interface BuiltLevelSource {
  readonly source: string;
  readonly bounds: THREE.Box3;
}

const builtLevels = new Map<string, BuiltLevelSource>();
const metaBounds = new WeakMap<BuiltLodMeta, THREE.Box3>();

function boundsOf(meta: BuiltLodMeta): THREE.Box3 {
  let box = metaBounds.get(meta);
  if (box === undefined) {
    box = new THREE.Box3(new THREE.Vector3(...meta.bounds.min), new THREE.Vector3(...meta.bounds.max));
    metaBounds.set(meta, box);
  }
  return box;
}

function remember(url: string, meta: BuiltLodMeta): void {
  const bounds = boundsOf(meta);
  for (const level of meta.levels) builtLevels.set(builtLodFileUrl(url, level.file), { source: url, bounds });
}

/** The source model and bounds a built level url stands in for, or null for any other url. @internal */
export function builtLevelSource(url: string): BuiltLevelSource | null {
  return builtLevels.get(url) ?? null;
}

const SOURCE_MATERIAL_KEY = "jgSourceMaterial";
const reskinned = new WeakSet<THREE.Object3D>();

/**
 * Give a built level the source model's own materials. The build keeps each material's index in the
 * source file and drops the textures, so a level costs geometry only and shares the source's maps on
 * the GPU instead of uploading a second copy.
 * @internal
 */
export function reskinBuiltLevel(level: THREE.Object3D, source: GLTF): void {
  if (reskinned.has(level)) return;
  reskinned.add(level);
  const byIndex = new Map<number, THREE.Material>();
  const byName = new Map<string, THREE.Material>();
  source.scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials: THREE.Material[] = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      const index = source.parser.associations.get(material)?.materials;
      if (index !== undefined && !byIndex.has(index)) byIndex.set(index, material);
      if (material.name !== "" && !byName.has(material.name)) byName.set(material.name, material);
    }
  });
  const swap = (material: THREE.Material): THREE.Material => {
    const index: unknown = material.userData[SOURCE_MATERIAL_KEY];
    const match = (typeof index === "number" ? byIndex.get(index) : undefined) ?? byName.get(material.name);
    return match ?? material;
  };
  level.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.material = Array.isArray(node.material) ? node.material.map(swap) : swap(node.material);
  });
}

/** Vertical field of view in radians a resolve uses, rounded to whole degrees so a small zoom rebuilds nothing. @internal */
export function cameraFov(camera: THREE.Camera): number {
  const degrees = camera instanceof THREE.PerspectiveCamera ? Math.round(camera.fov) : 50;
  return THREE.MathUtils.degToRad(degrees);
}

/** The scale a model's own normalization applies to its file, read from the source bounds. */
function normalizationScale(model: ModelConfig, bounds: THREE.Box3): number {
  let scale = model.scale ?? 1;
  if (model.targetHeight !== undefined) {
    const height = bounds.max.y - bounds.min.y;
    if (Number.isFinite(height) && height > 0) scale *= model.targetHeight / height;
  }
  return scale;
}

/** A model whose draw switches through built levels: the resolved model and its built metadata. */
export interface BuiltLodModel {
  readonly model: ModelConfig;
  readonly meta: BuiltLodMeta | null;
}

const metaLoads = new Map<string, Promise<BuiltLodMeta | null>>();

/**
 * Draw-side form of {@link BuiltLodMetaLoader.load}: the same meta.json fetch, shared per url.
 * @internal
 */
export function loadBuiltLodMeta(url: string): Promise<BuiltLodMeta | null> {
  let promise = metaLoads.get(url);
  if (promise === undefined) {
    const done = trackSceneWork(`lod:${url}`);
    promise = (async () => {
      try {
        if (assetFileListed(url) === false) return null;
        const response = await fetch(resolveAssetBaseUrl(url));
        if (!response.ok) return null;
        const text = await response.text();
        try {
          return parseBuiltLodMeta(JSON.parse(text));
        } catch {
          return null;
        }
      } catch {
        return null;
      } finally {
        done();
      }
    })();
    metaLoads.set(url, promise);
    void promise.then(() => metaLoads.delete(url));
  }
  return promise;
}

/**
 * Draw-side form of the old WithBuiltLods resolution: the model with the levels the asset build
 * wrote for its file, or the model unchanged when nothing was built or meshLods are off.
 * @internal
 */
export async function resolveBuiltLodModel(model: ModelConfig, impostors: boolean, fov: number, game: MeshLodConfig | undefined): Promise<BuiltLodModel> {
  const settings = meshLodSettings(game, model.meshLods);
  if (settings === null || !hasBuiltLodPath(model.url)) return { model, meta: null };
  const meta = await loadBuiltLodMeta(builtLodMetaUrl(model.url));
  if (meta === null) return { model, meta: null };
  remember(model.url, meta);
  const bounds = boundsOf(meta);
  const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius * normalizationScale(model, bounds);
  const config = impostors ? settings : { screenSizes: settings.screenSizes, ...(settings.hysteresis === undefined ? {} : { hysteresis: settings.hysteresis }) };
  const built = resolveBuiltLods(model.url, meta, config, radius, fov);
  return built === null ? { model, meta } : { model: { ...model, variants: built.variants }, meta };
}

const impostorTextureLoads = new Map<string, Promise<THREE.Texture>>();

function loadImpostorTexture(url: string): Promise<THREE.Texture> {
  const resolved = resolveAssetBaseUrl(url);
  let promise = impostorTextureLoads.get(resolved);
  if (promise === undefined) {
    promise = new THREE.TextureLoader().loadAsync(resolved);
    impostorTextureLoads.set(resolved, promise);
    promise.catch(() => impostorTextureLoads.delete(resolved));
  }
  return promise;
}

/**
 * Draw-side form of {@link useBakedImpostor}: the baked impostor atlas of a built model placed in the
 * model's normalized space, or null while/if the textures fail.
 * @internal
 */
export async function loadBakedImpostor(model: ModelConfig, meta: BuiltLodMeta): Promise<ImpostorAtlas | null> {
  const impostor = meta.impostor;
  if (impostor === undefined) return null;
  const [albedo, normal] = await Promise.all([
    loadImpostorTexture(builtLodFileUrl(model.url, impostor.albedo)),
    loadImpostorTexture(builtLodFileUrl(model.url, impostor.normal)),
  ]);
  for (const texture of [albedo, normal]) {
    // The build writes rows as the GPU read them back, bottom first.
    texture.flipY = false;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
  }
  albedo.colorSpace = THREE.SRGBColorSpace;
  normal.colorSpace = THREE.NoColorSpace;
  const bounds = boundsOf(meta);
  const base = scatterModelBaseTransform(new THREE.Object3D(), model, bounds);
  const center = new THREE.Vector3(...impostor.center).applyMatrix4(base);
  return {
    albedo,
    normal,
    frames: impostor.frames,
    center,
    radius: impostor.radius * base.getMaxScaleOnAxis(),
    dispose() {
      // The loader cache owns the textures; another model sharing the file may still draw them.
    },
  };
}

