import { useMemo } from "react";
import * as THREE from "three";
import type { Aabb } from "@jgengine/core/world/geometry";
import { scatter } from "@jgengine/core/world/scatter";
import { EnvironmentScene } from "@jgengine/shell/environment";

import { buildRibbonGeometry, tangentAt, type Vec2 } from "../race/geometry";
import { TRACK_CENTERLINE, TRACK_CHECKPOINTS, TRACK_LENGTHS, TRACK_WIDTH } from "../race/track";
import { world as worldFeature } from "../../world";

function useRibbonGeometry(points: readonly Vec2[], width: number, y: number): THREE.BufferGeometry {
  return useMemo(() => {
    const { positions, indices } = buildRibbonGeometry(points, width, y);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    return geometry;
  }, [points, width, y]);
}

function TrackSurface() {
  const curb = useRibbonGeometry(TRACK_CENTERLINE, TRACK_WIDTH + 1.6, 0.015);
  const asphalt = useRibbonGeometry(TRACK_CENTERLINE, TRACK_WIDTH, 0.02);
  const lane = useRibbonGeometry(TRACK_CENTERLINE, 0.3, 0.03);
  return (
    <>
      <mesh geometry={curb} receiveShadow>
        <meshStandardMaterial color="#d1451f" roughness={0.9} />
      </mesh>
      <mesh geometry={asphalt} receiveShadow>
        <meshStandardMaterial color="#2a2c31" roughness={0.85} />
      </mesh>
      <mesh geometry={lane}>
        <meshStandardMaterial color="#e8d24a" emissive="#e8d24a" emissiveIntensity={0.15} roughness={0.6} />
      </mesh>
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

function ScenicTrees() {
  const points = useMemo(
    () =>
      scatter({
        area: { w: 300, d: 300 },
        density: 0.0014,
        seed: "speed-circuit-trees",
        avoid: trackAvoidBoxes(),
        minDistance: 6,
      }),
    [],
  );
  return (
    <>
      {points.map((p) => (
        <group key={p.index} position={[p.x, 0, p.z]}>
          <mesh position-y={0.6} castShadow>
            <cylinderGeometry args={[0.14, 0.18, 1.2, 6]} />
            <meshStandardMaterial color="#5b4126" roughness={1} />
          </mesh>
          <mesh position-y={1.6} castShadow>
            <coneGeometry args={[0.85, 1.8, 7]} />
            <meshStandardMaterial color="#2f7a3d" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </>
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
        const half = TRACK_WIDTH / 2 + 0.8;
        const left: readonly [number, number] = [cp.center[0] + nx * half, cp.center[2] + nz * half];
        const right: readonly [number, number] = [cp.center[0] - nx * half, cp.center[2] - nz * half];
        return (
          <group key={cp.id}>
            {[left, right].map((pos, side) => (
              <mesh key={side} position={[pos[0], 1.4, pos[1]]}>
                <cylinderGeometry args={[0.12, 0.12, 2.8, 8]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} />
              </mesh>
            ))}
          </group>
        );
      })}
    </>
  );
}

export function TrackEnvironment() {
  return (
    <>
      {worldFeature.kind === "environment" ? <EnvironmentScene feature={worldFeature} /> : null}
      <TrackSurface />
      <CheckpointGates />
      <ScenicTrees />
    </>
  );
}
