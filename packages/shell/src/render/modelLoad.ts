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
import { mergeModelSubMeshes, mergeSkinnedModelParts } from "./modelMeshMerge";
import { applyModelSurface } from "./modelSurface";
import { sharedModelImages } from "./sharedModelImages";

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
 * The short name a missing model is reported by: its folder and file name without the extension,
 * so `/models/kaykit-city-builder/building_A.glb` reads `kaykit-city-builder/building_A`.
 * @internal
 */
export function missingModelName(url: string): string {
  const path = url.split(/[?#]/)[0] ?? url;
  const parts = path.split("/").filter((part) => part !== "");
  let file = (parts.pop() ?? path).replace(/\.(glb|gltf)$/i, "");
  // Library models are `<category>/<name>/model.glb`: the folders carry the name.
  if (/^(model|scene|index)$/i.test(file) && parts.length > 0) file = parts.pop()!;
  const folder = parts.pop();
  return folder === undefined || folder === "models" || folder === "library" ? file : `${folder}/${file}`;
}

let labelMissingModels = false;

/**
 * Write each missing model's name on its placeholder box. The shell turns it on with devtools (dev
 * builds), so a broken asset reads by name in the world instead of as one more identical box.
 * @internal
 */
export function armMissingModelLabels(on: boolean): void {
  labelMissingModels = on;
}

function nameLabelTexture(name: string): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const c = canvas.getContext("2d");
  if (c === null) return null;
  c.fillStyle = "#d63384";
  c.fillRect(0, 0, 256, 256);
  c.strokeStyle = "#1a0710";
  c.lineWidth = 10;
  c.strokeRect(5, 5, 246, 246);
  c.fillStyle = "#ffffff";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = "bold 30px sans-serif";
  c.fillText("MISSING", 128, 58);
  const lines = name.split("/").slice(-2);
  const longest = Math.max(...lines.map((line) => line.length), 1);
  const size = Math.max(14, Math.min(34, Math.floor(380 / longest)));
  c.font = `bold ${size}px sans-serif`;
  lines.forEach((line, index) => c.fillText(line, 128, 124 + index * (size + 10)));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Build a stand-in {@link GLTF} whose scene is a single magenta placeholder box,
 * returned in place of a model that could not be loaded. Consumers clone and
 * mount `gltf.scene` exactly as they would a real model, so one broken asset
 * degrades to a visible primitive instead of taking down the scene. With labels
 * armed (dev builds) every face carries the model's `name`. The optional
 * `diagnosis` is stashed on `userData.jgengineDiagnosis` for debugging.
 * @internal
 */
export function createFallbackModel(diagnosis?: AssetLoadDiagnosis, name?: string): GLTF {
  const scene = new THREE.Group();
  scene.name = "jgengine-missing-model";
  const label = name !== undefined && labelMissingModels ? nameLabelTexture(name) : null;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: label === null ? 0xd63384 : 0xffffff, map: label, roughness: 0.7, metalness: 0 }),
  );
  mesh.name = "jgengine-missing-model-box";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const userData: Record<string, unknown> = { jgengineFallback: true };
  if (diagnosis !== undefined) userData.jgengineDiagnosis = diagnosis;
  if (name !== undefined) userData.jgengineMissingModel = name;
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
  const name = missingModelName(resolvedUrl);
  recordMissingModel({ name, url: resolvedUrl, message: diagnosis.message });
  onLoad(createFallbackModel(diagnosis, name));
}

/** A model the loader could not load and replaced with a placeholder box. */
export interface MissingModelRecord {
  /** Folder and file name (`kaykit-city-builder/building_A`). */
  name: string;
  url: string;
  /** Why it failed: a missing file, the dev server's HTML fallback, a corrupt or unsupported body. */
  message: string;
}

let servedFallbacks: readonly MissingModelRecord[] = [];
const fallbackListeners = new Set<() => void>();

function publishMissingModels(): void {
  // `shoot` and `drive` read this off the page and fail a run that rendered a placeholder.
  (globalThis as { __jgengineMissingModels?: readonly MissingModelRecord[] }).__jgengineMissingModels = servedFallbacks;
  for (const listener of fallbackListeners) listener();
}

function recordMissingModel(record: MissingModelRecord): void {
  if (servedFallbacks.some((entry) => entry.url === record.url)) return;
  servedFallbacks = [...servedFallbacks, record];
  publishMissingModels();
}

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
export function modelLoadFallbacks(): readonly MissingModelRecord[] {
  return servedFallbacks;
}

/** Calls `listener` each time a model joins {@link modelLoadFallbacks}; returns the unsubscribe. @internal */
export function subscribeModelLoadFallbacks(listener: () => void): () => void {
  fallbackListeners.add(listener);
  return () => {
    fallbackListeners.delete(listener);
  };
}

/** Drops the recorded placeholder list. For tests and between capture runs. @internal */
export function clearModelLoadFallbacks(): void {
  servedFallbacks = [];
  publishMissingModels();
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
 * A see-through double-sided material is drawn twice by three, back faces then front, each pass
 * with its own program. Model glass and foliage cards are panes, not closed volumes, so the extra
 * pass changes nothing on screen but doubles their programs and draws; they draw in one pass.
 * @internal
 */
export function singlePassModelMaterials(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material.transparent && material.side === THREE.DoubleSide) material.forceSinglePass = true;
    }
  });
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
        singlePassModelMaterials(gltf.scene);
        applyModelSurface(gltf.scene);
        mergeSkinnedModelParts(gltf.scene);
        mergeModelSubMeshes(gltf.scene, gltf.animations);
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

/**
 * Where the Draco decoder and KTX2 (Basis) transcoder load from. Left out, each comes from the
 * game's own build (`decoderFiles.ts`); a path is a folder holding three's decoder files.
 */
export interface ModelLoaderConfig {
  dracoDecoderPath?: string;
  ktx2TranscoderPath?: string;
}

/** The decoder path meaning "the copy bundled with the build". */
const BUNDLED_DECODERS = "";

/** The bundled decoder files' URLs, filled in by {@link bundledDecodersReady}. */
const bundledUrls: Record<string, string> = {};
let bundledPending: Promise<void> | undefined;

/**
 * Loads the list of bundled decoder URLs (`decoderFiles.ts`) on first need. It is imported
 * dynamically because its `?url` imports exist only in a bundler: importing the engine in plain
 * Node (a test, a tool) must not load them. It is imported by package name so a game's Vite config
 * can leave it out of dependency pre-bundling (`optimizeDeps.exclude`), whose esbuild cannot read a
 * `.js?url` import and kills the dev server.
 */
function bundledDecodersReady(): Promise<void> {
  bundledPending ??= import("@jgengine/shell/render/decoderFiles").then((module) => {
    Object.assign(bundledUrls, module.DECODER_FILES);
  });
  return bundledPending;
}

/**
 * A loading manager that answers the decoder file names with their bundled URLs and hands
 * everything else (and its progress) to `THREE.DefaultLoadingManager`, as the loaders' default
 * manager would.
 */
function bundledDecoderManager(): THREE.LoadingManager {
  const base = THREE.DefaultLoadingManager;
  const manager = new THREE.LoadingManager();
  manager.resolveURL = (url) => bundledUrls[url] ?? base.resolveURL(url);
  manager.itemStart = (url) => base.itemStart(url);
  manager.itemEnd = (url) => base.itemEnd(url);
  manager.itemError = (url) => base.itemError(url);
  manager.getHandler = (file) => base.getHandler(file);
  return manager;
}

type LibraryLoader = { _loadLibrary(url: string, responseType: string): Promise<unknown> };

/** A Draco loader whose decoder files come from the build: each fetch waits for their URLs. */
class BundledDRACOLoader extends DRACOLoader {
  constructor() {
    super(bundledDecoderManager());
    this.setDecoderPath(BUNDLED_DECODERS);
    const load = (DRACOLoader.prototype as unknown as LibraryLoader)._loadLibrary;
    (this as unknown as LibraryLoader)._loadLibrary = (url, responseType) => bundledDecodersReady().then(() => load.call(this, url, responseType));
  }
}

/**
 * A KTX2 loader that holds a load until a renderer has told it which GPU formats to transcode to,
 * instead of throwing: model and map loads can start (a preload, a cached texture group) before
 * the canvas reports its renderer.
 */
class RendererKTX2Loader extends KTX2Loader {
  private markDetected!: () => void;
  readonly detected = new Promise<void>((resolve) => {
    this.markDetected = resolve;
  });
  isDetected = false;

  /** `bundled`: the transcoder comes from the build, so detection also waits for its URLs. */
  constructor(private readonly bundled: boolean) {
    super(bundled ? bundledDecoderManager() : undefined);
  }

  override detectSupport(renderer: THREE.WebGLRenderer): this {
    super.detectSupport(renderer);
    const ready = this.bundled ? bundledDecodersReady() : Promise.resolve();
    // A failed import still releases the held loads, so they report the missing transcoder.
    void ready.catch(() => {}).then(() => {
      this.isDetected = true;
      this.markDetected();
    });
    return this;
  }

  override load(url: string, onLoad: (texture: THREE.CompressedTexture) => void, onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void): void {
    if (this.isDetected) return super.load(url, onLoad, onProgress, onError);
    void this.detected.then(() => super.load(url, onLoad, onProgress, onError));
  }

  override parse(buffer: ArrayBuffer, onLoad?: (texture: THREE.CompressedTexture) => void, onError?: (error: unknown) => void): void {
    if (this.isDetected) return super.parse(buffer, onLoad, onError);
    void this.detected.then(() => super.parse(buffer, onLoad, onError));
  }
}

let configuredModelLoaders: Readonly<Required<ModelLoaderConfig>> | undefined;
let ktx2Loader: RendererKTX2Loader | undefined;
const ktx2DetectedRenderers = new WeakMap<THREE.WebGLRenderer, KTX2Loader>();

/** Configures shared Draco and KTX2 loaders. Repeated calls with the same paths are no-ops. */
export function configureModelLoaders(options: ModelLoaderConfig = {}): Readonly<Required<ModelLoaderConfig>> {
  const next = {
    dracoDecoderPath: options.dracoDecoderPath ?? BUNDLED_DECODERS,
    ktx2TranscoderPath: options.ktx2TranscoderPath ?? BUNDLED_DECODERS,
  };
  if (configuredModelLoaders?.dracoDecoderPath === next.dracoDecoderPath && configuredModelLoaders.ktx2TranscoderPath === next.ktx2TranscoderPath) {
    return configuredModelLoaders;
  }
  const draco = next.dracoDecoderPath === BUNDLED_DECODERS ? new BundledDRACOLoader() : new DRACOLoader().setDecoderPath(next.dracoDecoderPath);
  ktx2Loader?.dispose();
  ktx2Loader = new RendererKTX2Loader(next.ktx2TranscoderPath === BUNDLED_DECODERS).setTranscoderPath(next.ktx2TranscoderPath);
  sharedGltfLoader.setDRACOLoader(draco);
  sharedGltfLoader.setKTX2Loader(ktx2Loader);
  configuredModelLoaders = next;
  return configuredModelLoaders;
}

/** Detects GPU support for the configured KTX2 transcoder after a renderer exists. */
export function detectKtx2Support(renderer: THREE.WebGLRenderer): void {
  configureModelLoaders();
  if (ktx2DetectedRenderers.get(renderer) === ktx2Loader) return;
  ktx2Loader?.detectSupport(renderer);
  ktx2DetectedRenderers.set(renderer, ktx2Loader!);
}

/** Whether a renderer has told the shared KTX2 transcoder its GPU formats, so a KTX2 map can be asked for. @internal */
export function ktx2Detected(): boolean {
  return ktx2Loader?.isDetected === true;
}

/** Shared transcoder for authored material maps; GPU support is detected by the canvas. @internal */
export function materialKtx2Loader(): KTX2Loader {
  configureModelLoaders();
  return ktx2Loader!;
}

// LoadingManager reports queue transitions, not per-item events: `onStart` fires when the
// queue goes busy and `onLoad` when it drains (errors included, via itemEnd), so a flag plus
// a drain timestamp is the whole state.
let modelQueueBusy = false;
let modelQueueDrainedAt = 0;
let modelQueueStarts = 0;
const now = (): number => (typeof performance === "undefined" ? Date.now() : performance.now());
modelLoadingManager.onStart = () => {
  modelQueueBusy = true;
  modelQueueStarts += 1;
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

/**
 * How many times the shared GLB loader has gone from idle to busy since boot. A capture host
 * compares two readings around a rendered frame to tell whether that frame started new model
 * streaming, which an idle reading alone cannot show.
 * @capability model-load-starts count of model streaming bursts, for capture quiescence checks
 */
export function modelLoadStarts(): number {
  return modelQueueStarts;
}

/** Shared GLTF loader used by shell entity/object model mounts. @internal */
export const sharedGltfLoader = new DiagnosticGLTFLoader(modelLoadingManager);
sharedGltfLoader.setMeshoptDecoder(MeshoptDecoder);
sharedGltfLoader.register(sharedModelImages);
configureModelLoaders();

let sceneWorkSerial = 0;

/**
 * Count a scene build that is still running (a sliced grass bake, a streamed chunk) as loading,
 * until the returned function runs. It joins the shared model queue, so {@link modelLoadIdleMs},
 * {@link modelLoadStarts}, capture settle waits and the shader warmup all wait for it like a model.
 * @internal
 */
export function trackSceneWork(label: string): () => void {
  const item = `scene-work:${label}#${(sceneWorkSerial += 1)}`;
  modelLoadingManager.itemStart(item);
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    modelLoadingManager.itemEnd(item);
  };
}
