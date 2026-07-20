import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import {
  classifyAssetResponse,
  type AssetLoadDiagnosis,
  type AssetResponseProbe,
} from "@jgengine/core/scene/assetDiagnostics";

import { resolveAssetBaseUrl } from "./assetBase";

/**
 * Dedicated LoadingManager for every GLB load instead of THREE.DefaultLoadingManager.
 * The shared default manager is process-wide; under repeated dev-server navigations its
 * AbortController can already be aborted, which silently stalls GLTFLoader.fetch forever
 * with no thrown error. A private manager sidesteps that (ported from the duet-keys ship).
 * @internal
 */
const modelLoadingManager = new THREE.LoadingManager();
modelLoadingManager.setURLModifier(resolveAssetBaseUrl);

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
  onLoad(createFallbackModel(diagnosis));
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
      onLoad,
      onProgress,
      (event: unknown) => {
        if (onError === undefined) return;
        // Probe the URL the loader actually fetched (base-resolved), not the raw input.
        void handleModelLoadFailure(this.manager.resolveURL(url), event, onLoad, onError).catch(() => onError(event));
      },
    );
  }
}

/** Shared GLTF loader used by shell entity/object model mounts. @internal */
export const sharedGltfLoader = new DiagnosticGLTFLoader(modelLoadingManager);
sharedGltfLoader.setMeshoptDecoder(MeshoptDecoder);
