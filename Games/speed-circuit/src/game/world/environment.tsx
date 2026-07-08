import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Aabb } from "@jgengine/core/world/geometry";
import { scatter } from "@jgengine/core/world/scatter";
import { groundFieldFor } from "@jgengine/core/world/terrain";
import { createFieldGroundGeometry, withNormal, type TerrainField } from "@jgengine/shell/terrain";

import {
  buildRibbonGeometry,
  lateralOffset,
  offsetPolyline,
  pointAtDistance,
  tangentAt,
  type RibbonColorAt,
} from "../race/geometry";
import {
  TRACK_CENTERLINE,
  TRACK_CHECKPOINTS,
  TRACK_CORNER_MASK,
  TRACK_LENGTHS,
  TRACK_SURFACE_HEIGHT,
  TRACK_WIDTH,
} from "../race/track";
import { world as worldFeature } from "../../world";

const SKY_TOP = "#3fa4f2";
const SKY_HORIZON = "#e3f4ff";
const FOG_COLOR = "#e9f6ff";
const SUN_COLOR = "#fff1c9";
const HEMI_SKY = "#bfe3ff";
const HEMI_GROUND = "#4c6b34";

const ASPHALT_COLOR = "#55585d";
const EDGE_WHITE = "#f2f2f2";
const GRASS_LOW = "#356e2c";
const GRASS_HIGH = "#6fbd47";

const CURB_RED = new THREE.Color("#c81e1e");
const CURB_WHITE = new THREE.Color("#f2f2f2");
const CURB_GRASS = new THREE.Color(GRASS_LOW);

const DASH_LENGTH = 2.4;
const DASH_GAP = 2.4;
const DASH_WIDTH = 0.28;

const EMBANKMENT_HALF_WIDTH = TRACK_WIDTH / 2 + 3;
const EMBANKMENT_RAMP = 14;

const TERRAIN_DESCRIPTOR = worldFeature.kind === "environment" ? worldFeature.terrain : undefined;
const GROUND_BOUNDS = TERRAIN_DESCRIPTOR?.bounds ?? { w: 340, d: 340 };
const GROUND_HEIGHT = TERRAIN_DESCRIPTOR?.height ?? 0;
const GROUND_BASE_HEIGHT = TERRAIN_DESCRIPTOR?.baseHeight ?? 0;
const GROUND_HEIGHT_RANGE: readonly [number, number] = [
  GROUND_BASE_HEIGHT - GROUND_HEIGHT * 1.2,
  Math.max(GROUND_BASE_HEIGHT + GROUND_HEIGHT * 1.2, TRACK_SURFACE_HEIGHT + 0.5),
];

const TREE_CANOPY_TONES = ["#2f7a3d", "#3f9a4d", "#357a34"] as const;
const BANNER_COLORS = ["#ff5f6d", "#38e2ff", "#ffd23f", "#7be495"] as const;
const BANNER_COUNT = 14;
const BANNER_OFFSET = TRACK_WIDTH / 2 + 9;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function pointRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function useTrackAwareField(): TerrainField {
  return useMemo(() => {
    const base = groundFieldFor(worldFeature);
    const sampleHeight = (x: number, z: number): number => {
      const distance = lateralOffset([x, z], TRACK_CENTERLINE);
      const blend = smoothstep(EMBANKMENT_HALF_WIDTH, EMBANKMENT_HALF_WIDTH + EMBANKMENT_RAMP, distance);
      return TRACK_SURFACE_HEIGHT + (base.sampleHeight(x, z) - TRACK_SURFACE_HEIGHT) * blend;
    };
    return { sampleHeight, sampleNormal: withNormal(sampleHeight) };
  }, []);
}

function SkyDome() {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(SKY_TOP) },
        bottomColor: { value: new THREE.Color(SKY_HORIZON) },
        offset: { value: 24 },
        exponent: { value: 0.65 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
  }, []);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh material={material} renderOrder={-1}>
      <sphereGeometry args={[260, 32, 16]} />
    </mesh>
  );
}

function DaylightRig() {
  return (
    <>
      <fog attach="fog" args={[FOG_COLOR, 70, 260]} />
      <hemisphereLight args={[HEMI_SKY, HEMI_GROUND, 0.55]} />
      <directionalLight position={[120, 160, 70]} intensity={0.85} color={SUN_COLOR} castShadow />
    </>
  );
}

function TrackAwareGround({ field }: { field: TerrainField }) {
  const geometry = useMemo(
    () =>
      createFieldGroundGeometry(field, {
        size: [GROUND_BOUNDS.w, GROUND_BOUNDS.d],
        segments: 160,
        heightRange: GROUND_HEIGHT_RANGE,
        colors: { low: GRASS_LOW, high: GRASS_HIGH },
      }),
    [field],
  );
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometry} material={material} receiveShadow />;
}

function useRibbonGeometry(
  points: readonly { x: number; z: number }[],
  width: number,
  y: number,
  colorAt?: RibbonColorAt,
): THREE.BufferGeometry {
  return useMemo(() => {
    const { positions, indices, colors } = buildRibbonGeometry(points, width, y, colorAt);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    if (colors !== undefined) geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }, [points, width, y, colorAt]);
}

function curbColorAt(index: number): readonly [number, number, number] {
  if (!TRACK_CORNER_MASK[index]) return [CURB_GRASS.r, CURB_GRASS.g, CURB_GRASS.b];
  const color = Math.floor(index / 2) % 2 === 0 ? CURB_RED : CURB_WHITE;
  return [color.r, color.g, color.b];
}

function CenterDashes() {
  const total = TRACK_LENGTHS[TRACK_LENGTHS.length - 1]!;
  const dashes = useMemo(() => {
    const step = DASH_LENGTH + DASH_GAP;
    const count = Math.floor(total / step);
    return Array.from({ length: count }, (_, i) => {
      const distance = i * step + DASH_LENGTH / 2;
      const point = pointAtDistance(TRACK_CENTERLINE, TRACK_LENGTHS, distance);
      const tangent = tangentAt(TRACK_CENTERLINE, TRACK_LENGTHS, distance);
      return { x: point.x, z: point.z, heading: Math.atan2(tangent.x, tangent.z) };
    });
  }, [total]);
  return (
    <>
      {dashes.map((dash, index) => (
        <mesh key={index} position={[dash.x, TRACK_SURFACE_HEIGHT + 0.035, dash.z]} rotation={[0, dash.heading, 0]}>
          <boxGeometry args={[DASH_WIDTH, 0.02, DASH_LENGTH]} />
          <meshStandardMaterial color="#f5f5f5" roughness={0.5} />
        </mesh>
      ))}
    </>
  );
}

function TrackSurface() {
  const curb = useRibbonGeometry(TRACK_CENTERLINE, TRACK_WIDTH + 1.6, TRACK_SURFACE_HEIGHT + 0.015, curbColorAt);
  const asphalt = useRibbonGeometry(TRACK_CENTERLINE, TRACK_WIDTH, TRACK_SURFACE_HEIGHT + 0.02);
  const leftEdge = useMemo(() => offsetPolyline(TRACK_CENTERLINE, TRACK_WIDTH / 2 - 0.15), []);
  const rightEdge = useMemo(() => offsetPolyline(TRACK_CENTERLINE, -(TRACK_WIDTH / 2 - 0.15)), []);
  const leftLine = useRibbonGeometry(leftEdge, 0.28, TRACK_SURFACE_HEIGHT + 0.03);
  const rightLine = useRibbonGeometry(rightEdge, 0.28, TRACK_SURFACE_HEIGHT + 0.03);
  return (
    <>
      <mesh geometry={curb} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.85} />
      </mesh>
      <mesh geometry={asphalt} receiveShadow>
        <meshStandardMaterial color={ASPHALT_COLOR} roughness={0.92} />
      </mesh>
      <mesh geometry={leftLine}>
        <meshStandardMaterial color={EDGE_WHITE} roughness={0.5} />
      </mesh>
      <mesh geometry={rightLine}>
        <meshStandardMaterial color={EDGE_WHITE} roughness={0.5} />
      </mesh>
      <CenterDashes />
    </>
  );
}

function trackAvoidBoxes(): readonly Aabb[] {
  return TRACK_CENTERLINE.map((p) => ({
    minX: p.x - TRACK_WIDTH * 1.4,
    minZ: p.z - TRACK_WIDTH * 1.4,
    maxX: p.x + TRACK_WIDTH * 1.4,
    maxZ: p.z + TRACK_WIDTH * 1.4,
  }));
}

function ScenicTrees({ field }: { field: TerrainField }) {
  const points = useMemo(
    () =>
      scatter({
        area: { w: 320, d: 320 },
        density: 0.005,
        seed: "speed-circuit-trees",
        avoid: trackAvoidBoxes(),
        minDistance: 4.5,
      }),
    [],
  );
  return (
    <>
      {points.map((p) => {
        const scale = 0.75 + pointRandom(p.index) * 0.55;
        const tone = TREE_CANOPY_TONES[p.index % TREE_CANOPY_TONES.length]!;
        return (
          <group key={p.index} position={[p.x, field.sampleHeight(p.x, p.z), p.z]} scale={scale}>
            <mesh position-y={0.6} castShadow>
              <cylinderGeometry args={[0.14, 0.18, 1.2, 6]} />
              <meshStandardMaterial color="#5b4126" roughness={1} />
            </mesh>
            <mesh position-y={1.6} castShadow>
              <coneGeometry args={[0.85, 1.8, 7]} />
              <meshStandardMaterial color={tone} roughness={0.9} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function TrackBanners({ field }: { field: TerrainField }) {
  const total = TRACK_LENGTHS[TRACK_LENGTHS.length - 1]!;
  const banners = useMemo(
    () =>
      Array.from({ length: BANNER_COUNT }, (_, i) => {
        const distance = (i / BANNER_COUNT) * total;
        const point = pointAtDistance(TRACK_CENTERLINE, TRACK_LENGTHS, distance);
        const tangent = tangentAt(TRACK_CENTERLINE, TRACK_LENGTHS, distance);
        const side = i % 2 === 0 ? 1 : -1;
        const nx = -tangent.z * side;
        const nz = tangent.x * side;
        return {
          x: point.x + nx * BANNER_OFFSET,
          z: point.z + nz * BANNER_OFFSET,
          heading: Math.atan2(-nx, -nz),
          color: BANNER_COLORS[i % BANNER_COLORS.length]!,
        };
      }),
    [total],
  );
  return (
    <>
      {banners.map((banner, index) => (
        <group
          key={index}
          position={[banner.x, field.sampleHeight(banner.x, banner.z), banner.z]}
          rotation={[0, banner.heading, 0]}
        >
          <mesh position-y={1.6} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 3.2, 6]} />
            <meshStandardMaterial color="#3a3d42" roughness={0.7} />
          </mesh>
          <mesh position-y={2.6}>
            <boxGeometry args={[1.8, 0.9, 0.05]} />
            <meshStandardMaterial color={banner.color} roughness={0.5} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function FinishBanner({
  center,
  heading,
  baseY,
}: {
  center: readonly [number, number, number];
  heading: number;
  baseY: number;
}) {
  const segments = 8;
  const span = TRACK_WIDTH + 1.4;
  const segmentWidth = span / segments;
  return (
    <group position={[center[0], baseY, center[2]]} rotation={[0, heading, 0]}>
      {Array.from({ length: segments }, (_, i) => (
        <mesh key={i} position={[0, 0, -span / 2 + segmentWidth * (i + 0.5)]}>
          <boxGeometry args={[0.5, 0.55, segmentWidth * 0.92]} />
          <meshStandardMaterial color={i % 2 === 0 ? "#111318" : "#f4f4f4"} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function CheckpointGates() {
  const total = TRACK_LENGTHS[TRACK_LENGTHS.length - 1]!;
  return (
    <>
      {TRACK_CHECKPOINTS.map((cp, index) => {
        const isFinish = index === TRACK_CHECKPOINTS.length - 1;
        const color = isFinish ? "#ffd23f" : "#38e2ff";
        const tangent = tangentAt(TRACK_CENTERLINE, TRACK_LENGTHS, (index / TRACK_CHECKPOINTS.length) * total);
        const nx = -tangent.z;
        const nz = tangent.x;
        const lateralHeading = Math.atan2(nx, nz);
        const half = TRACK_WIDTH / 2 + 0.8;
        const left: readonly [number, number] = [cp.center[0] + nx * half, cp.center[2] + nz * half];
        const right: readonly [number, number] = [cp.center[0] - nx * half, cp.center[2] - nz * half];
        const archHeight = isFinish ? 5.6 : 4.4;
        const baseY = TRACK_SURFACE_HEIGHT;
        return (
          <group key={cp.id}>
            {[left, right].map((pos, side) => (
              <mesh key={side} position={[pos[0], baseY + archHeight / 2, pos[1]]}>
                <cylinderGeometry args={[0.09, 0.09, archHeight, 8]} />
                <meshStandardMaterial color="#e7e7ea" roughness={0.5} metalness={0.15} />
              </mesh>
            ))}
            <mesh position={[cp.center[0], baseY + archHeight, cp.center[2]]} rotation={[0, lateralHeading, 0]}>
              <boxGeometry args={[isFinish ? 3.2 : 1.6, 0.4, TRACK_WIDTH + 1.6]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isFinish ? 0.45 : 0.3} roughness={0.6} />
            </mesh>
            {isFinish ? (
              <FinishBanner center={cp.center} heading={lateralHeading} baseY={baseY + archHeight - 0.35} />
            ) : null}
          </group>
        );
      })}
    </>
  );
}

export function TrackEnvironment() {
  const field = useTrackAwareField();
  return (
    <>
      <SkyDome />
      <DaylightRig />
      <TrackAwareGround field={field} />
      <TrackSurface />
      <CheckpointGates />
      <ScenicTrees field={field} />
      <TrackBanners field={field} />
    </>
  );
}
