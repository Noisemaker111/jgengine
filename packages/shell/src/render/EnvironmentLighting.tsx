import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";

/** @internal Props for shell {@link EnvironmentLighting}. */
export interface EnvironmentLightingProps {
  /** IBL intensity. Default 0.35. */
  intensity?: number;
  /** Upper-hemisphere tint for the procedural sky probe. Default cool daylight. */
  skyColor?: string;
  /** Ground / lower-hemisphere tint. Default soft earth. */
  groundColor?: string;
  /**
   * Optional sun direction (world space, not normalized). When set, a bright disc
   * is baked into the probe so metals pick up a real sun glint that tracks daylight.
   */
  sunDirection?: readonly [number, number, number];
  /** Sun disc tint. Default warm white. */
  sunColor?: string;
}

/**
 * Image-based lighting from a procedural sky/ground probe (not three's stock
 * RoomEnvironment gray studio box). Metals and dielectrics pick up sky color and
 * an optional sun glint; re-render when sky/sun props change so a daylight cycle
 * regenerates the environment map with the authored world.
 *
 * Opt out of cinematic IBL with `look: "flat"` on the shell presentation.
 * @internal shell-internal default lighting; games never import it.
 */
export function EnvironmentLighting({
  intensity = 0.35,
  skyColor = "#87b5e0",
  groundColor = "#3d4a38",
  sunDirection,
  sunColor = "#fff2d6",
}: EnvironmentLightingProps): null {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const probe = buildSkyProbeScene({ skyColor, groundColor, sunDirection, sunColor });
    const target = pmrem.fromScene(probe, 0.04);
    const previous = scene.environment;
    scene.environment = target.texture;
    const sceneWithIntensity = scene as THREE.Scene & { environmentIntensity?: number };
    const previousIntensity = sceneWithIntensity.environmentIntensity;
    sceneWithIntensity.environmentIntensity = intensity;
    disposeScene(probe);
    pmrem.dispose();
    return () => {
      target.dispose();
      scene.environment = previous;
      if (previousIntensity !== undefined) sceneWithIntensity.environmentIntensity = previousIntensity;
    };
  }, [gl, scene, intensity, skyColor, groundColor, sunColor, sunDirection?.[0], sunDirection?.[1], sunDirection?.[2]]);

  return null;
}

function buildSkyProbeScene(options: {
  skyColor: string;
  groundColor: string;
  sunDirection?: readonly [number, number, number];
  sunColor: string;
}): THREE.Scene {
  const probe = new THREE.Scene();
  // Inward-facing sphere: sky above, ground below, so PMREM samples a sky dome not a studio box.
  const geo = new THREE.SphereGeometry(50, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      sky: { value: new THREE.Color(options.skyColor) },
      ground: { value: new THREE.Color(options.groundColor) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 sky;
      uniform vec3 ground;
      varying vec3 vDir;
      void main() {
        float t = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        // Soft horizon blend so the equator is not a hard band.
        float w = smoothstep(0.0, 1.0, t);
        gl_FragColor = vec4(mix(ground, sky, w), 1.0);
      }
    `,
  });
  probe.add(new THREE.Mesh(geo, mat));

  if (options.sunDirection !== undefined) {
    const dir = new THREE.Vector3(
      options.sunDirection[0],
      options.sunDirection[1],
      options.sunDirection[2],
    );
    if (dir.lengthSq() > 1e-8) {
      dir.normalize();
      const sunGeo = new THREE.SphereGeometry(3.5, 16, 12);
      const sunMat = new THREE.MeshBasicMaterial({ color: options.sunColor });
      const sun = new THREE.Mesh(sunGeo, sunMat);
      // Place the disc outside the sky sphere sample so it stays a compact highlight.
      sun.position.copy(dir.multiplyScalar(42));
      probe.add(sun);
    }
  }

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
