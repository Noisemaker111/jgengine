/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

/** One sprite in a batch: world position, size and atlas frame. */
export interface SpriteBatchInstance {
  /** World X position. */
  x: number;
  /** World Y position. */
  y: number;
  /** World Z position. Defaults to 0. */
  z?: number;
  /** Atlas frame index, row-major from the sheet's top-left. Defaults to 0. */
  frame?: number;
  /** Uniform scale multiplier for the unit quad. Defaults to 1. */
  scale?: number;
  /** Rotation in radians about the plane's facing axis. Defaults to 0. */
  rotation?: number;
}

/** Props for SpriteBatch: atlas URL and grid, and the sprites to draw. */
export interface SpriteBatchProps {
  /** Sprite sheet / atlas texture URL. */
  url: string;
  /** Atlas column count. Defaults to 1. */
  columns?: number;
  /** Atlas row count. Defaults to 1. */
  rows?: number;
  /** Max instances the InstancedMesh is allocated for. Defaults to 1024. */
  capacity?: number;
  /** Per-frame instance source, called once inside the frame task. */
  instances: () => readonly SpriteBatchInstance[];
  /** Facing plane when not billboarding: "xy" faces +Z (side-scroll/ortho), "xz" lies flat facing +Y. Defaults to "xy". */
  plane?: "xy" | "xz";
  /** When true, every instance orients to face the camera each frame, overriding `plane`. Defaults to false. */
  billboard?: boolean;
  /** Use nearest-neighbor filtering for crisp pixel art. Defaults to true. */
  pixelated?: boolean;
  /** Alpha test cutoff for transparent pixels. Defaults to 0.08. */
  alphaTest?: number;
  /** Material opacity. Defaults to 1. */
  opacity?: number;
}

const DEFAULT_CAPACITY = 1024;
const DEFAULT_ALPHA_TEST = 0.08;
const XZ_BASE_QUATERNION = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const LOCAL_NORMAL_AXIS = new THREE.Vector3(0, 0, 1);

const atlasLoads = new Map<string, Promise<THREE.Texture>>();

function loadAtlasTexture(url: string): Promise<THREE.Texture> {
  let pending = atlasLoads.get(url);
  if (pending === undefined) {
    pending = new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(url, resolve, undefined, reject);
    });
    atlasLoads.set(url, pending);
    pending.catch(() => atlasLoads.delete(url));
  }
  return pending;
}

/**
 * Renders a sprite sheet / tile atlas as a single InstancedMesh — one draw call for the whole
 * batch. Each instance picks its atlas frame via a per-instance UV offset attribute patched into
 * the material's vertex shader, so platformer/puzzle-grid presentation never needs one draw call
 * per sprite. Transforms and UV offsets are written directly into the mesh's typed arrays each
 * frame from a plain instance list (bodies never touch the per-entity UI path).
 * @capability sprite-batch Draw many atlas sprites in one instanced draw
 */
export function spriteBatchDraw(getProps: () => SpriteBatchProps): EngineDraw {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(1, 1);
  let mesh: THREE.InstancedMesh | null = null;
  let material: THREE.MeshBasicMaterial | null = null;
  let spriteUvOffset: THREE.InstancedBufferAttribute | null = null;
  let cancelled = false;
  const baseQuaternion = { current: new THREE.Quaternion() };
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const rotationQuaternion = new THREE.Quaternion();
  const scaleVector = new THREE.Vector3();
  const matrix = new THREE.Matrix4();

  function build(texture: THREE.Texture, state: EngineFrameState): void {
    if (cancelled) return;
    const props = getProps();
    const columns = props.columns ?? 1;
    const rows = props.rows ?? 1;
    const capacity = props.capacity ?? DEFAULT_CAPACITY;
    const alphaTest = props.alphaTest ?? DEFAULT_ALPHA_TEST;
    const opacity = props.opacity ?? 1;
    texture.colorSpace = THREE.SRGBColorSpace;
    if (props.pixelated ?? true) {
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.anisotropy = 1;
    } else {
      texture.anisotropy = 4;
    }
    texture.needsUpdate = true;

    spriteUvOffset = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    spriteUvOffset.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("spriteUvOffset", spriteUvOffset);

    material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest,
      depthWrite: false,
      opacity,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms["spriteUvScale"] = { value: new THREE.Vector2(1 / columns, 1 / rows) };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
attribute vec2 spriteUvOffset;
uniform vec2 spriteUvScale;`,
        )
        .replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = vMapUv * spriteUvScale + spriteUvOffset;
#endif`,
        );
    };
    material.customProgramCacheKey = () => `jgengine-sprite-batch-${columns}x${rows}`;

    mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    baseQuaternion.current = (props.plane === "xz" ? XZ_BASE_QUATERNION : new THREE.Quaternion()).clone();
    group.add(mesh);
    state.invalidate();
  }

  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      const url = getProps().url;
      void loadAtlasTexture(url).then((texture) => {
        if (!cancelled) build(texture, state);
      }).catch(() => {});
    },
    frame(state: EngineFrameState) {
      if (mesh === null || spriteUvOffset === null) return;
      const props = getProps();
      const columns = props.columns ?? 1;
      const rows = props.rows ?? 1;
      const capacity = props.capacity ?? DEFAULT_CAPACITY;
      const list = props.instances();
      const count = Math.min(list.length, capacity);
      mesh.count = count;

      const matrixArray = mesh.instanceMatrix.array as Float32Array;
      const uvArray = spriteUvOffset.array as Float32Array;

      for (let i = 0; i < count; i += 1) {
        const instance = list[i]!;
        position.set(instance.x, instance.y, instance.z ?? 0);

        if (props.billboard ?? false) {
          quaternion.copy(state.camera.quaternion);
        } else {
          quaternion.copy(baseQuaternion.current);
        }
        const rotation = instance.rotation ?? 0;
        if (rotation !== 0) {
          rotationQuaternion.setFromAxisAngle(LOCAL_NORMAL_AXIS, rotation);
          quaternion.multiply(rotationQuaternion);
        }

        const scale = instance.scale ?? 1;
        scaleVector.set(scale, scale, scale);

        matrix.compose(position, quaternion, scaleVector);
        matrix.toArray(matrixArray, i * 16);

        const frame = instance.frame ?? 0;
        const col = frame % columns;
        const row = Math.floor(frame / columns);
        const uo = i * 2;
        uvArray[uo] = col / columns;
        uvArray[uo + 1] = 1 - (row + 1) / rows;
      }

      mesh.instanceMatrix.needsUpdate = true;
      spriteUvOffset.needsUpdate = true;
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      state.scene.remove(group);
      group.clear();
      mesh = null;
      spriteUvOffset = null;
      geometry.dispose();
      material?.dispose();
      material = null;
    },
  };
}

/**
 * Renders a sprite sheet / tile atlas as a single InstancedMesh — one draw call for the whole
 * batch. Thin UI bridge over {@link spriteBatchDraw}.
 * @capability sprite-batch Draw many atlas sprites in one instanced draw
 */
export function SpriteBatch(props: SpriteBatchProps) {
  const latest = useRef<SpriteBatchProps>(props);
  latest.current = props;
  const { url, columns, rows, capacity, pixelated, alphaTest, opacity } = props;
  return (
    <EngineDrawMount
      create={() => spriteBatchDraw(() => latest.current)}
      deps={[url, columns, rows, capacity, pixelated, alphaTest, opacity]}
    />
  );
}
