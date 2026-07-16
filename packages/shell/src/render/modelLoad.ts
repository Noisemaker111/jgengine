import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/**
 * Dedicated LoadingManager for every GLB load instead of THREE.DefaultLoadingManager.
 * The shared default manager is process-wide; under repeated dev-server navigations its
 * AbortController can already be aborted, which silently stalls GLTFLoader.fetch forever
 * with no thrown error. A private manager sidesteps that (ported from the duet-keys ship).
 * @internal
 */
const modelLoadingManager = new THREE.LoadingManager();

/** Shared GLTF loader used by shell entity/object model mounts. @internal */
export const sharedGltfLoader = new GLTFLoader(modelLoadingManager);
sharedGltfLoader.setMeshoptDecoder(MeshoptDecoder);
