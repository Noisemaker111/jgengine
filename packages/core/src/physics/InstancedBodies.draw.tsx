/** @jsxImportSource @jgengine/core/ui/jsx */
// @skill jgengine-world
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { PhysicsWorld } from "@jgengine/core/physics/physicsWorld";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

/** Props for InstancedBodies: the physics world to draw and optional state tinting. */
export interface InstancedBodiesProps {
  /** Physics world whose SoA buffers are streamed straight into the instance matrix. */
  world: PhysicsWorld;
  /** When true, color each instance by simulation state (sleeping / awake / contact) instead of its base color. */
  debugTint?: boolean;
  /** Per-body base RGB (length ≥ capacity·3), used when debugTint is off. Defaults to flat gray. */
  baseColors?: Float32Array;
  /** Bump to force a color re-upload after the world is rebuilt (e.g. reset). */
  epoch?: number;
}

const SLEEPING_COLOR = new THREE.Color(0.32, 0.4, 0.62);
const AWAKE_COLOR = new THREE.Color(0.45, 0.78, 0.5);
const CONTACT_COLOR = new THREE.Color(0.96, 0.55, 0.18);
const DEFAULT_BASE = new THREE.Color(0.62, 0.64, 0.68);

/**
 * Renders a PhysicsWorld's box bodies as a single InstancedMesh — one draw call per batch.
 * Transforms are written directly into `instanceMatrix.array` each frame (bodies never touch
 * the per-entity UI path). Reusable by any game: hand it a physics world and go.
 * @capability physics-body-instances Draw every physics body as one instanced mesh
 * @internal
 */
export function instancedBodiesDraw(getProps: () => InstancedBodiesProps): EngineDraw {
  const group = new THREE.Group();
  let mesh: THREE.InstancedMesh | null = null;
  let geometry: THREE.BoxGeometry | null = null;
  let material: THREE.MeshStandardMaterial | null = null;
  let instanceColor: THREE.InstancedBufferAttribute | null = null;
  let lastTint: boolean | null = null;
  let epochFor = -1;
  let debugTintFor: boolean | undefined;
  const sync = (_state: EngineFrameState) => {
    if (mesh === null || instanceColor === null) return;
    const props = getProps();
    const { world, debugTint = false, baseColors, epoch = 0 } = props;
    if (epoch !== epochFor || debugTint !== debugTintFor) {
      epochFor = epoch;
      debugTintFor = debugTint;
      lastTint = null;
    }
    const count = world.count;
    mesh.count = count;

    const m = mesh.instanceMatrix.array as Float32Array;
    const { posX, posY, posZ, halfX, halfY, halfZ } = world;
    for (let i = 0; i < count; i += 1) {
      const o = i * 16;
      m[o] = halfX[i]! * 2;
      m[o + 5] = halfY[i]! * 2;
      m[o + 10] = halfZ[i]! * 2;
      m[o + 12] = posX[i]!;
      m[o + 13] = posY[i]!;
      m[o + 14] = posZ[i]!;
      m[o + 15] = 1;
    }
    mesh.instanceMatrix.needsUpdate = true;

    const c = instanceColor.array as Float32Array;
    if (debugTint) {
      const { contact } = world;
      for (let i = 0; i < count; i += 1) {
        const col = contact[i] !== 0 ? CONTACT_COLOR : world.isSleeping(i) ? SLEEPING_COLOR : AWAKE_COLOR;
        const o = i * 3;
        c[o] = col.r;
        c[o + 1] = col.g;
        c[o + 2] = col.b;
      }
      instanceColor.needsUpdate = true;
    } else if (lastTint !== false) {
      if (baseColors !== undefined) {
        c.set(baseColors.subarray(0, world.capacity * 3));
      } else {
        for (let i = 0; i < world.capacity; i += 1) {
          const o = i * 3;
          c[o] = DEFAULT_BASE.r;
          c[o + 1] = DEFAULT_BASE.g;
          c[o + 2] = DEFAULT_BASE.b;
        }
      }
      instanceColor.needsUpdate = true;
    }
    lastTint = debugTint;
  };
  return {
    mount(state: EngineFrameState) {
      const capacity = getProps().world.capacity;
      geometry = new THREE.BoxGeometry(1, 1, 1);
      material = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, vertexColors: false });
      instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.instanceColor = instanceColor;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      group.add(mesh);
      state.scene.add(group);
    },
    frame: sync,
    update: sync,
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      mesh?.dispose();
      mesh = null;
      geometry?.dispose();
      geometry = null;
      material?.dispose();
      material = null;
      instanceColor = null;
      lastTint = null;
      epochFor = -1;
      debugTintFor = undefined;
    },
  };
}

/**
 * Renders a PhysicsWorld's box bodies as a single InstancedMesh — one draw call per batch.
 * Transforms are written directly into `instanceMatrix.array` each frame (bodies never touch
 * the per-entity UI path). Reusable by any game: hand it a physics world and go.
 * @capability physics-body-instances Draw every physics body as one instanced mesh
 */
export function InstancedBodies(props: InstancedBodiesProps) {
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => instancedBodiesDraw(() => latest.current), [props.world]);
  return null;
}
