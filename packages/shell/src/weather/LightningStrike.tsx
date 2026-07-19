import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { useDisposable } from "../render/useDisposable";
import type { WeatherVector } from "./weatherUniforms";

export interface LightningStrikeProps {
  origin: WeatherVector;
  target: WeatherVector;
  strikeKey?: string | number;
  seed?: number;
  visible?: boolean;
  duration?: number;
  color?: THREE.ColorRepresentation;
  glow?: number;
  branches?: number;
  jaggedness?: number;
  impactLight?: number;
  renderOrder?: number;
}

interface LightningSegment {
  from: THREE.Vector3;
  to: THREE.Vector3;
}

const DEFAULT_COLOR = "#bdd4ff";

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function hashStrikeKey(value: string | number): number {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function vectorFromTuple(value: WeatherVector): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2]);
}

function perpendicularVector(direction: THREE.Vector3, random: () => number): THREE.Vector3 {
  const axis = Math.abs(direction.y) > 0.82 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3().crossVectors(direction, axis).normalize().applyAxisAngle(direction, random() * Math.PI * 2);
}

function createLightningSegments(
  origin: WeatherVector,
  target: WeatherVector,
  seed: number,
  branches: number,
  jaggedness: number,
): LightningSegment[] {
  const random = createRandom(seed);
  const start = vectorFromTuple(origin);
  const end = vectorFromTuple(target);
  const direction = new THREE.Vector3().subVectors(end, start).normalize();
  const length = start.distanceTo(end);
  const points: THREE.Vector3[] = [];
  const pointCount = 14;

  for (let index = 0; index < pointCount; index += 1) {
    const ratio = index / (pointCount - 1);
    const point = start.clone().lerp(end, ratio);
    if (index > 0 && index < pointCount - 1) {
      point.addScaledVector(perpendicularVector(direction, random), (random() - 0.5) * jaggedness * length);
    }
    points.push(point);
  }

  const segments: LightningSegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    segments.push({ from: points[index]!, to: points[index + 1]! });
  }

  const branchCount = Math.max(0, Math.floor(branches));
  for (let index = 0; index < branchCount; index += 1) {
    const sourceIndex = 2 + Math.floor(random() * Math.max(1, points.length - 5));
    const source = points[sourceIndex]!;
    const branchDirection = direction
      .clone()
      .addScaledVector(perpendicularVector(direction, random), 0.75 + random() * 0.8)
      .normalize();
    const branchLength = length * (0.1 + random() * 0.22);
    const middle = source.clone().addScaledVector(branchDirection, branchLength * 0.48);
    const tip = source.clone().addScaledVector(branchDirection, branchLength);
    middle.addScaledVector(perpendicularVector(branchDirection, random), (random() - 0.5) * jaggedness * length * 0.35);
    segments.push({ from: source.clone(), to: middle });
    segments.push({ from: middle, to: tip });
  }

  return segments;
}

function writeLightningGeometry(geometry: THREE.BufferGeometry, segments: LightningSegment[]) {
  const positions = new Float32Array(segments.length * 6);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    positions[index * 6] = segment.from.x;
    positions[index * 6 + 1] = segment.from.y;
    positions[index * 6 + 2] = segment.from.z;
    positions[index * 6 + 3] = segment.to.x;
    positions[index * 6 + 4] = segment.to.y;
    positions[index * 6 + 5] = segment.to.z;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
}

export function LightningStrike({
  origin,
  target,
  strikeKey = 0,
  seed = 451,
  visible = true,
  duration = 0.18,
  color = DEFAULT_COLOR,
  glow = 2.4,
  branches = 5,
  jaggedness = 0.08,
  impactLight = 26,
  renderOrder = 20,
}: LightningStrikeProps) {
  const lifeRef = useRef(0);
  const lightRef = useRef<THREE.PointLight | null>(null);
  const geometry = useDisposable(() => new THREE.BufferGeometry(), []);
  const material = useDisposable(
    () =>
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [color],
  );
  const line = useMemo(() => {
    const next = new THREE.LineSegments(geometry, material);
    next.frustumCulled = false;
    next.renderOrder = renderOrder;
    return next;
  }, [geometry, material, renderOrder]);

  useEffect(() => {
    if (!visible) {
      lifeRef.current = 0;
      material.opacity = 0;
      if (lightRef.current !== null) lightRef.current.intensity = 0;
      return;
    }
    writeLightningGeometry(
      geometry,
      createLightningSegments(origin, target, seed ^ hashStrikeKey(strikeKey), branches, jaggedness),
    );
    lifeRef.current = duration;
  }, [branches, duration, geometry, jaggedness, material, origin, seed, strikeKey, target, visible]);

  useFrame((_state, delta) => {
    if (!visible || lifeRef.current <= 0) {
      material.opacity = 0;
      if (lightRef.current !== null) lightRef.current.intensity = 0;
      return;
    }
    lifeRef.current = Math.max(0, lifeRef.current - delta);
    const amount = duration <= 0 ? 0 : lifeRef.current / duration;
    const flicker = 0.62 + Math.random() * 0.38;
    material.opacity = amount * glow * flicker;
    if (lightRef.current !== null) lightRef.current.intensity = amount * impactLight * flicker;
  });

  return (
    <>
      <primitive object={line} />
      <pointLight ref={lightRef} position={[target[0], target[1], target[2]]} color={color} intensity={0} distance={56} decay={2} />
    </>
  );
}
