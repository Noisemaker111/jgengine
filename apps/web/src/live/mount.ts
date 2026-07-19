/**
 * Client-only three.js mount helper shared by every live canvas on the site.
 * Owns the renderer lifecycle: DPR-capped canvas, container-tracked resize,
 * a RAF loop that pauses while the tab is hidden or the canvas is offscreen,
 * and full disposal. Scene modules stay pure "build + frame" functions.
 */
import * as THREE from "three";

export interface LiveHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** True when the user asked for reduced motion — render one settled frame and idle. */
  reducedMotion: boolean;
  /** Force a render outside the RAF loop (used after one-shot updates in reduced motion). */
  invalidate(): void;
  dispose(): void;
}

export interface MountOptions {
  /** Called every animation frame with delta + total elapsed seconds. */
  frame(dt: number, elapsed: number): void;
  fov?: number;
  near?: number;
  far?: number;
  /** Extra teardown for scene-module resources (geometries, materials, observers). */
  onDispose?(): void;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function mountLive(container: HTMLElement, options: MountOptions): LiveHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    options.fov ?? 50,
    Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
    options.near ?? 0.1,
    options.far ?? 2000,
  );

  const reducedMotion = prefersReducedMotion();
  let disposed = false;
  let raf = 0;
  let visible = true;
  let elapsed = 0;
  let last = performance.now();

  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  };

  const render = () => {
    renderer.render(scene, camera);
  };

  const tick = (now: number) => {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    elapsed += dt;
    options.frame(dt, elapsed);
    render();
    schedule();
  };

  const schedule = () => {
    if (disposed || raf !== 0 || !visible || document.hidden || reducedMotion) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  const onVisibility = () => schedule();
  document.addEventListener("visibilitychange", onVisibility);

  const intersection = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    schedule();
  });
  intersection.observe(container);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  schedule();

  return {
    scene,
    camera,
    renderer,
    reducedMotion,
    invalidate() {
      if (!disposed) {
        options.frame(0, elapsed);
        render();
      }
    },
    dispose() {
      disposed = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      intersection.disconnect();
      resizeObserver.disconnect();
      options.onDispose?.();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/** Recursively free geometries, materials, and textures under a root object. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry !== undefined) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) for (const entry of material) disposeMaterial(entry);
    else if (material !== undefined) disposeMaterial(material);
  });
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  material.dispose();
}
