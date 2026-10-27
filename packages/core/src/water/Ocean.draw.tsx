// @skill jgengine-world
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useOptionalGameContext } from "@jgengine/react/provider";

import { useDisposable } from "@jgengine/core/render/useDisposable.draw";
import { skySunDirection } from "@jgengine/core/sky/skySun.draw";
import { createOceanConfig, type OceanConfig, type ResolvedOceanConfig } from "./OceanConfig.draw";
import { createOceanMaterial, syncOceanMaterial } from "./OceanMaterial.draw";

/** Props for {@link Ocean}: the ocean config, an optional water-depth sampler for shore colour and foam, and mesh props. */
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

/** An animated Gerstner-wave ocean sheet; `depthAt` tints shallows and adds shoreline foam. */
export function Ocean({ config, depthAt, ...meshProps }: OceanProps) {
  const resolved = useMemo(() => createOceanConfig(config), [config]);
  const elapsedRef = useRef(0);
  const geometry = useDisposable(() => createOceanGeometry(resolved, depthAt), [resolved, depthAt]);
  const material = useDisposable(() => createOceanMaterial(resolved), [resolved]);

  useEffect(() => {
    elapsedRef.current = 0;
  }, [material]);

  const ctx = useOptionalGameContext();
  useFrame((state, delta) => {
    // Waves run on the game clock, so they stop when the game pauses and line up with the water
    // surface buoyancy samples; before any game time has passed (a title screen) or with no game
    // (an editor preview) they run on real time.
    const advanced = ctx?.time.advancedSeconds?.();
    elapsedRef.current = advanced !== undefined && advanced > 0 ? advanced * resolved.timeScale : elapsedRef.current + delta * resolved.timeScale;
    syncOceanMaterial(material, resolved, elapsedRef.current, skySunDirection(state.scene));
  });

  return <mesh {...meshProps} geometry={geometry} material={material} />;
}
