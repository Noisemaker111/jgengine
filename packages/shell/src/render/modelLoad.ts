import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import {
  classifyAssetResponse,
  type AssetLoadDiagnosis,
  type AssetResponseProbe,
} from "@jgengine/core/scene/assetDiagnostics";

/**
 * Dedicated LoadingManager for every GLB load instead of THREE.DefaultLoadingManager.
 * The shared default manager is process-wide; under repeated dev-server navigations its
 * AbortController can already be aborted, which silently stalls GLTFLoader.fetch forever
 * with no thrown error. A private manager sidesteps that (ported from the duet-keys ship).
 * @internal
 */
const modelLoadingManager = new THREE.LoadingManager();

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
 * A {@link GLTFLoader} whose success path is unchanged but whose failures are
 * enriched: when a load errors, it probes the URL and rejects with an
 * {@link AssetLoadDiagnosis}-derived message (missing / HTML fallback / corrupt /
 * unsupported) instead of the raw parse error. Drop-in for the shared loader, so
 * `useLoader(sharedGltfLoader, url)` benefits with no call-site change.
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
        void probeModelUrl(url)
          .then((diagnosis) => {
            if (diagnosis.ok) {
              // The bytes look fine on re-fetch — surface the original parse error unchanged.
              onError(event);
              return;
            }
            const enriched = new Error(`[jgengine] ${diagnosis.message}`);
            (enriched as Error & { diagnosis?: AssetLoadDiagnosis }).diagnosis = diagnosis;
            (enriched as Error & { cause?: unknown }).cause = event;
            onError(enriched);
          })
          .catch(() => onError(event));
      },
    );
  }
}

/** Shared GLTF loader used by shell entity/object model mounts. @internal */
export const sharedGltfLoader = new DiagnosticGLTFLoader(modelLoadingManager);
sharedGltfLoader.setMeshoptDecoder(MeshoptDecoder);
