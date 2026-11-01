import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { reportTextureLoadError } from "@jgengine/core/devtools/textureErrors";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import type { EnvironmentSource } from "@jgengine/core/lighting/environmentLighting";

import { linkPmremBake, PMREM_BAKE_CAMERA } from "./pmremLink.draw";
import { warmupDrawsToTarget, warmupWaitsFor } from "@jgengine/core/render/shaderWarmup.draw";
import { WorldReflectionProbe, type WorldProbeSettings } from "./reflectionProbe.draw";

/** @internal Props for shell {@link EnvironmentLighting}. */
export interface EnvironmentLightingProps {
  /** Optional authored environment map; absent or `gradient` uses the procedural probe. */
  source?: EnvironmentSource | undefined;
  /** IBL intensity. Default {@link DEFAULT_IBL_INTENSITY}. */
  intensity?: number;
  /** Upper-hemisphere tint for the procedural sky probe. Default cool daylight. */
  skyColor?: string;
  /** Ground / lower-hemisphere tint. Default soft earth. */
  groundColor?: string;
  /** Tint the horizon band leans toward, usually the scene's ambient colour so IBL keeps its warmth. Default white. */
  horizonTint?: string | undefined;
  /**
   * Sun direction (world space, not normalized) baked into the probe as an HDR disc plus a broad
   * lobe, so metals glint and diffuse IBL has a lit side. Default {@link DEFAULT_PROBE_SUN}.
   */
  sunDirection?: readonly [number, number, number] | undefined;
  /** Sun disc tint. Default warm white. */
  sunColor?: string;
  /**
   * Day-cycle scaling for the probe's brightness. Rebuilding a PMREM every frame is not free, so a
   * cycle dims the applied environment instead of re-baking it; without this the sky turns black at
   * night while the IBL keeps lighting the world like noon.
   */
  daylight?: { sunFactor: number; ambientFactor: number };
  /**
   * Capture the world around the camera for metal, glossy paint and glass, so they reflect the real
   * scene. Null keeps the procedural probe alone. An authored HDRI or cube map always wins.
   */
  worldProbe?: WorldProbeSettings | null;
}

/**
 * Image-based lighting from a procedural sky/horizon/ground probe with an HDR sun (not three's stock
 * RoomEnvironment gray studio box). Metals and dielectrics pick up sky color, a sun glint and a
 * directional sky fill; re-render when sky/sun props change so a daylight cycle
 * regenerates the environment map with the authored world.
 *
 * Opt out of cinematic IBL with `look: "flat"` on the shell presentation.
 * @internal shell-internal default lighting; games never import it.
 */
export function EnvironmentLighting({
  source,
  intensity = DEFAULT_IBL_INTENSITY,
  skyColor = "#87b5e0",
  groundColor = "#3d4a38",
  horizonTint = "#ffffff",
  sunDirection,
  sunColor = "#fff2d6",
  daylight,
  worldProbe = null,
}: EnvironmentLightingProps): null {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const probeRef = useRef<WorldReflectionProbe | null>(null);
  const authoredMap = source?.kind === "hdri" || source?.kind === "cube";

  useEffect(() => {
    if (worldProbe === null || authoredMap) return;
    const probe = new WorldReflectionProbe(gl, worldProbe);
    probeRef.current = probe;
    // The probe draws the scene into a cube target, which links the target's programs.
    const untarget = warmupDrawsToTarget(scene);
    return () => {
      untarget();
      probeRef.current = null;
      probe.dispose();
    };
  }, [gl, scene, authoredMap, worldProbe?.size, worldProbe?.interval, worldProbe?.moveDistance]);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    let target: THREE.WebGLRenderTarget | undefined;
    let loadedTexture: THREE.Texture | THREE.CubeTexture | undefined;
    let cancelled = false;
    let appliedRotation: THREE.Euler | undefined;
    let appliedRotationValue: THREE.Euler | undefined;
    const previous = scene.environment;
    const previousRotation = scene.environmentRotation;
    const previousIntensity = scene.environmentIntensity;
    const appliedIntensity = source?.intensity ?? intensity;
    scene.environmentIntensity = appliedIntensity;
    const release = () => {
      if (cancelled) return;
      cancelled = true;
      if (target !== undefined && scene.environment === target.texture) {
        scene.environment = previous;
        scene.environmentIntensity = previousIntensity;
      }
      if (appliedRotation !== undefined && scene.environmentRotation === appliedRotation && appliedRotation.equals(appliedRotationValue!)) scene.environmentRotation = previousRotation;
      if (scene.environmentIntensity === appliedIntensity) scene.environmentIntensity = previousIntensity;
      pmrem.dispose();
      target?.dispose();
      loadedTexture?.dispose();
    };
    const effective = source?.kind === "gradient" ? source : undefined;
    const apply = (next: THREE.WebGLRenderTarget, rotation?: number) => {
      if (cancelled) { next.dispose(); return; }
      target = next;
      scene.environment = next.texture;
      if (rotation !== undefined) {
        appliedRotation = new THREE.Euler(0, rotation, 0);
        appliedRotationValue = appliedRotation.clone();
        scene.environmentRotation = appliedRotation;
      }
    };
    try {
      if (source?.kind === "hdri") {
        const Loader = /\.exr(?:$|\?)/i.test(source.url) ? EXRLoader : RGBELoader;
        warmupWaitsFor(scene, new Loader().loadAsync(resolveAssetBaseUrl(source.url)).then((texture) => {
          if (cancelled) { texture.dispose(); return; }
          loadedTexture = texture;
          texture.mapping = THREE.EquirectangularReflectionMapping;
          const size = Math.max(16, ((texture.image as { width?: number } | undefined)?.width ?? 1024) / 4);
          return linkPmremBake(gl, pmrem, size, () => pmrem.compileEquirectangularShader(), () => cancelled).then(() => {
            if (!cancelled) apply(pmrem.fromEquirectangular(texture), source.rotation);
          });
        }).catch((error) => {
          if (cancelled) return;
          reportTextureLoadError(source.url);
          console.warn(`[jgengine] environment illumination failed: ${source.url}`, error);
        }));
      } else if (source?.kind === "cube") {
        warmupWaitsFor(scene, new THREE.CubeTextureLoader().loadAsync(source.urls.map(resolveAssetBaseUrl)).then((texture) => {
          if (cancelled) { texture.dispose(); return; }
          loadedTexture = texture;
          const face = (texture.image as { width?: number; image?: { width?: number } }[] | undefined)?.[0];
          const size = face?.width ?? face?.image?.width ?? PMREM_SCENE_SIZE;
          return linkPmremBake(gl, pmrem, size, () => pmrem.compileCubemapShader(), () => cancelled).then(() => {
            if (!cancelled) apply(pmrem.fromCubemap(texture));
          });
        }).catch((error) => {
          if (cancelled) return;
          for (const url of source.urls) reportTextureLoadError(url);
          console.warn(`[jgengine] cube environment illumination failed: ${source.urls.join(", ")}`, error);
        }));
      } else {
        const probe = buildSkyProbeScene({ skyColor: effective?.sky ?? skyColor, groundColor: effective?.ground ?? groundColor, horizonTint, sunDirection, sunColor: effective?.sun ?? sunColor });
        // With a world probe, the sky bake matches its size: a lit program is built for its
        // environment's size, so a probe that took over at another size would relink every one.
        const size = worldProbe?.size ?? PMREM_SCENE_SIZE;
        const baked = linkPmremBake(gl, pmrem, size, () => gl.compile(probe, PMREM_BAKE_CAMERA), () => cancelled)
          .then(() => {
            if (!cancelled) apply(pmrem.fromScene(probe, 0.04, 0.1, 100, { size }));
          })
          .finally(() => disposeScene(probe));
        // Every lit material links a different program with an environment map, so the scene's
        // warmup waits for this one rather than linking programs the first frame never draws.
        warmupWaitsFor(scene, baked);
        baked.catch((error: unknown) => {
          if (!cancelled) console.warn("[jgengine] environment probe bake failed", error);
        });
      }
    } catch (error) {
      release();
      throw error;
    }
    return release;
  }, [gl, scene, worldProbe?.size, source, intensity, skyColor, groundColor, horizonTint, sunColor, sunDirection?.[0], sunDirection?.[1], sunDirection?.[2]]);

  useFrame((state, delta) => {
    const probe = probeRef.current;
    probe?.step(scene, state.camera.getWorldPosition(probeEye), delta);
    if (daylight === undefined || scene.environment === null) return;
    // Ambient fill and the probe's sun lobe fade together; the probe's colours stay authored.
    scene.environmentIntensity = (source?.intensity ?? intensity) * (daylight.ambientFactor * 0.6 + daylight.sunFactor * 0.4);
  });

  return null;
}

const probeEye = new THREE.Vector3();

/** @internal Default IBL strength for the procedural probe: enough sky fill and sun lobe to model forms. */
export const DEFAULT_IBL_INTENSITY = 0.45;

/** three's default PMREM size, for a sky bake with no world probe to match. */
const PMREM_SCENE_SIZE = 256;

/** @internal Fallback probe sun when no directional light is authored: high and off to one side. */
export const DEFAULT_PROBE_SUN: readonly [number, number, number] = [-0.45, 0.8, 0.35];

/**
 * @internal Procedural sky probe: zenith → brighter horizon → ground bounce, plus an HDR sun disc and
 * a wide glow lobe. After PMREM the lobe becomes a directional diffuse term, so the IBL alone gives
 * forms a lit and a shaded side instead of a uniform two-tone wash.
 */
export function buildSkyProbeScene(options: {
  skyColor: string;
  groundColor: string;
  horizonTint?: string;
  sunDirection?: readonly [number, number, number] | undefined;
  sunColor: string;
}): THREE.Scene {
  const probe = new THREE.Scene();
  const sun = new THREE.Vector3(...(options.sunDirection ?? DEFAULT_PROBE_SUN));
  if (sun.lengthSq() < 1e-8) sun.set(...DEFAULT_PROBE_SUN);
  sun.normalize();
  const sky = new THREE.Color(options.skyColor);
  const horizon = sky.clone().lerp(new THREE.Color(options.horizonTint ?? "#ffffff"), 0.35);
  const geo = new THREE.SphereGeometry(50, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: sky.clone().multiplyScalar(0.85) },
      horizon: { value: horizon },
      ground: { value: new THREE.Color(options.groundColor) },
      sunDir: { value: sun },
      sunColor: { value: new THREE.Color(options.sunColor) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 ground;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y, -1.0, 1.0);
        vec3 col = up >= 0.0
          ? mix(horizon, zenith, pow(up, 0.6))
          : mix(horizon * 0.55 + ground * 0.45, ground * 0.7, smoothstep(0.0, 0.5, -up));
        float facing = max(dot(d, sunDir), 0.0);
        // Disc for specular glints; the broad lobe is what survives PMREM into the diffuse term.
        col += sunColor * (pow(facing, 900.0) * 24.0 + pow(facing, 6.0) * 0.6 + pow(facing, 2.0) * 0.1);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  probe.add(new THREE.Mesh(geo, mat));
  return probe;
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    }
  });
}
