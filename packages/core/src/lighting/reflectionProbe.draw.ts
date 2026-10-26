import * as THREE from "three";

import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";

import { modelLoadIdleMs, modelLoadStarts } from "@jgengine/core/model/modelLoad.draw";
import { linkPmremBake } from "./pmremLink.draw";
import { drawsHeld } from "@jgengine/core/render/shaderWarmup.draw";

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

/** Model streaming as the probe sees it: how long the loader has been idle, and how many bursts it has started. @internal */
export interface ProbeStreaming {
  idleMs(): number;
  starts(): number;
}

const SHARED_STREAMING: ProbeStreaming = { idleMs: modelLoadIdleMs, starts: modelLoadStarts };

/** The model loader must have been idle this long before a capture starts. @internal */
export const PROBE_SETTLE_MS = 500;

/**
 * Frames the very first capture waits for streaming to settle before it captures anyway, so a world
 * that never stops streaming still gets reflections. @internal
 */
export const PROBE_FIRST_WAIT_FRAMES = 600;

/**
 * Whether streaming is quiet enough to capture. A capture taken while models pop in bakes a
 * half-loaded world into every reflection, and the next one swaps it out: that swap is the flicker.
 * @internal
 */
export function probeStreamingQuiet(idleMs: number, captured: boolean, framesWaiting: number): boolean {
  if (idleMs >= PROBE_SETTLE_MS) return true;
  return !captured && framesWaiting >= PROBE_FIRST_WAIT_FRAMES;
}

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
  private captureStarts = 0;
  private readonly assigned = new Set<THREE.MeshStandardMaterial>();
  /** Whether the filter's programs are linked; a capture waits for it rather than link on the spot. */
  private linked = false;
  private disposed = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly settings: WorldProbeSettings,
    private readonly streaming: ProbeStreaming = SHARED_STREAMING,
  ) {
    this.cubeTarget = new THREE.WebGLCubeRenderTarget(settings.size, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cubeCamera = new THREE.CubeCamera(0.3, 600, this.cubeTarget);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    void linkPmremBake(renderer, this.pmrem, settings.size, () => this.pmrem.compileCubemapShader(), () => this.disposed).then(() => {
      this.linked = true;
    });
  }

  /** The filtered environment from the last finished capture, or null before the first one. */
  get texture(): THREE.Texture | null {
    return this.envTarget?.texture ?? null;
  }

  /**
   * Advance the capture by at most one face. Returns true on the frame a new environment is ready.
   * A capture starts only once model streaming has settled, and one that streaming interrupts is
   * dropped, keeping the last finished environment on screen.
   */
  step(scene: THREE.Scene, eye: THREE.Vector3, delta: number): boolean {
    this.sinceCapture += delta;
    this.framesSince += 1;
    // While the shader warmup holds the frame's draws, a face would draw nothing: wait it out.
    if (!this.linked || drawsHeld(this.renderer)) return false;
    if (this.face < 0) {
      if (!probeDue(this.lastPosition, eye, this.sinceCapture, this.settings, this.framesSince)) return false;
      if (!probeStreamingQuiet(this.streaming.idleMs(), this.lastPosition !== null, this.framesSince)) return false;
      this.captureStarts = this.streaming.starts();
      this.cubeCamera.position.copy(eye);
      this.cubeCamera.updateMatrixWorld(true);
      this.face = 0;
      // The first capture lands while the scene is still loading in, so it takes all six faces at
      // once rather than costing six steady-state frames an extra scene draw each.
      if (this.lastPosition === null) {
        for (; this.face < FACES; this.face += 1) this.renderFace(scene, this.face);
      }
    }
    if (this.streaming.starts() !== this.captureStarts) {
      this.face = -1;
      return false;
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
        // Only a material that had no map recompiles; later captures refill the same texture in place.
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
    this.disposed = true;
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
