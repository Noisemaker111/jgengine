// @skill jgengine-world
import { useLoader, useThree } from "@react-three/fiber";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
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

const MeshLodContext = createContext<MeshLodConfig | undefined>(undefined);

/** Hands the game's `visibility.meshLods` to every model draw below it. @internal */
export function MeshLodSettings({ config, children }: { config: MeshLodConfig | undefined; children: ReactNode }) {
  return <MeshLodContext.Provider value={config}>{children}</MeshLodContext.Provider>;
}

/**
 * Reads `<url>.lods/meta.json` through the app's asset base (the dev runner maps a game's files under
 * its own folder), answering null for a model nothing was built for (a 404, an HTML
 * fallback page, or a meta from another build version), so a checkout without built levels draws
 * exactly what it did before.
 * @internal
 */
export class BuiltLodMetaLoader extends THREE.Loader<BuiltLodMeta | null> {
  override load(url: string, onLoad: (meta: BuiltLodMeta | null) => void): void {
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
      .then(onLoad);
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

/** Vertical field of view in radians a resolve uses, rounded to whole degrees so a small zoom rebuilds nothing. */
function cameraFov(camera: THREE.Camera): number {
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

/**
 * Hands `children` the model to draw: `model` with the levels the asset build wrote for its file,
 * switched by size on screen. Its `variants` become the source, every built level the game's
 * `visibility.meshLods` reaches and, when `impostors` is true and an atlas was baked, the impostor
 * (`IMPOSTOR_LEVEL_URL`). A model without built levels, or with `meshLods: false`, comes back
 * unchanged. Suspends while the metadata loads.
 * @internal
 */
export function WithBuiltLods({ model, impostors, children }: {
  model: ModelConfig;
  impostors: boolean;
  children: (resolved: BuiltLodModel) => ReactNode;
}) {
  const game = useContext(MeshLodContext);
  const settings = meshLodSettings(game, model.meshLods);
  if (settings === null || !hasBuiltLodPath(model.url)) return <>{children({ model, meta: null })}</>;
  return <BuiltLodResolver model={model} settings={settings} impostors={impostors}>{children}</BuiltLodResolver>;
}

function BuiltLodResolver({ model, settings, impostors, children }: {
  model: ModelConfig;
  settings: MeshLodConfig;
  impostors: boolean;
  children: (resolved: BuiltLodModel) => ReactNode;
}) {
  const meta = useLoader(BuiltLodMetaLoader, builtLodMetaUrl(model.url));
  const fov = cameraFov(useThree((state) => state.camera));
  const key = JSON.stringify(settings);
  const resolved = useMemo((): BuiltLodModel => {
    if (meta === null) return { model, meta: null };
    remember(model.url, meta);
    const bounds = boundsOf(meta);
    const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius * normalizationScale(model, bounds);
    const config = impostors ? settings : { screenSizes: settings.screenSizes, ...(settings.hysteresis === undefined ? {} : { hysteresis: settings.hysteresis }) };
    const built = resolveBuiltLods(model.url, meta, config, radius, fov);
    return built === null ? { model, meta } : { model: { ...model, variants: built.variants }, meta };
    // `key` stands for `settings`, a fresh object every render.
  }, [model, meta, fov, impostors, key]);
  return <>{children(resolved)}</>;
}

/**
 * The baked impostor atlas of a built model, placed in the model's normalized space (its targetHeight,
 * scale and anchor applied), so the cards stand where the meshes stood. Suspends while it loads.
 * @internal
 */
export function useBakedImpostor(model: ModelConfig, meta: BuiltLodMeta): ImpostorAtlas | null {
  const impostor = meta.impostor;
  const urls = impostor === undefined ? [] : [builtLodFileUrl(model.url, impostor.albedo), builtLodFileUrl(model.url, impostor.normal)];
  const textures = useLoader(THREE.TextureLoader, urls);
  return useMemo(() => {
    const [albedo, normal] = textures;
    if (impostor === undefined || albedo === undefined || normal === undefined) return null;
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
  }, [textures, impostor, meta, model]);
}
