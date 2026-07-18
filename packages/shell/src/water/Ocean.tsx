import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createOceanConfig, type OceanConfig, type ResolvedOceanConfig } from "./OceanConfig";
import { createOceanMaterial, syncOceanMaterial } from "./OceanMaterial";

export interface OceanProps extends Omit<ThreeElements["mesh"], "args" | "children" | "geometry" | "material"> {
  config?: OceanConfig;
  /**
   * Water-column depth (m) under a point of the sheet, in the sheet's local XZ. When provided,
   * the shader shades shallow→deep by real depth, foams and turns transparent at the shore, and
   * damps waves as the bed shoals. Omit for an open ocean (everywhere-deep behavior).
   */
  depthAt?: (x: number, z: number) => number;
}

/** aDepth when no sampler is given: everywhere-deep, matching the pre-depth shader look. */
const OCEAN_DEFAULT_DEPTH = 1000;

function createOceanGeometry(config: ResolvedOceanConfig, depthAt?: (x: number, z: number) => number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(config.size, config.depth, config.resolution, config.resolution);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  const depths = new Float32Array(positions.count);
  if (depthAt === undefined) {
    depths.fill(OCEAN_DEFAULT_DEPTH);
  } else {
    for (let i = 0; i < positions.count; i += 1) {
      depths[i] = Math.max(0, depthAt(positions.getX(i), positions.getZ(i)));
    }
  }
  geometry.setAttribute("aDepth", new THREE.BufferAttribute(depths, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function Ocean({ config, depthAt, ...meshProps }: OceanProps) {
  const resolved = useMemo(() => createOceanConfig(config), [config]);
  const elapsedRef = useRef(0);
  const geometry = useMemo(() => createOceanGeometry(resolved, depthAt), [resolved, depthAt]);
  const material = useMemo(() => createOceanMaterial(resolved), [resolved]);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  useEffect(() => {
    elapsedRef.current = 0;
    return () => material.dispose();
  }, [material]);

  useFrame((_, delta) => {
    elapsedRef.current += delta * resolved.timeScale;
    syncOceanMaterial(material, resolved, elapsedRef.current);
  });

  return <mesh {...meshProps} geometry={geometry} material={material} />;
}
