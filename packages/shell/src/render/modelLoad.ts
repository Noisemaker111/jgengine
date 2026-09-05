import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import {
  classifyAssetResponse,
  type AssetLoadDiagnosis,
  type AssetResponseProbe,
} from "@jgengine/core/scene/assetDiagnostics";
import { reportTextureLoadError } from "@jgengine/core/devtools/textureErrors";

import { resolveAssetBaseUrl } from "./assetBase";

/** Model containers already covered by the whole-model fallback probe; not "texture" errors. @internal */
const MODEL_URL_RE = /\.(glb|gltf)(\?|#|$)/i;

/**
 * The shared GLB {@link THREE.LoadingManager}'s `onError` sink. It fires for EVERY item the manager
 * loads — the GLB container AND each texture/image a `GLTFLoader` fetches for it. The container's own
 * failure is already surfaced by the model-fallback probe (it resolves to a placeholder), so this records
 * only the sub-resource (texture) failures the fallback probe cannot see — a model that resolves but whose
 * textures 404. Split out and exported so the wiring is unit-testable without a GL context.
 * @internal
 */
export function recordManagerLoadError(url: string): void {
  if (MODEL_URL_RE.test(url)) return;
  reportTextureLoadError(url);
}

/**
 * Dedicated LoadingManager for every GLB load instead of THREE.DefaultLoadingManager.
 * The shared default manager is process-wide; under repeated dev-server navigations its
 * AbortController can already be aborted, which silently stalls GLTFLoader.fetch forever
 * with no thrown error. A private manager sidesteps that (ported from the duet-keys ship).
 * @internal
 */
const modelLoadingManager = new THREE.LoadingManager();
modelLoadingManager.setURLModifier(resolveAssetBaseUrl);
// Capture GLTF texture/image load failures that never reach the top-level model onError (the model still
// resolves). Feeds the `textureErrors` probe so a texture-404'd scene is visible in debug_snapshot.
modelLoadingManager.onError = recordManagerLoadError;

/** How many leading bytes to read when probing a failed model URL for its signature. @internal */
const PROBE_BYTE_LIMIT = 64;

/**
 * Re-fetch a model URL that just failed to load and classify what actually came
 * back — a 404, a dev-server HTML fallback, a corrupt or non-model body — so the
 * runtime can replace an opaque GLTF parse error with a diagnosis naming the
 * broken asset contract. Runs only on the error path (loads rarely fail), and
 * never throws: a failed probe returns a `missing` diagnosis instead.
 * @internal
 */
export async function probeModelUrl(
  url: string,
  logicalId?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AssetLoadDiagnosis> {
  const base: AssetResponseProbe = logicalId === undefined ? { url } : { url, logicalId };
  try {
    const response = await fetchImpl(url);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer.slice(0, PROBE_BYTE_LIMIT));
    return classifyAssetResponse({
      ...base,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type") ?? undefined,
      bytes,
    });
  } catch {
    // The probe fetch itself failed (network/CORS) — the file is effectively unreachable.
    return classifyAssetResponse({ ...base, status: 0 });
  }
}

/**
 * Build a stand-in {@link GLTF} whose scene is a single magenta placeholder box,
 * returned in place of a model that could not be loaded. Consumers clone and
 * mount `gltf.scene` exactly as they would a real model, so one broken asset
 * degrades to a visible primitive instead of taking down the scene. The optional
 * `diagnosis` is stashed on `userData.jgengineDiagnosis` for debugging.
 * @internal
 */
export function createFallbackModel(diagnosis?: AssetLoadDiagnosis): GLTF {
  const scene = new THREE.Group();
  scene.name = "jgengine-missing-model";
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xd63384, roughness: 0.7, metalness: 0 }),
  );
  mesh.name = "jgengine-missing-model-box";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const userData: Record<string, unknown> = { jgengineFallback: true };
  if (diagnosis !== undefined) userData.jgengineDiagnosis = diagnosis;
  return {
    scene,
    scenes: [scene],
    animations: [],
    cameras: [],
    asset: { generator: "jgengine-fallback-model" },
    // The fallback never runs a GLTF parser; consumers only read `scene`/`animations`.
    parser: undefined as unknown as GLTF["parser"],
    userData,
  };
}

function warnMissingModel(message: string): void {
  if (typeof console !== "undefined") {
    console.warn(`[jgengine] ${message} Rendering a placeholder primitive in its place.`);
  }
}

/**
 * The failure seam for {@link DiagnosticGLTFLoader}: re-probe the URL a load just
 * failed on and decide what the loader should hand back. A diagnosed broken asset
 * (missing / HTML dev-server fallback / corrupt / unsupported) resolves via
 * `onLoad` to a {@link createFallbackModel} primitive so the failure is contained
 * at the load seam for **every** consumer — no reliance on a React error boundary
 * catching a rejected Suspense promise, which does not fire reliably for async
 * loader rejections inside the react-three-fiber reconciler. Only a genuine parse
 * error over bytes that still look like a valid model (`diagnosis.ok`) is surfaced
 * through `onError`. Split out from the loader so it is unit-testable without a GL
 * context; `overrides` inject the probe and warning sink in tests.
 * @internal
 */
export async function handleModelLoadFailure(
  resolvedUrl: string,
  originalEvent: unknown,
  onLoad: (gltf: GLTF) => void,
  onError: (event: unknown) => void,
  overrides: { probe?: typeof probeModelUrl; warn?: (message: string) => void } = {},
): Promise<void> {
  const probe = overrides.probe ?? probeModelUrl;
  const diagnosis = await probe(resolvedUrl);
  if (diagnosis.ok) {
    // The bytes look like a real model on re-fetch — surface the original parse error unchanged.
    onError(originalEvent);
    return;
  }
  (overrides.warn ?? warnMissingModel)(diagnosis.message);
  servedFallbacks.push({ url: resolvedUrl, message: diagnosis.message });
  onLoad(createFallbackModel(diagnosis));
}

const servedFallbacks: { url: string; message: string }[] = [];

/**
 * Every model the shared loader diagnosed as broken and replaced with a magenta placeholder, in
 * load order.
 *
 * A placeholder is already a console warning, but a warning does not fail anything — a shipped game
 * can render one in its starting area and nobody finds out until someone looks at a screenshot.
 * Reading this turns "the loader knows the asset is bad" into an assertable fact: a capture host or
 * a smoke test can require it to be empty.
 * @capability model-fallbacks models the loader replaced with a placeholder, for capture and smoke assertions
 */
export function modelLoadFallbacks(): readonly { url: string; message: string }[] {
  return servedFallbacks;
}

/** Drops the recorded placeholder list. For tests and between capture runs. @internal */
export function clearModelLoadFallbacks(): void {
  servedFallbacks.length = 0;
}

/** Per-model triangle ceiling before the loader warns. A prop is a few thousand triangles; a hero rig tens of thousands. */
export const DEFAULT_MODEL_TRIANGLE_BUDGET = 100_000;

let modelTriangleBudget = DEFAULT_MODEL_TRIANGLE_BUDGET;

/** Retune the per-model triangle budget (a cinematic game may raise it; a mobile target lowers it). Non-finite or non-positive values restore the default. */
export function setModelTriangleBudget(triangles: number): void {
  modelTriangleBudget = Number.isFinite(triangles) && triangles > 0 ? triangles : DEFAULT_MODEL_TRIANGLE_BUDGET;
}

/** Triangles a loaded model contributes per draw, summing every mesh (instanced meshes count once per instance). @internal */
export function countSceneTriangles(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh & { isMesh?: boolean; isInstancedMesh?: boolean; count?: number };
    if (mesh.isMesh !== true || mesh.geometry === undefined) return;
    const geometry = mesh.geometry;
    const vertices = geometry.index !== null ? geometry.index.count : geometry.attributes.position?.count ?? 0;
    const instances = mesh.isInstancedMesh === true && typeof mesh.count === "number" ? mesh.count : 1;
    total += Math.floor(vertices / 3) * instances;
  });
  return total;
}

/** One over-budget model as {@link heavyModels} reports it: the URL the loader fetched, its triangle count, and the budget it exceeded. */
export interface HeavyModelRecord {
  url: string;
  triangles: number;
  budget: number;
}

const heavyModelRecords: HeavyModelRecord[] = [];
const warnedHeavyUrls = new Set<string>();

function warnHeavyModel(record: HeavyModelRecord): void {
  if (typeof console === "undefined") return;
  console.warn(
    `[jgengine] model ${record.url} has ${record.triangles.toLocaleString()} triangles (budget ${record.budget.toLocaleString()}). A game prop should be a few thousand — pick a lighter asset or decimate it.`,
  );
}

/**
 * Record a loaded model's triangle count against the budget: over budget warns once per URL and lands in
 * {@link heavyModels}; under budget is silent. Split out so the wiring is unit-testable without a GL context.
 * @internal
 */
export function recordModelTriangles(url: string, triangles: number, overrides: { warn?: (record: HeavyModelRecord) => void } = {}): void {
  if (triangles <= modelTriangleBudget) return;
  const record = { url, triangles, budget: modelTriangleBudget };
  heavyModelRecords.push(record);
  if (warnedHeavyUrls.has(url)) return;
  warnedHeavyUrls.add(url);
  (overrides.warn ?? warnHeavyModel)(record);
}

/**
 * Every model the shared loader resolved whose triangle count exceeds the budget, in load order. A heavy
 * prop is invisible in a screenshot and only shows up as a slow frame, so the loader measures each GLB as it
 * lands and this exposes the verdict for `debug_snapshot` probes and smoke tests to assert against.
 * @capability heavy-models models over the per-model triangle budget, for perf probes and smoke assertions
 */
export function heavyModels(): readonly HeavyModelRecord[] {
  return heavyModelRecords;
}

/** Drops the heavy-model list and the once-per-URL warning memory. For tests and between capture runs. @internal */
export function clearHeavyModels(): void {
  heavyModelRecords.length = 0;
  warnedHeavyUrls.clear();
}

/**
 * A {@link GLTFLoader} whose success path is unchanged but whose failures degrade
 * gracefully: when a load errors, it probes the URL and — for a diagnosed broken
 * asset (missing / HTML fallback / corrupt / unsupported) — resolves to a
 * {@link createFallbackModel} placeholder primitive instead of rejecting, so the
 * one broken model never bubbles a throw past its mount. Drop-in for the shared
 * loader, so `useLoader(sharedGltfLoader, url)` benefits with no call-site change.
 * @internal
 */
export class DiagnosticGLTFLoader extends GLTFLoader {
  override load(
    url: string,
    onLoad: (gltf: GLTF) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (event: unknown) => void,
  ): void {
    super.load(
      url,
      (gltf: GLTF) => {
        recordModelTriangles(url, countSceneTriangles(gltf.scene));
        onLoad(gltf);
      },
      onProgress,
      (event: unknown) => {
        if (onError === undefined) return;
        // Probe the URL the loader actually fetched (base-resolved), not the raw input.
        void handleModelLoadFailure(this.manager.resolveURL(url), event, onLoad, onError).catch(() => onError(event));
      },
    );
  }
}

/** CDN-backed decoder configuration for compressed model and texture assets. */
export interface ModelLoaderConfig {
  dracoDecoderPath?: string;
  ktx2TranscoderPath?: string;
}

const DEFAULT_DRACO_DECODER_PATH = "https://cdn.jsdelivr.net/npm/three@0.182.0/examples/jsm/libs/draco/";
const DEFAULT_KTX2_TRANSCODER_PATH = "https://cdn.jsdelivr.net/npm/three@0.182.0/examples/jsm/libs/basis/";

let configuredModelLoaders: Readonly<Required<ModelLoaderConfig>> | undefined;
let ktx2Loader: KTX2Loader | undefined;

/** Configures shared Draco and KTX2 loaders. Repeated calls with the same paths are no-ops. */
export function configureModelLoaders(options: ModelLoaderConfig = {}): Readonly<Required<ModelLoaderConfig>> {
  const next = {
    dracoDecoderPath: options.dracoDecoderPath ?? DEFAULT_DRACO_DECODER_PATH,
    ktx2TranscoderPath: options.ktx2TranscoderPath ?? DEFAULT_KTX2_TRANSCODER_PATH,
  };
  if (configuredModelLoaders?.dracoDecoderPath === next.dracoDecoderPath && configuredModelLoaders.ktx2TranscoderPath === next.ktx2TranscoderPath) {
    return configuredModelLoaders;
  }
  const draco = new DRACOLoader().setDecoderPath(next.dracoDecoderPath);
  ktx2Loader = new KTX2Loader().setTranscoderPath(next.ktx2TranscoderPath);
  sharedGltfLoader.setDRACOLoader(draco);
  sharedGltfLoader.setKTX2Loader(ktx2Loader);
  configuredModelLoaders = next;
  return configuredModelLoaders;
}

/** Detects GPU support for the configured KTX2 transcoder after a renderer exists. */
export function detectKtx2Support(renderer: THREE.WebGLRenderer): void {
  configureModelLoaders();
  ktx2Loader?.detectSupport(renderer);
}

// LoadingManager reports queue transitions, not per-item events: `onStart` fires when the
// queue goes busy and `onLoad` when it drains (errors included, via itemEnd), so a flag plus
// a drain timestamp is the whole state.
let modelQueueBusy = false;
let modelQueueDrainedAt = 0;
const now = (): number => (typeof performance === "undefined" ? Date.now() : performance.now());
modelLoadingManager.onStart = () => {
  modelQueueBusy = true;
};
modelLoadingManager.onLoad = () => {
  modelQueueBusy = false;
  modelQueueDrainedAt = now();
};

/**
 * How long the shared GLB loader has been idle, in ms — `0` while any model is still
 * in flight. A capture host reads this to wait for streaming to finish instead of
 * guessing a settle delay: models that pop in after the shot are why an establishing
 * capture used to come back half-empty until someone hand-tuned `--settle`.
 * @capability model-load-idle how long the shared GLB loader has been idle, for capture settle waits
 */
export function modelLoadIdleMs(): number {
  if (modelQueueBusy) return 0;
  if (modelQueueDrainedAt === 0) return Number.POSITIVE_INFINITY;
  return now() - modelQueueDrainedAt;
}

/** Shared GLTF loader used by shell entity/object model mounts. @internal */
export const sharedGltfLoader = new DiagnosticGLTFLoader(modelLoadingManager);
sharedGltfLoader.setMeshoptDecoder(MeshoptDecoder);
configureModelLoaders();
