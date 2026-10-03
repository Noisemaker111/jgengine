import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, type ReactElement } from "react";
import * as THREE from "three";

import type { ParticleSystem } from "@jgengine/core/vfx/particles";
import type { ParticleRenderHint } from "@jgengine/core/vfx/particleDirector";

/** How particle fragments composite on screen. */
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
    float r = length(gl_PointCoord - vec2(0.5));
    if (r > 0.5) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.0, r));
  }
`;

const QUAD_VERTEX = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec3 aEnd;
  attribute vec3 aVelocity;
  attribute float aId;
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uShape;
  uniform float uStretch;
  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 center = modelViewMatrix * vec4(aCenter, 1.0);
    vec4 view = center;
    if (uShape == 1.0 || uShape == 5.0) {
      vec3 end = uShape == 5.0 ? aEnd : aCenter - aVelocity * uStretch;
      vec4 tail = modelViewMatrix * vec4(end, 1.0);
      vec2 delta = center.xy - tail.xy;
      float len = length(delta);
      vec2 side = len > 0.00001 ? vec2(-delta.y, delta.x) / len : vec2(1.0, 0.0);
      view = mix(tail, center, uv.y);
      view.xy += side * position.x * aSize;
    } else if (uShape == 6.0) {
      view = modelViewMatrix * vec4(aCenter + vec3(position.x, 0.002, position.y) * aSize * 2.0, 1.0);
    } else {
      vec2 corner = position.xy * aSize;
      if (uShape == 2.0) {
        float angle = aId * 2.399963;
        corner = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * corner;
      }
      if (uShape == 3.0) {
        corner.y *= 2.7;
        corner.x += sin(aId * 1.7 + uv.y * 7.0) * aSize * 0.14 * uv.y;
      }
      if (uShape == 4.0) corner *= 1.65;
      view.xy += corner;
    }
    gl_Position = projectionMatrix * view;
  }
`;

const QUAD_FRAGMENT = /* glsl */ `
  uniform float uShape;
  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 d = vUv - 0.5;
    float alpha;
    if (uShape == 1.0 || uShape == 5.0) {
      alpha = smoothstep(0.5, 0.0, abs(d.x)) * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
    } else if (uShape == 2.0) {
      float angle = atan(d.y, d.x);
      float edge = 0.26 + 0.12 * pow(abs(cos(angle * 3.0)), 4.0);
      alpha = smoothstep(edge, edge * 0.62, length(d));
    } else if (uShape == 3.0) {
      float width = (1.0 - vUv.y) * 0.42 + 0.04;
      alpha = smoothstep(width, 0.0, abs(d.x)) * smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
    } else if (uShape == 6.0) {
      float r = length(d);
      alpha = smoothstep(0.07, 0.0, abs(r - 0.38));
    } else {
      float r = length(d);
      alpha = smoothstep(0.5, 0.08, r);
      if (uShape == 4.0) alpha *= 0.65 + 0.35 * sin(vUv.x * 15.0 + sin(vUv.y * 12.0));
    }
    alpha *= vAlpha;
    if (alpha < 0.001) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

const SHAPES: Record<ParticleRenderHint["shape"], number> = { point: 0, streak: 1, flake: 2, flame: 3, smoke: 4, ribbon: 5, ripple: 6 };

/** @internal Mutable resource/upload counters read through the shell's supported diagnostics probe. */
export interface ParticleFieldMetrics {
  fieldsMounted: number;
  fieldsUnmounted: number;
  liveFields: number;
  attributeBytes: number;
  totalUploadMs: number;
  maxUploadMs: number;
  uploadSamples: number;
}

/** Props for the existing pooled particle renderer. */
export interface ParticleFieldProps {
  system: ParticleSystem;
  /** Disable when an external loop already advances this system. Default true. */
  advance?: boolean;
  blending?: ParticleBlending;
  /** Pixel multiplier for point output. Quad outputs use particle sizes in world units. */
  scale?: number;
  depthWrite?: boolean;
  /** Point, instanced sprite, velocity streak, connected ribbon, or ground ripple output. */
  render?: ParticleRenderHint;
  /** @internal Optional diagnostics; omitted in production. */
  metrics?: ParticleFieldMetrics;
}

/**
 * Render one pooled simulation through a point cloud or instanced quads. Output
 * selection does not replace spawn, forces, collisions, or deterministic state.
 * @capability particle-field render a core particle pool as soft points, velocity streaks, connected ribbons, flakes, flames, smoke sprites, or ground ripples
 */
export function ParticleField({ system, advance = true, blending = "additive", scale = 300, depthWrite = false, render, metrics }: ParticleFieldProps): ReactElement {
  const dpr = useThree((state) => state.viewport.dpr);
  const shape = render?.shape ?? "point";
  const quad = shape !== "point";
  const { geometry, material, indexById } = useMemo(() => {
    const max = system.buffers().positions.length / 3;
    const geo = quad ? new THREE.InstancedBufferGeometry() : new THREE.BufferGeometry();
    if (quad) {
      geo.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      geo.setAttribute("aCenter", new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3));
      geo.setAttribute("aEnd", new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3));
      geo.setAttribute("aVelocity", new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3));
      geo.setAttribute("aId", new THREE.InstancedBufferAttribute(new Float32Array(max), 1));
      (geo as THREE.InstancedBufferGeometry).instanceCount = 0;
    } else {
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
      geo.setDrawRange(0, 0);
    }
    const attribute = (array: Float32Array, size: number) => quad ? new THREE.InstancedBufferAttribute(array, size) : new THREE.BufferAttribute(array, size);
    geo.setAttribute("aSize", attribute(new Float32Array(max), 1));
    geo.setAttribute("aColor", attribute(new Float32Array(max * 3), 3));
    geo.setAttribute("aAlpha", attribute(new Float32Array(max), 1));
    const mat = new THREE.ShaderMaterial({ vertexShader: quad ? QUAD_VERTEX : VERTEX_SHADER, fragmentShader: quad ? QUAD_FRAGMENT : FRAGMENT_SHADER,
      uniforms: { uScale: { value: scale }, uShape: { value: SHAPES[shape] }, uStretch: { value: render?.stretch ?? 0.08 } },
      transparent: true, depthWrite, side: THREE.DoubleSide,
      blending: blending === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending });
    return { geometry: geo, material: mat, indexById: new Map<number, number>() };
  }, [system, quad, shape, scale, depthWrite, blending]);

  useEffect(() => {
    const bytes = Object.values(geometry.attributes).reduce((total, attribute) => total + attribute.array.byteLength, geometry.index?.array.byteLength ?? 0);
    if (metrics !== undefined) { metrics.fieldsMounted++; metrics.liveFields++; metrics.attributeBytes += bytes; }
    return () => {
      geometry.dispose(); material.dispose();
      if (metrics !== undefined) { metrics.fieldsUnmounted++; metrics.liveFields--; metrics.attributeBytes -= bytes; }
    };
  }, [geometry, material, metrics]);

  useFrame((_, delta) => {
    const started = metrics === undefined ? 0 : performance.now();
    if (advance) system.update(Math.min(delta, 0.1));
    const buffers = system.buffers();
    const count = buffers.count;
    const upload = (name: string, values: Float32Array, n: number) => {
      const attr = geometry.getAttribute(name) as THREE.BufferAttribute;
      (attr.array as Float32Array).set(values.subarray(0, n));
      attr.needsUpdate = true;
    };
    upload(quad ? "aCenter" : "position", buffers.positions, count * 3);
    upload("aSize", buffers.sizes, count);
    upload("aColor", buffers.colors, count * 3);
    upload("aAlpha", buffers.alphas, count);
    if (quad) {
      upload("aVelocity", buffers.velocities, count * 3);
      const end = geometry.getAttribute("aEnd") as THREE.BufferAttribute;
      const ids = geometry.getAttribute("aId") as THREE.BufferAttribute;
      if (shape === "ribbon") {
        for (let i = 0; i < count; i++) indexById.set(buffers.ids[i]!, i);
        for (const id of indexById.keys()) {
          const index = indexById.get(id)!;
          if (index >= count || buffers.ids[index] !== id) indexById.delete(id);
        }
      }
      for (let i = 0; i < count; i++) {
        ids.setX(i, buffers.ids[i]!);
        const previousIndex = shape === "ribbon" ? indexById.get(buffers.ids[i]! - 1) : undefined;
        const source = previousIndex === undefined ? buffers.previousPositions : buffers.positions;
        const offset = (previousIndex ?? i) * 3;
        end.setXYZ(i, source[offset]!, source[offset + 1]!, source[offset + 2]!);
      }
      end.needsUpdate = true;
      ids.needsUpdate = true;
      (geometry as THREE.InstancedBufferGeometry).instanceCount = count;
    } else geometry.setDrawRange(0, count);
    material.uniforms.uScale!.value = scale * dpr;
    material.uniforms.uStretch!.value = render?.stretch ?? 0.08;
    if (metrics !== undefined) {
      const elapsed = performance.now() - started;
      metrics.totalUploadMs += elapsed;
      metrics.maxUploadMs = Math.max(metrics.maxUploadMs, elapsed);
      metrics.uploadSamples++;
    }
  });

  return quad ? <mesh geometry={geometry} material={material} frustumCulled={false} /> : <points geometry={geometry} material={material} frustumCulled={false} />;
}
