import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

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

export interface SpriteBatchProps {
  /** Sprite sheet / atlas texture URL. */
  url: string;
  /** Atlas column count. Defaults to 1. */
  columns?: number;
  /** Atlas row count. Defaults to 1. */
  rows?: number;
  /** Max instances the InstancedMesh is allocated for. Defaults to 1024. */
  capacity?: number;
  /** Per-frame instance source, called once inside useFrame. */
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

/**
 * Renders a sprite sheet / tile atlas as a single InstancedMesh — one draw call for the whole
 * batch. Each instance picks its atlas frame via a per-instance UV offset attribute patched into
 * the material's vertex shader, so platformer/puzzle-grid presentation never needs one draw call
 * per sprite. Transforms and UV offsets are written directly into the mesh's typed arrays each
 * frame from a plain instance list (bodies never touch the per-entity React path).
 */
export function SpriteBatch({
  url,
  columns = 1,
  rows = 1,
  capacity = DEFAULT_CAPACITY,
  instances,
  plane = "xy",
  billboard = false,
  pixelated = true,
  alphaTest = DEFAULT_ALPHA_TEST,
  opacity = 1,
}: SpriteBatchProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  const texture = useLoader(THREE.TextureLoader, url);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    if (pixelated) {
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.anisotropy = 1;
    } else {
      texture.anisotropy = 4;
    }
    texture.needsUpdate = true;
  }, [texture, pixelated]);

  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  const spriteUvOffset = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2),
    [capacity],
  );

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest,
      depthWrite: false,
      opacity,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.spriteUvScale = { value: new THREE.Vector2(1 / columns, 1 / rows) };
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
    mat.customProgramCacheKey = () => `jgengine-sprite-batch-${columns}x${rows}`;
    return mat;
  }, [texture, columns, rows, alphaTest, opacity]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    mesh.geometry.setAttribute("spriteUvOffset", spriteUvOffset);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    spriteUvOffset.setUsage(THREE.DynamicDrawUsage);
  }, [spriteUvOffset]);

  const baseQuaternion = useMemo(
    () => (plane === "xz" ? XZ_BASE_QUATERNION.clone() : new THREE.Quaternion()),
    [plane],
  );
  const position = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const rotationQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const scaleVector = useMemo(() => new THREE.Vector3(), []);
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const list = instances();
    const count = Math.min(list.length, capacity);
    mesh.count = count;

    const matrixArray = mesh.instanceMatrix.array as Float32Array;
    const uvArray = spriteUvOffset.array as Float32Array;

    for (let i = 0; i < count; i += 1) {
      const instance = list[i]!;
      position.set(instance.x, instance.y, instance.z ?? 0);

      if (billboard) {
        quaternion.copy(camera.quaternion);
      } else {
        quaternion.copy(baseQuaternion);
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
  });

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, capacity]}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  );
}
