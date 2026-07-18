/**
 * Offscreen GLB → PNG thumbnail cache for the Content Browser.
 * Renders real model bytes once per URL into a data URL; never invents screenshots.
 * Failures stay honest (glyph fallback). Bounded concurrency + cache eviction keep
 * the editor from thrashing WebGL or retaining unbounded GPU memory.
 * @internal
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type ThumbnailStatus = "idle" | "loading" | "ready" | "error";

export interface ThumbnailState {
  status: ThumbnailStatus;
  /** `data:image/png;base64,…` when ready; otherwise null. */
  dataUrl: string | null;
}

const THUMB_SIZE = 128;
/** Soft cap: oldest ready entries are dropped when exceeded (GPU/canvas cost). */
const MAX_CACHE = 64;
/** One render at a time — shared WebGL context is not free-threaded. */
const MAX_CONCURRENT = 1;

type CacheEntry =
  | { status: "loading"; waiters: Set<() => void>; promise: Promise<void> }
  | { status: "ready"; dataUrl: string; waiters: Set<() => void> }
  | { status: "error"; waiters: Set<() => void> };

const cache = new Map<string, CacheEntry>();
const queue: string[] = [];
let active = 0;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let loader: GLTFLoader | null = null;

/** Test seam: replace the GLTF load path without spinning WebGL. */
let loadSceneForUrl: (url: string) => Promise<THREE.Object3D> = defaultLoadScene;

/** @internal */
export function setGlbThumbnailLoader(fn: (url: string) => Promise<THREE.Object3D>): void {
  loadSceneForUrl = fn;
}

/** @internal Restore production loader after tests. */
export function resetGlbThumbnailLoader(): void {
  loadSceneForUrl = defaultLoadScene;
}

/** @internal Clear cache + dispose GPU resources (tests / hot dispose). */
export function clearGlbThumbnailCache(): void {
  cache.clear();
  queue.length = 0;
  active = 0;
  disposeRenderer();
}

function disposeRenderer(): void {
  if (renderer !== null) {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer = null;
  }
  scene = null;
  camera = null;
  loader = null;
}

function ensureRenderer(): {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
} {
  if (renderer !== null && scene !== null && camera !== null) {
    return { renderer, scene, camera };
  }
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  const next = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  next.setSize(THUMB_SIZE, THUMB_SIZE, false);
  next.setPixelRatio(1);
  next.setClearColor(0x0a0c10, 1);
  next.outputColorSpace = THREE.SRGBColorSpace;

  const nextScene = new THREE.Scene();
  nextScene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(2.5, 4, 3);
  nextScene.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, 0.35);
  fill.position.set(-2, 1, -1);
  nextScene.add(fill);

  const nextCamera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);

  renderer = next;
  scene = nextScene;
  camera = nextCamera;
  return { renderer: next, scene: nextScene, camera: nextCamera };
}

function defaultLoadScene(url: string): Promise<THREE.Object3D> {
  loader ??= new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader!.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
}

/**
 * Place the camera so the object's bounding sphere fills most of the frame from a
 * consistent three-quarter angle. Pure math — unit-tested without WebGL.
 * @internal
 */
export function frameCameraForBounds(
  box: THREE.Box3,
  camera: THREE.PerspectiveCamera,
  size = THUMB_SIZE,
): void {
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 1e-4);
  const fov = (camera.fov * Math.PI) / 180;
  const distance = (radius * 2.35) / Math.tan(fov / 2);
  // Consistent three-quarter view (slightly elevated).
  const dir = new THREE.Vector3(0.75, 0.55, 1).normalize();
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = distance * 20;
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
  void size;
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh === true) {
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const entry of material) entry.dispose();
      } else if (material !== undefined) {
        material.dispose();
      }
    }
  });
}

function notify(entry: CacheEntry): void {
  for (const waiter of entry.waiters) waiter();
}

function evictIfNeeded(): void {
  if (cache.size <= MAX_CACHE) return;
  for (const [key, entry] of cache) {
    if (entry.status !== "ready") continue;
    cache.delete(key);
    if (cache.size <= MAX_CACHE) return;
  }
}

async function renderUrl(url: string): Promise<string> {
  if (typeof document === "undefined") {
    throw new Error("GLB thumbnails require a DOM/WebGL environment");
  }
  const { renderer: gl, scene: scn, camera: cam } = ensureRenderer();
  const root = await loadSceneForUrl(url);
  const clone = root.clone(true);
  scn.add(clone);

  const box = new THREE.Box3().setFromObject(clone);
  if (box.isEmpty()) {
    scn.remove(clone);
    disposeObject(clone);
    throw new Error("empty bounds");
  }
  frameCameraForBounds(box, cam);
  gl.render(scn, cam);
  const dataUrl = gl.domElement.toDataURL("image/png");

  scn.remove(clone);
  disposeObject(clone);
  // Drop the loader root too if it is not shared (defaultLoadScene creates a new scene each time).
  disposeObject(root);

  return dataUrl;
}

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const url = queue.shift()!;
    const entry = cache.get(url);
    if (entry === undefined || entry.status !== "loading") continue;
    active += 1;
    void (async () => {
      try {
        const dataUrl = await renderUrl(url);
        const next: CacheEntry = { status: "ready", dataUrl, waiters: entry.waiters };
        cache.set(url, next);
        evictIfNeeded();
        notify(next);
      } catch {
        const next: CacheEntry = { status: "error", waiters: entry.waiters };
        cache.set(url, next);
        notify(next);
      } finally {
        active -= 1;
        pump();
      }
    })();
  }
}

/**
 * Snapshot of cache state for a model URL. Does not start a render — call
 * {@link requestGlbThumbnail} first (the React hook does both).
 * @internal
 */
export function getGlbThumbnailState(url: string | undefined): ThumbnailState {
  if (url === undefined || url.length === 0) return { status: "idle", dataUrl: null };
  const entry = cache.get(url);
  if (entry === undefined) return { status: "idle", dataUrl: null };
  if (entry.status === "ready") return { status: "ready", dataUrl: entry.dataUrl };
  if (entry.status === "error") return { status: "error", dataUrl: null };
  return { status: "loading", dataUrl: null };
}

/**
 * Ensures a thumbnail render is in flight (or already cached) for `url`.
 * Safe to call repeatedly; concurrent callers share one load.
 * @internal
 */
export function requestGlbThumbnail(url: string): void {
  if (url.length === 0) return;
  const existing = cache.get(url);
  if (existing !== undefined) return;
  const waiters = new Set<() => void>();
  cache.set(url, {
    status: "loading",
    waiters,
    promise: Promise.resolve(),
  });
  queue.push(url);
  pump();
}

/**
 * Subscribe to thumbnail state changes for a URL. Returns an unsubscribe.
 * @internal
 */
export function subscribeGlbThumbnail(url: string | undefined, listener: () => void): () => void {
  if (url === undefined || url.length === 0) return () => {};
  requestGlbThumbnail(url);
  const entry = cache.get(url);
  if (entry === undefined) return () => {};
  entry.waiters.add(listener);
  return () => {
    entry.waiters.delete(listener);
  };
}
