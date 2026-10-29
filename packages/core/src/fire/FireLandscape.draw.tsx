// @skill jgengine-world
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { FireLandscape } from "./fireLandscape";
import { seededRng } from "../random/rng";

/** Props for {@link FireLandscapeView}. */
export interface FireLandscapeViewProps {
  fire: FireLandscape;
  /** Ground height so the overlay, flames and smoke sit on terrain; flat y = 0 when omitted. */
  heightAt?: (x: number, z: number) => number;
  /** Wind the smoke drifts with, m/s in world x and z. */
  wind?: readonly [number, number];
  /** Most flame billboards drawn at once. Default 2048. */
  maxFlames?: number;
  /** Most smoke puffs alive at once. Default 1024. */
  maxSmoke?: number;
  /** Ground cells repainted per frame besides the burning ones; bounds the overlay's cost. Default 4096. */
  overlayCellsPerFrame?: number;
}

const OVERLAY_LIFT = 0.04;

const billboardVertex = /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aSize;
attribute vec2 aShade;
varying vec2 vUv;
varying vec2 vShade;
void main() {
  vUv = uv;
  vShade = aShade;
  vec4 view = modelViewMatrix * vec4(aCenter, 1.0);
  view.xy += vec2(position.x * aSize.x, (position.y + 0.5) * aSize.y);
  gl_Position = projectionMatrix * view;
}`;

const flameFragment = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec2 vShade;
void main() {
  float y = vUv.y;
  float flicker = 0.85 + 0.15 * sin(uTime * 13.0 + vShade.y * 40.0 + y * 6.0);
  float sway = 0.06 * sin(uTime * 7.0 + vShade.y * 17.0 + y * 4.0) * y;
  float half_ = 0.5 * pow(max(0.0, 1.0 - y), 0.6) * (0.75 + 0.25 * sin(y * 3.14159));
  float d = abs(vUv.x - 0.5 - sway);
  float body = smoothstep(half_, half_ * 0.45, d) * smoothstep(1.0, 0.55 * flicker, y);
  vec3 base = vec3(1.0, 0.78, 0.3);
  vec3 mid = vec3(1.0, 0.42, 0.05);
  vec3 tip = vec3(0.7, 0.1, 0.02);
  vec3 color = mix(mix(base, mid, smoothstep(0.0, 0.45, y)), tip, smoothstep(0.45, 1.0, y));
  float a = body * (0.55 + 0.45 * vShade.x);
  if (a < 0.01) discard;
  gl_FragColor = vec4(color * a, a);
}`;

const smokeFragment = /* glsl */ `
varying vec2 vUv;
varying vec2 vShade;
void main() {
  vec2 p = vUv - vec2(0.5);
  float r = length(p) * 2.0;
  float a = smoothstep(1.0, 0.2, r) * vShade.x;
  if (a < 0.005) discard;
  vec3 color = mix(vec3(0.42, 0.4, 0.38), vec3(0.16, 0.15, 0.14), vShade.y);
  gl_FragColor = vec4(color, a);
}`;

function billboardGeometry(capacity: number): {
  geometry: THREE.InstancedBufferGeometry;
  center: THREE.InstancedBufferAttribute;
  size: THREE.InstancedBufferAttribute;
  shade: THREE.InstancedBufferAttribute;
} {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute("position", quad.getAttribute("position"));
  geometry.setAttribute("uv", quad.getAttribute("uv"));
  const center = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const size = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
  const shade = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aCenter", center);
  geometry.setAttribute("aSize", size);
  geometry.setAttribute("aShade", shade);
  geometry.instanceCount = 0;
  return { geometry, center, size, shade };
}

/** Paint one overlay texel from a cell's fire record. */
function paint(fire: FireLandscape, i: number, data: Uint8Array): void {
  const { state, char, ash, intensity } = fire.layers;
  const s = state[i] ?? 0;
  const o = i * 4;
  if (s === 0) {
    data[o + 3] = 0;
    return;
  }
  if (s === 1) {
    const heat = Math.min(1, Math.sqrt((intensity[i] ?? 0) / 4000));
    data[o] = 255;
    data[o + 1] = Math.round(110 + 90 * heat);
    data[o + 2] = 30;
    data[o + 3] = 235;
    return;
  }
  if (s === 2) {
    const ember = ((Math.imul(i ^ (i >>> 7), 0x5bd1e995) >>> 0) >>> 26) < 9 ? 1 : 0;
    data[o] = 58 + 150 * ember;
    data[o + 1] = 22 + 40 * ember;
    data[o + 2] = 12;
    data[o + 3] = 225;
    return;
  }
  const blackened = Math.min(1, Math.max(0, char[i] ?? 0));
  const grey = Math.min(1, (ash[i] ?? 0) / 0.04);
  data[o] = Math.round(24 + 120 * grey);
  data[o + 1] = Math.round(20 + 116 * grey);
  data[o + 2] = Math.round(17 + 110 * grey);
  data[o + 3] = Math.round(70 + 170 * blackened);
}

/**
 * Draw a {@link FireLandscape}: a ground overlay of flaming, smouldering, charred and ashen cells, flame
 * billboards as tall as each cell's flame length, and smoke puffs rising from burning cells and drifting
 * downwind. Per-frame work is bounded by the burning cells plus `overlayCellsPerFrame`.
 */
export function FireLandscapeView({ fire, heightAt, wind = [0, 0], maxFlames = 2048, maxSmoke = 1024, overlayCellsPerFrame = 4096 }: FireLandscapeViewProps) {
  const { cols, rows, cellSize, originX, originZ } = fire;
  const groundY = (x: number, z: number): number => heightAt?.(x, z) ?? 0;

  const overlay = useMemo(() => {
    const data = new Uint8Array(cols * rows * 4);
    const texture = new THREE.DataTexture(data, cols, rows, THREE.RGBAFormat);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const geometry = new THREE.PlaneGeometry(cols * cellSize, rows * cellSize, cols, rows);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    for (let k = 0; k < position.count; k++) {
      const x = position.getX(k) + originX + (cols * cellSize) / 2;
      const z = position.getZ(k) + originZ + (rows * cellSize) / 2;
      position.setXYZ(k, x, groundY(x, z) + OVERLAY_LIFT, z);
      uv.setY(k, 1 - uv.getY(k));
    }
    geometry.computeBoundingSphere();
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return { data, texture, geometry, material };
    // heightAt is read once: the ground under a fire does not move.
  }, [cols, rows, cellSize, originX, originZ]);

  const flames = useMemo(() => {
    const parts = billboardGeometry(maxFlames);
    const material = new THREE.ShaderMaterial({
      vertexShader: billboardVertex,
      fragmentShader: flameFragment,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { ...parts, material };
  }, [maxFlames]);

  const smoke = useMemo(() => {
    const parts = billboardGeometry(maxSmoke);
    const material = new THREE.ShaderMaterial({ vertexShader: billboardVertex, fragmentShader: smokeFragment, transparent: true, depthWrite: false });
    return {
      ...parts,
      material,
      x: new Float32Array(maxSmoke),
      y: new Float32Array(maxSmoke),
      z: new Float32Array(maxSmoke),
      rise: new Float32Array(maxSmoke),
      age: new Float32Array(maxSmoke),
      life: new Float32Array(maxSmoke),
      dark: new Float32Array(maxSmoke),
      alive: 0,
    };
  }, [maxSmoke]);

  useEffect(
    () => () => {
      overlay.texture.dispose();
      overlay.geometry.dispose();
      overlay.material.dispose();
    },
    [overlay],
  );
  useEffect(
    () => () => {
      flames.geometry.dispose();
      flames.material.dispose();
    },
    [flames],
  );
  useEffect(
    () => () => {
      smoke.geometry.dispose();
      smoke.material.dispose();
    },
    [smoke],
  );

  const cursor = useRef({ row: 0, lastTime: Number.NaN, random: seededRng("fire-smoke"), spawnDebt: 0 });

  useFrame((state, delta) => {
    const c = cursor.current;
    const n = cols * rows;
    const { data } = overlay;
    const jumped = Number.isNaN(c.lastTime) || fire.time < c.lastTime;
    c.lastTime = fire.time;
    const active = fire.activeCells();
    if (jumped) for (let i = 0; i < n; i++) paint(fire, i, data);
    else {
      for (const i of active) paint(fire, i, data);
      const sweepRows = Math.max(1, Math.min(rows, Math.ceil(overlayCellsPerFrame / cols)));
      for (let k = 0; k < sweepRows; k++) {
        const r = (c.row + k) % rows;
        for (let col = 0; col < cols; col++) paint(fire, r * cols + col, data);
      }
      c.row = (c.row + sweepRows) % rows;
    }
    overlay.texture.needsUpdate = true;

    const { flameLength, intensity, state: burn, kind } = fire.layers;
    const fc = flames.center.array;
    const fs = flames.size.array;
    const fh = flames.shade.array;
    let flameCount = 0;
    const stride = Math.max(1, Math.ceil(active.length / maxFlames));
    for (let k = 0; k < active.length && flameCount < maxFlames; k += stride) {
      const i = active[k] ?? 0;
      if ((burn[i] ?? 0) !== 1) continue;
      const col = i % cols;
      const row = (i - col) / cols;
      const x = originX + (col + 0.5) * cellSize;
      const z = originZ + (row + 0.5) * cellSize;
      const length = Math.max(0.3, flameLength[i] ?? 0);
      fc[flameCount * 3] = x;
      fc[flameCount * 3 + 1] = groundY(x, z);
      fc[flameCount * 3 + 2] = z;
      fs[flameCount * 2] = Math.min(cellSize * 1.1, Math.max(0.5, length * 0.6)) * Math.sqrt(stride);
      fs[flameCount * 2 + 1] = length;
      fh[flameCount * 2] = Math.min(1, Math.sqrt((intensity[i] ?? 0) / 4000));
      fh[flameCount * 2 + 1] = ((i * 2654435761) >>> 0) / 4294967296;
      flameCount++;
    }
    flames.geometry.instanceCount = flameCount;
    flames.center.needsUpdate = true;
    flames.size.needsUpdate = true;
    flames.shade.needsUpdate = true;
    const time = flames.material.uniforms["uTime"];
    if (time !== undefined) time.value = state.clock.elapsedTime;

    const dt = Math.min(0.1, delta);
    const next = c.random;
    let alive = 0;
    for (let p = 0; p < smoke.alive; p++) {
      const age = (smoke.age[p] ?? 0) + dt;
      if (age >= (smoke.life[p] ?? 0)) continue;
      smoke.x[alive] = (smoke.x[p] ?? 0) + wind[0] * dt;
      smoke.z[alive] = (smoke.z[p] ?? 0) + wind[1] * dt;
      smoke.y[alive] = (smoke.y[p] ?? 0) + (smoke.rise[p] ?? 0) * dt;
      smoke.rise[alive] = smoke.rise[p] ?? 0;
      smoke.age[alive] = age;
      smoke.life[alive] = smoke.life[p] ?? 0;
      smoke.dark[alive] = smoke.dark[p] ?? 0;
      alive++;
    }
    if (active.length > 0) {
      c.spawnDebt += dt * Math.min(maxSmoke / 6, active.length * 0.6);
      while (c.spawnDebt >= 1 && alive < maxSmoke) {
        c.spawnDebt -= 1;
        const i = active[Math.floor(next() * active.length)] ?? 0;
        const col = i % cols;
        const row = (i - col) / cols;
        const x = originX + (col + next()) * cellSize;
        const z = originZ + (row + next()) * cellSize;
        const heat = Math.sqrt(Math.max(0, intensity[i] ?? 0));
        smoke.x[alive] = x;
        smoke.z[alive] = z;
        smoke.y[alive] = groundY(x, z) + Math.max(0.5, flameLength[i] ?? 0) * 0.8;
        smoke.rise[alive] = 1.2 + 0.04 * heat + next();
        smoke.age[alive] = 0;
        smoke.life[alive] = 5 + 5 * next();
        smoke.dark[alive] = (kind[i] ?? 0) >= 2 ? 1 : (burn[i] ?? 0) === 2 ? 0.2 : 0.5;
        alive++;
      }
      c.spawnDebt = Math.min(c.spawnDebt, 1);
    }
    smoke.alive = alive;
    const sc = smoke.center.array;
    const ss = smoke.size.array;
    const sh = smoke.shade.array;
    for (let p = 0; p < alive; p++) {
      const t = (smoke.age[p] ?? 0) / Math.max(1e-3, smoke.life[p] ?? 1);
      const size = cellSize * 3 + 14 * t * Math.max(1, cellSize);
      sc[p * 3] = smoke.x[p] ?? 0;
      sc[p * 3 + 1] = (smoke.y[p] ?? 0) - size / 2;
      sc[p * 3 + 2] = smoke.z[p] ?? 0;
      ss[p * 2] = size;
      ss[p * 2 + 1] = size;
      sh[p * 2] = 0.55 * Math.min(1, t * 6) * (1 - t);
      sh[p * 2 + 1] = smoke.dark[p] ?? 0;
    }
    smoke.geometry.instanceCount = alive;
    smoke.center.needsUpdate = true;
    smoke.size.needsUpdate = true;
    smoke.shade.needsUpdate = true;
  });

  return (
    <group>
      <mesh geometry={overlay.geometry} material={overlay.material} renderOrder={4} />
      <mesh geometry={flames.geometry} material={flames.material} frustumCulled={false} renderOrder={11} />
      <mesh geometry={smoke.geometry} material={smoke.material} frustumCulled={false} renderOrder={12} />
    </group>
  );
}
