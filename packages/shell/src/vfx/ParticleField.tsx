import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactElement } from "react";
import * as THREE from "three";

import type { ParticleSystem } from "@jgengine/core/vfx/particles";

/** How particle fragments composite: `additive` for fire/sparks/magic glow, `normal` for smoke/dust. */
export type ParticleBlending = "additive" | "normal";

const VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.0001, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    // Soft round sprite: radial falloff from the point center, discard the corners.
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, r);
    gl_FragColor = vec4(vColor, vAlpha * soft);
  }
`;

/** Props for {@link ParticleField}. */
export interface ParticleFieldProps {
  /** The core simulation to render (from `createParticleSystem`). */
  system: ParticleSystem;
  /**
   * Advance the simulation each frame with the render delta. Leave `true` for a
   * fire-and-forget effect; set `false` when your game loop already ticks the
   * system (so it advances exactly once per fixed step).
   */
  advance?: boolean;
  /** Compositing mode. Default `additive` (glowy). */
  blending?: ParticleBlending;
  /** Pixel-size multiplier applied to every particle's world radius. Default 300. */
  scale?: number;
  /** Write depth (occludes particles behind geometry). Default `false` so a glow layer never self-occludes. */
  depthWrite?: boolean;
}

/**
 * Renders a core `ParticleSystem` as a GPU point cloud: one draw call, per-particle
 * size / color / alpha via a soft-round shader, and a `drawRange` clamped to the live
 * count so dead particles cost nothing. The simulation stays engine-side and
 * genre-agnostic; this is purely how it reaches the screen. By default it advances
 * the sim with the frame delta — pass `advance={false}` to drive it from your own
 * fixed loop instead.
 *
 * @capability particle-field render a core particle system as a soft-point GPU cloud with per-particle size, color, and alpha
 */
export function ParticleField({
  system,
  advance = true,
  blending = "additive",
  scale = 300,
  depthWrite = false,
}: ParticleFieldProps): ReactElement {
  const pointsRef = useRef<THREE.Points>(null);
  const dpr = useThree((state) => state.viewport.dpr);

  const { geometry, material } = useMemo(() => {
    const initial = system.buffers();
    const max = initial.positions.length / 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(max), 1));
    geo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(max), 1));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: { uScale: { value: scale } },
      transparent: true,
      depthWrite,
      blending: blending === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    return { geometry: geo, material: mat };
  }, [system, scale, depthWrite, blending]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame((_, delta) => {
    if (advance) system.update(Math.min(delta, 0.1));
    const buffers = system.buffers();
    const count = buffers.count;
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const size = geometry.getAttribute("aSize") as THREE.BufferAttribute;
    const color = geometry.getAttribute("aColor") as THREE.BufferAttribute;
    const alpha = geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
    (pos.array as Float32Array).set(buffers.positions.subarray(0, count * 3));
    (size.array as Float32Array).set(buffers.sizes.subarray(0, count));
    (color.array as Float32Array).set(buffers.colors.subarray(0, count * 3));
    (alpha.array as Float32Array).set(buffers.alphas.subarray(0, count));
    pos.needsUpdate = true;
    size.needsUpdate = true;
    color.needsUpdate = true;
    alpha.needsUpdate = true;
    geometry.setDrawRange(0, count);
    material.uniforms.uScale!.value = scale * dpr;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />;
}
