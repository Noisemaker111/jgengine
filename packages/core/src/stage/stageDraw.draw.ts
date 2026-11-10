import { useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three-stdlib";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

/** One authored light for {@link stageDraw}: the r3f light intrinsics as data. */
export type StageLight =
  | { kind: "ambient"; intensity?: number; color?: string }
  | { kind: "hemisphere"; skyColor?: string; groundColor?: string; intensity?: number }
  | {
      kind: "directional";
      position?: readonly [number, number, number];
      intensity?: number;
      color?: string;
      castShadow?: boolean;
      shadowMapSize?: readonly [number, number];
      shadowBias?: number;
      shadowNormalBias?: number;
      shadowCamera?: { left?: number; right?: number; top?: number; bottom?: number; near?: number; far?: number };
    }
  | {
      kind: "spot";
      position?: readonly [number, number, number];
      angle?: number;
      penumbra?: number;
      intensity?: number;
      color?: string;
      castShadow?: boolean;
      shadowMapSize?: readonly [number, number];
    }
  | { kind: "point"; position?: readonly [number, number, number]; intensity?: number; color?: string; distance?: number };

/** Declarative stage dressing for preview and demo canvases — the r3f `<color>`/`<fog>`/light/ground/grid intrinsics as one draw. */
export interface StageSpec {
  background?: string | undefined;
  fog?: { color: string; near: number; far: number } | { color: string; density: number } | undefined;
  lights?: readonly StageLight[] | undefined;
  /** Receives shadows: a square ground plane, or a flat circle when `shape` is "circle". */
  ground?: { size?: number; width?: number; depth?: number; radius?: number; shape?: "plane" | "circle"; color?: string; roughness?: number; metalness?: number; emissive?: string; emissiveIntensity?: number; y?: number } | undefined;
  grid?: { size?: number; divisions?: number; color?: string; y?: number } | undefined;
}

function lightFrom(spec: StageLight): THREE.Light {
  switch (spec.kind) {
    case "ambient":
      return new THREE.AmbientLight(spec.color ?? "#ffffff", spec.intensity ?? 1);
    case "hemisphere":
      return new THREE.HemisphereLight(spec.skyColor ?? "#ffffff", spec.groundColor ?? "#444444", spec.intensity ?? 1);
    case "directional": {
      const light = new THREE.DirectionalLight(spec.color ?? "#ffffff", spec.intensity ?? 1);
      if (spec.position !== undefined) light.position.set(...spec.position);
      if (spec.castShadow === true) {
        light.castShadow = true;
        light.shadow.mapSize.set(spec.shadowMapSize?.[0] ?? 512, spec.shadowMapSize?.[1] ?? 512);
        if (spec.shadowBias !== undefined) light.shadow.bias = spec.shadowBias;
        if (spec.shadowNormalBias !== undefined) light.shadow.normalBias = spec.shadowNormalBias;
        if (spec.shadowCamera !== undefined) {
          const cam = light.shadow.camera;
          if (spec.shadowCamera.left !== undefined) cam.left = spec.shadowCamera.left;
          if (spec.shadowCamera.right !== undefined) cam.right = spec.shadowCamera.right;
          if (spec.shadowCamera.top !== undefined) cam.top = spec.shadowCamera.top;
          if (spec.shadowCamera.bottom !== undefined) cam.bottom = spec.shadowCamera.bottom;
          if (spec.shadowCamera.near !== undefined) cam.near = spec.shadowCamera.near;
          if (spec.shadowCamera.far !== undefined) cam.far = spec.shadowCamera.far;
          cam.updateProjectionMatrix();
        }
      }
      return light;
    }
    case "spot": {
      const light = new THREE.SpotLight(spec.color ?? "#ffffff", spec.intensity ?? 1, 0, spec.angle ?? Math.PI / 3, spec.penumbra ?? 0);
      if (spec.position !== undefined) light.position.set(...spec.position);
      if (spec.castShadow === true) {
        light.castShadow = true;
        light.shadow.mapSize.set(spec.shadowMapSize?.[0] ?? 512, spec.shadowMapSize?.[1] ?? 512);
      }
      return light;
    }
    case "point": {
      const light = new THREE.PointLight(spec.color ?? "#ffffff", spec.intensity ?? 1, spec.distance ?? 0);
      if (spec.position !== undefined) light.position.set(...spec.position);
      return light;
    }
  }
}

/**
 * One draw that applies a {@link StageSpec}: scene background/fog on the root scene, lights, an
 * optional shadow-receiving ground plane and an optional grid helper under the mount parent.
 * Reactive through {@link StageDraw}'s spec getter — prop changes rebuild the dressing.
 */
export function stageDraw(getSpec: () => StageSpec): EngineDraw {
  const owned: THREE.Object3D[] = [];
  const borrowed: { dispose(): void }[] = [];
  let background: THREE.Color | null = null;
  let fog: THREE.Fog | THREE.FogExp2 | null = null;
  let builtKey: string | null = null;

  const sceneRoot = (state: EngineFrameState): THREE.Scene => state.rootScene ?? state.scene;

  const clear = (state: EngineFrameState): void => {
    const root = sceneRoot(state);
    if (background !== null) root.background = null;
    if (fog !== null) root.fog = null;
    background = null;
    fog = null;
    for (const object of owned.splice(0)) {
      object.parent?.remove(object);
      object.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          const material = node.material;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material.dispose();
        }
      });
    }
    for (const entry of borrowed.splice(0)) entry.dispose();
  };

  const apply = (state: EngineFrameState): void => {
    const spec = getSpec();
    const key = JSON.stringify(spec);
    if (key === builtKey) return;
    clear(state);
    builtKey = key;
    const root = sceneRoot(state);
    if (spec.background !== undefined) {
      background = new THREE.Color(spec.background);
      root.background = background;
    }
    const fogSpec = spec.fog;
    if (fogSpec !== undefined) {
      fog = "density" in fogSpec ? new THREE.FogExp2(fogSpec.color, fogSpec.density) : new THREE.Fog(fogSpec.color, fogSpec.near, fogSpec.far);
      root.fog = fog;
    }
    for (const lightSpec of spec.lights ?? []) {
      const light = lightFrom(lightSpec);
      state.scene.add(light);
      owned.push(light);
    }
    if (spec.ground !== undefined) {
      const ground = spec.ground;
      const isCircle = ground.shape === "circle";
      const geometry = isCircle
        ? new THREE.CircleGeometry(ground.radius ?? 1, 48)
        : new THREE.PlaneGeometry(ground.width ?? ground.size ?? 20, ground.depth ?? ground.size ?? 20);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: ground.color ?? "#888888",
          roughness: ground.roughness ?? 0.9,
          metalness: ground.metalness ?? 0,
          ...(ground.emissive === undefined ? {} : { emissive: new THREE.Color(ground.emissive), emissiveIntensity: ground.emissiveIntensity ?? 1 }),
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = ground.y ?? 0;
      mesh.receiveShadow = true;
      state.scene.add(mesh);
      owned.push(mesh);
    }
    if (spec.grid !== undefined) {
      const helper = new THREE.GridHelper(spec.grid.size ?? 10, spec.grid.divisions ?? 10, spec.grid.color ?? "#444444", spec.grid.color ?? "#333333");
      helper.position.y = spec.grid.y ?? 0.01;
      state.scene.add(helper);
      owned.push(helper);
      borrowed.push(helper.geometry);
      const gridMaterial = helper.material;
      if (Array.isArray(gridMaterial)) borrowed.push(...gridMaterial);
      else borrowed.push(gridMaterial);
    }
  };

  return {
    mount(state) {
      apply(state);
    },
    update(state) {
      apply(state);
    },
    dispose(state) {
      clear(state);
      builtKey = null;
    },
  };
}

/** Mount a reactive {@link StageSpec} as one draw. */
export function StageDraw({ spec }: { spec: StageSpec }) {
  const ref = useRef(spec);
  ref.current = spec;
  return <EngineDrawMount create={() => stageDraw(() => ref.current)} deps={[]} />;
}

export interface OrbitControlsSpec {
  target?: readonly [number, number, number] | undefined;
  enablePan?: boolean;
  enableZoom?: boolean;
  enableRotate?: boolean;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  minAzimuthAngle?: number;
  maxAzimuthAngle?: number;
  /** Re-read each frame; return null to leave the controls' target alone. */
  targetOf?: (() => readonly [number, number, number] | null) | undefined;
}

/** drei `<OrbitControls>` as a draw: owns three-stdlib OrbitControls on the host camera + canvas. */
export function orbitControlsDraw(getSpec: () => OrbitControlsSpec): EngineDraw {
  let controls: OrbitControls | null = null;
  return {
    mount(state) {
      controls = new OrbitControls(state.camera, state.gl.domElement);
      const target = getSpec().target;
      if (target !== undefined) controls.target.set(target[0], target[1], target[2]);
      const spec = getSpec();
      controls.enablePan = spec.enablePan ?? true;
      controls.enableZoom = spec.enableZoom ?? true;
      controls.enableRotate = spec.enableRotate ?? true;
      if (spec.minPolarAngle !== undefined) controls.minPolarAngle = spec.minPolarAngle;
      if (spec.maxPolarAngle !== undefined) controls.maxPolarAngle = spec.maxPolarAngle;
      if (spec.minAzimuthAngle !== undefined) controls.minAzimuthAngle = spec.minAzimuthAngle;
      if (spec.maxAzimuthAngle !== undefined) controls.maxAzimuthAngle = spec.maxAzimuthAngle;
      controls.update();
    },
    frame(state) {
      if (controls === null) return;
      const live = getSpec().targetOf?.();
      if (live != null) {
        controls.target.set(live[0], live[1], live[2]);
      }
      controls.update();
    },
    dispose() {
      controls?.dispose();
      controls = null;
    },
  };
}

/** Mount reactive {@link OrbitControlsSpec} as one draw. */
export function OrbitControlsDraw({ spec }: { spec: OrbitControlsSpec }) {
  const ref = useRef(spec);
  ref.current = spec;
  return <EngineDrawMount create={() => orbitControlsDraw(() => ref.current)} deps={[]} />;
}

export interface CameraPoseSpec {
  position: readonly [number, number, number];
  target?: readonly [number, number, number] | undefined;
}

/** One-shot camera placement — the editor CameraRig / preview `<CameraRig>` pattern as a draw. */
export function cameraPoseDraw(getSpec: () => CameraPoseSpec): EngineDraw {
  let applied = false;
  return {
    frame(state) {
      if (applied) return;
      applied = true;
      const spec = getSpec();
      const camera = state.camera;
      camera.position.set(spec.position[0], spec.position[1], spec.position[2]);
      if (spec.target !== undefined) camera.lookAt(spec.target[0], spec.target[1], spec.target[2]);
      camera.updateProjectionMatrix();
    },
  };
}

/** Mount a {@link CameraPoseSpec} as one draw. */
export function CameraPoseDraw({ spec }: { spec: CameraPoseSpec }) {
  const ref = useRef(spec);
  ref.current = spec;
  return <EngineDrawMount create={() => cameraPoseDraw(() => ref.current)} deps={[]} />;
}
