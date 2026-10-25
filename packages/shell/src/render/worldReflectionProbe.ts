import * as THREE from "three";

import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";

/** How often and how sharply the world reflection probe captures the scene. @internal */
export interface WorldProbeSettings {
  /** Cube face size in pixels. */
  size: number;
  /** Seconds between recaptures while the camera stays put, so a day cycle reaches reflections. */
  interval: number;
  /** Camera travel in world units that triggers a recapture early. */
  moveDistance: number;
}

/**
 * The probe each graphics tier runs. Low keeps the procedural sky probe alone; the tiers above
 * capture the real world around the camera, one cube face per frame.
 * @internal
 */
export function worldProbeForQuality(quality: GraphicsQuality): WorldProbeSettings | null {
  if (quality === "low") return null;
  if (quality === "medium") return { size: 64, interval: 8, moveDistance: 40 };
  if (quality === "high") return { size: 128, interval: 4, moveDistance: 25 };
  return { size: 256, interval: 2, moveDistance: 15 };
}

/**
 * Frames that must pass between captures, whatever the clock says. A slow machine then spends its
 * few frames on the scene, not on refreshing reflections: at 60 fps this is 5 s, at 1 fps 5 min. @internal
 */
export const PROBE_MIN_FRAMES = 300;

/**
 * Whether the probe is due: never captured, or at least {@link PROBE_MIN_FRAMES} frames since the last
 * capture and then either the camera moved far enough or the interval passed. @internal
 */
export function probeDue(
  last: { x: number; y: number; z: number } | null,
  position: { x: number; y: number; z: number },
  secondsSince: number,
  settings: WorldProbeSettings,
  framesSince = PROBE_MIN_FRAMES,
): boolean {
  if (last === null) return true;
  if (framesSince < PROBE_MIN_FRAMES) return false;
  const dx = position.x - last.x;
  const dy = position.y - last.y;
  const dz = position.z - last.z;
  return secondsSince >= settings.interval || dx * dx + dy * dy + dz * dz >= settings.moveDistance * settings.moveDistance;
}

const FACES = 6;

/**
 * Whether a material should reflect the captured world: metals, glossy paint and glass. Rough
 * dielectrics keep the soft procedural sky light, so the world's diffuse colour does not shift.
 * @internal
 */
export function reflectsWorld(material: THREE.Material): boolean {
  const standard = material as THREE.MeshStandardMaterial;
  if (!standard.isMeshStandardMaterial || standard.envMap !== null) return false;
  const physical = material as THREE.MeshPhysicalMaterial;
  return standard.metalness >= 0.5 || standard.roughness <= 0.3 || (physical.isMeshPhysicalMaterial === true && physical.transmission > 0);
}

/**
 * A reflection probe of the scene itself: a cube capture from the camera's position, filtered into
 * an environment map, so glass, glossy paint and metal reflect the street, the buildings and the
 * sky around them instead of a generic gradient. Faces are rendered one per frame and filtered after
 * the sixth, so a capture never costs more than one small extra scene draw in any frame.
 * @internal
 */
export class WorldReflectionProbe {
  private readonly cubeTarget: THREE.WebGLCubeRenderTarget;
  private readonly cubeCamera: THREE.CubeCamera;
  private readonly pmrem: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private face = -1;
  private lastPosition: THREE.Vector3 | null = null;
  private sinceCapture = 0;
  private framesSince = 0;
  private readonly assigned = new Set<THREE.MeshStandardMaterial>();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly settings: WorldProbeSettings,
  ) {
    this.cubeTarget = new THREE.WebGLCubeRenderTarget(settings.size, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cubeCamera = new THREE.CubeCamera(0.3, 600, this.cubeTarget);
    this.pmrem = new THREE.PMREMGenerator(renderer);
  }

  /** The filtered environment from the last finished capture, or null before the first one. */
  get texture(): THREE.Texture | null {
    return this.envTarget?.texture ?? null;
  }

  /**
   * Advance the capture by at most one face. Returns true on the frame a new environment is ready.
   */
  step(scene: THREE.Scene, eye: THREE.Vector3, delta: number): boolean {
    this.sinceCapture += delta;
    this.framesSince += 1;
    if (this.face < 0) {
      if (!probeDue(this.lastPosition, eye, this.sinceCapture, this.settings, this.framesSince)) return false;
      this.cubeCamera.position.copy(eye);
      this.cubeCamera.updateMatrixWorld(true);
      this.face = 0;
      // The first capture lands while the scene is still loading in, so it takes all six faces at
      // once rather than costing six steady-state frames an extra scene draw each.
      if (this.lastPosition === null) {
        for (; this.face < FACES; this.face += 1) this.renderFace(scene, this.face);
      }
    }
    if (this.face < FACES) {
      this.renderFace(scene, this.face);
      this.face += 1;
      return false;
    }
    this.envTarget = this.pmrem.fromCubemap(this.cubeTarget.texture, this.envTarget);
    this.assign(scene, this.envTarget.texture);
    this.lastPosition = (this.lastPosition ?? new THREE.Vector3()).copy(this.cubeCamera.position);
    this.sinceCapture = 0;
    this.framesSince = 0;
    this.face = -1;
    return true;
  }

  /** Points every reflective material without its own map at the capture; the texture is reused across captures. */
  private assign(scene: THREE.Scene, texture: THREE.Texture): void {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (material === undefined || !reflectsWorld(material)) continue;
        const standard = material as THREE.MeshStandardMaterial;
        standard.envMap = texture;
        standard.needsUpdate = true;
        this.assigned.add(standard);
      }
    });
  }

  private renderFace(scene: THREE.Scene, face: number): void {
    const renderer = this.renderer;
    const camera = this.cubeCamera;
    if (camera.coordinateSystem !== renderer.coordinateSystem) {
      camera.coordinateSystem = renderer.coordinateSystem;
      camera.updateCoordinateSystem();
    }
    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace();
    const previousMip = renderer.getActiveMipmapLevel();
    // The shadow maps are already fresh for this frame; re-rendering them per face would cost more
    // than the face itself.
    const shadowUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.cubeTarget, face);
    renderer.render(scene, camera.children[face] as THREE.Camera);
    renderer.setRenderTarget(previousTarget, previousFace, previousMip);
    renderer.shadowMap.autoUpdate = shadowUpdate;
  }

  dispose(): void {
    const texture = this.envTarget?.texture;
    for (const material of this.assigned) {
      if (material.envMap !== texture) continue;
      material.envMap = null;
      material.needsUpdate = true;
    }
    this.assigned.clear();
    this.cubeTarget.dispose();
    this.envTarget?.dispose();
    this.pmrem.dispose();
  }
}
