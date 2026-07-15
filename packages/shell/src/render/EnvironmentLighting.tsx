import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Sets a neutral, network-free image-based-lighting environment on the scene so every
 * `MeshStandardMaterial` — models and un-modeled primitive fallbacks alike — picks up soft
 * reflections and fill instead of rendering dead-flat. A game's own sky/lighting still layers on
 * top; this only supplies the reflective ambient the shell never had. Opt out with `look: "flat"`.
 * @internal shell-internal default lighting; games never import it.
 */
export function EnvironmentLighting({ intensity = 0.28 }: { intensity?: number }): null {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    const previous = scene.environment;
    scene.environment = target.texture;
    const sceneWithIntensity = scene as THREE.Scene & { environmentIntensity?: number };
    const previousIntensity = sceneWithIntensity.environmentIntensity;
    sceneWithIntensity.environmentIntensity = intensity;
    room.dispose?.();
    pmrem.dispose();
    return () => {
      target.dispose();
      scene.environment = previous;
      if (previousIntensity !== undefined) sceneWithIntensity.environmentIntensity = previousIntensity;
    };
  }, [gl, scene, intensity]);

  return null;
}
