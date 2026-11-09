import { useRef, type ReactNode } from "react";
import * as THREE from "three";

import { DEFAULT_FORWARD, yawToFace } from "@jgengine/core/scene/facing";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

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
  forward?: readonly [number, number, number] | undefined;
  children: ReactNode;
}

interface StageDrawProps {
  mood: StudioMood;
  backdrop?: string | undefined;
  turntable: number;
  environment: boolean;
  faceCamera: boolean;
  forward: readonly [number, number, number];
}

/**
 * The stage's lights, floor and backdrop as an {@link EngineDraw}; `getSpin` resolves the group the
 * React children render under so turntable/faceCamera still spin them. `state.scene` is the JSX
 * parent, so the background is only set when that parent is the real Scene — the same reach the old
 * `attach="background"` had.
 */
export function studioStageDraw(getProps: () => StageDrawProps, getSpin: () => THREE.Group | null): EngineDraw {
  const group = new THREE.Group();
  const lights: THREE.Light[] = [];
  let floor: THREE.Mesh | null = null;
  let previousBackground: THREE.Scene["background"] | null = null;
  const groupWorld = new THREE.Vector3();
  const cameraWorld = new THREE.Vector3();

  return {
    mount(state: EngineFrameState) {
      const props = getProps();
      const rig = MOODS[props.mood];
      state.scene.add(group);
      if (props.environment && state.scene instanceof THREE.Scene) {
        previousBackground = state.scene.background;
        state.scene.background = new THREE.Color(props.backdrop ?? rig.backdrop);
      }
      const ambient = new THREE.AmbientLight(rig.ambientColor, rig.ambient);
      const key = new THREE.DirectionalLight(rig.keyColor, rig.key);
      key.position.set(7, 9, 5);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.bias = -0.0004;
      key.shadow.camera.left = -24;
      key.shadow.camera.right = 24;
      key.shadow.camera.top = 24;
      key.shadow.camera.bottom = -24;
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 80;
      key.shadow.camera.updateProjectionMatrix();
      const fill = new THREE.DirectionalLight(rig.fillColor, rig.fill);
      fill.position.set(-8, 5, 3);
      const rim = new THREE.DirectionalLight(rig.rimColor, rig.rim);
      rim.position.set(0, 6, -10);
      lights.push(ambient, key, fill, rim);
      group.add(ambient, key, fill, rim);
      if (props.environment) {
        floor = new THREE.Mesh(
          new THREE.PlaneGeometry(400, 400),
          new THREE.MeshStandardMaterial({ color: rig.floor, roughness: 0.95, metalness: 0 }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.01;
        floor.receiveShadow = true;
        group.add(floor);
      }
    },
    frame(state: EngineFrameState) {
      const props = getProps();
      const spin = getSpin();
      if (spin === null) return;
      if (props.faceCamera) {
        spin.getWorldPosition(groupWorld);
        state.camera.getWorldPosition(cameraWorld);
        spin.rotation.y = yawToFace(props.forward, [groupWorld.x, groupWorld.z], [cameraWorld.x, cameraWorld.z]);
        return;
      }
      if (props.turntable !== 0) spin.rotation.y += props.turntable * state.delta;
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      for (const light of lights) light.dispose();
      lights.length = 0;
      if (floor !== null) {
        floor.geometry.dispose();
        (floor.material as THREE.Material).dispose();
        floor = null;
      }
      if (previousBackground !== null && state.scene instanceof THREE.Scene) {
        state.scene.background = previousBackground;
        previousBackground = null;
      }
    },
  };
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
  const props: StageDrawProps = { mood, backdrop, turntable, environment, faceCamera, forward };
  useEngineDraw(() => studioStageDraw(() => props, () => spin.current), [mood, backdrop, turntable, environment, faceCamera, forward]);
  return <group ref={spin}>{children}</group>;
}
