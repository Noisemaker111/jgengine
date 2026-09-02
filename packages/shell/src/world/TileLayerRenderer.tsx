import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { TilemapWorldConfig } from "@jgengine/core/world/features";
import { sortingOrder } from "@jgengine/core/render/sprite2d";

import { useDisposable } from "../render/useDisposable";

import { resolveTileLayerInstances } from "./tileLayerInstances";

/** Inputs for the instanced textured tile-layer renderer. */
export interface TileLayerRendererProps {
  config: TilemapWorldConfig;
  parallax?: readonly [number, number];
  pixelated?: boolean;
}

/** Renders a tilemap as one instanced quad mesh with atlas UV rectangles. */
export function TileLayerRenderer({ config, parallax = [1, 1], pixelated = true }: TileLayerRendererProps) {
  const tileSet = config.tileSet;
  const { camera } = useThree();
  const texture = useLoader(THREE.TextureLoader, tileSet?.atlas.image ?? "");
  const instances = useMemo(() => resolveTileLayerInstances(config), [config]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useDisposable(() => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  const uvOffset = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(Math.max(instances.length, 1) * 2), 2), [instances.length]);
  const uvScale = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(Math.max(instances.length, 1) * 2), 2), [instances.length]);
  const material = useDisposable(() => {
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.08, depthWrite: false });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 tileUvOffset;\nattribute vec2 tileUvScale;").replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = vMapUv * tileUvScale + tileUvOffset;\n#endif");
    };
    mat.customProgramCacheKey = () => "jgengine-tile-layer";
    return mat;
  }, [texture]);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = pixelated ? THREE.NearestFilter : THREE.LinearFilter;
    texture.minFilter = pixelated ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
  }, [texture, pixelated]);

  useEffect(() => {
    geometry.setAttribute("tileUvOffset", uvOffset);
    geometry.setAttribute("tileUvScale", uvScale);
  }, [geometry, uvOffset, uvScale]);

  const matrix = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    mesh.position.set(-camera.position.x * (1 - parallax[0]), 0, camera.position.z * (1 - parallax[1]));
  });
  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    mesh.count = instances.length;
    const array = mesh.instanceMatrix.array as Float32Array;
    const offset = uvOffset.array as Float32Array;
    const scale = uvScale.array as Float32Array;
    for (let i = 0; i < instances.length; i += 1) {
      const instance = instances[i]!;
      matrix.makeTranslation(instance.x, 0, instance.z).toArray(array, i * 16);
      offset.set(instance.uvOffset, i * 2);
      scale.set(instance.uvScale, i * 2);
    }
    mesh.instanceMatrix.needsUpdate = true;
    uvOffset.needsUpdate = true;
    uvScale.needsUpdate = true;
  }, [instances, matrix, uvOffset, uvScale]);

  if (tileSet === undefined || instances.length === 0) return null;
  return <instancedMesh ref={meshRef} args={[geometry, material, instances.length]} renderOrder={sortingOrder(["ground", "objects", "effects"], config.sortingLayer ?? "ground", 0)} frustumCulled={false} />;
}
