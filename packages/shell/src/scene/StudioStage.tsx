import { useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { DEFAULT_FORWARD, yawToFace } from "@jgengine/core/scene/facing";

/** Lighting mood for a {@link StudioStage} — a named 3-point rig + backdrop palette. */
export type StudioMood = "studio" | "daylight" | "dusk" | "night";

interface MoodRig {
  key: number;
  keyColor: string;
  fill: number;
  fillColor: string;
  rim: number;
  rimColor: string;
  ambient: number;
  ambientColor: string;
  backdrop: string;
  floor: string;
}

const MOODS: Record<StudioMood, MoodRig> = {
  studio: { key: 3.1, keyColor: "#fff4e6", fill: 0.9, fillColor: "#cdd8ff", rim: 2.6, rimColor: "#ffe9c7", ambient: 0.35, ambientColor: "#5b6472", backdrop: "#14161c", floor: "#1b1e26" },
  daylight: { key: 3.4, keyColor: "#fff6ea", fill: 1.2, fillColor: "#d6e6ff", rim: 1.6, rimColor: "#ffffff", ambient: 0.6, ambientColor: "#8fa2bf", backdrop: "#cdd7e4", floor: "#aeb7c4" },
  dusk: { key: 2.6, keyColor: "#ffcf9e", fill: 0.7, fillColor: "#7c8fd8", rim: 3.0, rimColor: "#ff9d6b", ambient: 0.4, ambientColor: "#4a4668", backdrop: "#221a26", floor: "#241d2a" },
  night: { key: 1.6, keyColor: "#bcd0ff", fill: 0.4, fillColor: "#38507e", rim: 2.4, rimColor: "#9fd0ff", ambient: 0.22, ambientColor: "#1e2740", backdrop: "#0a0c12", floor: "#0e1119" },
};

/** Props for {@link StudioStage}. */
export interface StudioStageProps {
  mood?: StudioMood;
  /** Override the scene background color (hex). Default: the mood's backdrop. */
  backdrop?: string;
  /** Turntable spin speed in radians/second (spins the children). 0 disables. Default 0. */
  turntable?: number;
  /** Draw the seamless floor + set the scene background. Off for open-world scenes. Default true. */
  environment?: boolean;
  /**
   * Yaw the children every frame so `forward` points at the active camera — frame the declared front
   * with zero `rotationY` tuning. Overrides `turntable` (the two are mutually exclusive: one spins the
   * content, the other holds it facing whoever's looking). Default false.
   */
  faceCamera?: boolean;
  /**
   * The staged content's declared forward axis (`GeneratedAsset.forward`, or a scene kind's own
   * convention) — the direction `faceCamera` turns to point at the camera. Default `[0, 0, 1]`, the
   * engine-wide convention (`DEFAULT_FORWARD` in `@jgengine/core/scene/facing`).
   */
  forward?: readonly [number, number, number];
  children: ReactNode;
}

/**
 * A reusable cinematic "product-shot" stage — a 3-point lighting rig (key/fill/rim + ambient), a
 * seamless backdrop, and an optional turntable — so any parametric studio renders framed and lit like
 * a hero shot instead of a flat proxy under default light. Pair with `PlayableGame.postProcessing =
 * STUDIO_STAGE_POST` for the full film grade. Set `environment: false` to keep an open-world sky/ground
 * and use it purely as a lighting rig. Set `faceCamera` to auto-orient the declared `forward` toward
 * the camera instead of hand-tuning `rotationY` on the child.
 *
 * @capability studio-stage cinematic lighting rig + backdrop + turntable for parametric studios
 */
export function StudioStage({
  mood = "studio",
  backdrop,
  turntable = 0,
  environment = true,
  faceCamera = false,
  forward = DEFAULT_FORWARD,
  children,
}: StudioStageProps) {
  const spin = useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);
  const groupWorld = useRef(new THREE.Vector3()).current;
  const cameraWorld = useRef(new THREE.Vector3()).current;
  useFrame((_, delta) => {
    const group = spin.current;
    if (group === null) return;
    if (faceCamera) {
      group.getWorldPosition(groupWorld);
      camera.getWorldPosition(cameraWorld);
      group.rotation.y = yawToFace(forward, [groupWorld.x, groupWorld.z], [cameraWorld.x, cameraWorld.z]);
      return;
    }
    if (turntable !== 0) group.rotation.y += turntable * delta;
  });
  const rig = MOODS[mood];
  return (
    <>
      {environment ? <color attach="background" args={[backdrop ?? rig.backdrop]} /> : null}
      <ambientLight intensity={rig.ambient} color={rig.ambientColor} />
      <directionalLight position={[7, 9, 5]} intensity={rig.key} color={rig.keyColor} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}>
        <orthographicCamera attach="shadow-camera" args={[-24, 24, 24, -24, 0.5, 80]} />
      </directionalLight>
      <directionalLight position={[-8, 5, 3]} intensity={rig.fill} color={rig.fillColor} />
      <directionalLight position={[0, 6, -10]} intensity={rig.rim} color={rig.rimColor} />
      {environment ? (
        <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color={rig.floor} roughness={0.95} metalness={0} />
        </mesh>
      ) : null}
      <group ref={spin}>{children}</group>
    </>
  );
}
