import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createOceanConfig, type OceanConfig, type ResolvedOceanConfig } from "./OceanConfig";
import { createOceanMaterial, syncOceanMaterial } from "./OceanMaterial";

export interface OceanProps extends Omit<ThreeElements["mesh"], "args" | "children" | "geometry" | "material"> {
  config?: OceanConfig;
}

function createOceanGeometry(config: ResolvedOceanConfig): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(config.size, config.depth, config.resolution, config.resolution);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingSphere();
  return geometry;
}

export function Ocean({ config, ...meshProps }: OceanProps) {
  const resolved = useMemo(() => createOceanConfig(config), [config]);
  const elapsedRef = useRef(0);
  const geometry = useMemo(() => createOceanGeometry(resolved), [resolved]);
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
