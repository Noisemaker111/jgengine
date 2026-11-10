/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { hashString, seededRng } from "@jgengine/core/random/rng";
import { lightningStrikeEnvelope } from "./weatherMath";
import type { WeatherVector } from "./weatherUniforms.draw";

/** Props for {@link LightningStrike}: bolt start and end, a key that restarts it, a seed for its shape and visibility. */
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
  /** Supply both fields to replay the strike from authoritative simulation state. */
  timeSeconds?: () => number;
  startedAt?: number;
}

interface LightningSegment {
  from: THREE.Vector3;
  to: THREE.Vector3;
}

const DEFAULT_COLOR = "#bdd4ff";

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
  const random = seededRng(seed);
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

  const branchCount = Math.max(0, Math.min(64, Math.floor(branches)));
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

/**
 * Draw-side form of {@link LightningStrike}: owns the bolt geometry, additive line material and
 * impact light, rebuilding the bolt when its shape inputs or visibility change and fading it with
 * the strike envelope each frame. @internal
 */
export function lightningStrikeDraw(getProps: () => LightningStrikeProps): EngineDraw {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineBasicMaterial({
    color: DEFAULT_COLOR,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.LineSegments(geometry, material);
  line.frustumCulled = false;
  const light = new THREE.PointLight(DEFAULT_COLOR, 0, 56, 2);
  let localTime = 0;
  let startAt: number | null = null;
  let builtKey = "";
  let appliedColor: THREE.ColorRepresentation | null = null;

  const sync = (_state: EngineFrameState) => {
    const props = getProps();
    const color = props.color ?? DEFAULT_COLOR;
    if (appliedColor !== color) {
      appliedColor = color;
      material.color.set(color);
      light.color.set(color);
    }
    line.renderOrder = props.renderOrder ?? 20;
    light.position.set(props.target[0], props.target[1], props.target[2]);
    const key = [
      props.origin[0], props.origin[1], props.origin[2],
      props.target[0], props.target[1], props.target[2],
      (props.seed ?? 451) ^ hashString(String(props.strikeKey ?? 0)),
      props.branches ?? 5,
      props.jaggedness ?? 0.08,
    ].join(",");
    const visible = props.visible ?? true;
    if (!visible) {
      builtKey = "";
      startAt = null;
      material.opacity = 0;
      light.intensity = 0;
      return;
    }
    const restart = builtKey !== key || startAt === null;
    if (restart) {
      builtKey = key;
      writeLightningGeometry(
        geometry,
        createLightningSegments(
          props.origin,
          props.target,
          (props.seed ?? 451) ^ hashString(String(props.strikeKey ?? 0)),
          props.branches ?? 5,
          props.jaggedness ?? 0.08,
        ),
      );
      startAt = props.startedAt ?? props.timeSeconds?.() ?? localTime;
    }
  };

  return {
    mount(state) {
      state.scene.add(line);
      state.scene.add(light);
      sync(state);
    },
    update: sync,
    frame(state: EngineFrameState) {
      sync(state);
      localTime += state.delta;
      const props = getProps();
      const visible = props.visible ?? true;
      const seedKey = (props.seed ?? 451) ^ hashString(String(props.strikeKey ?? 0));
      const now = props.timeSeconds?.() ?? localTime;
      const amount = visible && startAt !== null
        ? lightningStrikeEnvelope(now, startAt, props.duration ?? 0.18, seedKey)
        : 0;
      material.opacity = amount * (props.glow ?? 2.4);
      light.intensity = amount * (props.impactLight ?? 26);
    },
    dispose(state) {
      state.scene.remove(line);
      state.scene.remove(light);
      geometry.dispose();
      material.dispose();
    },
  };
}

/** A jagged, briefly flashing lightning bolt from `origin` to `target`. */
export function LightningStrike(props: LightningStrikeProps) {
  const latest = useRef(props);
  latest.current = props;
  return <EngineDrawMount create={() => lightningStrikeDraw(() => latest.current)} deps={[]} />;
}
