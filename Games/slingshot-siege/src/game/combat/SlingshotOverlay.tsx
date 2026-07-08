import type { ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { InstancedBodies } from "@jgengine/shell/world/InstancedBodies";

import { DUMMY_COLOR, GROUND_COLOR, MATERIALS, PROJECTILE_COLOR } from "../physics/impact";
import {
  GROUND_CENTER,
  GROUND_HALF,
  SLING_ANCHOR,
  useSlingshotState,
  useSlingshotStore,
  type BodyMeta,
} from "../state/slingshotStore";

const FORK_COLOR = "#6b4a26";
const BAND_COLOR = "#3a2a18";
const POUCH_COLOR = "#241a10";
const PACKED_EARTH_COLOR = "#4a3a26";
const PLATFORM_THICKNESS = 0.06;
const SLING_PLATFORM_SIZE: readonly [number, number] = [2.6, 2.2];
const SIEGE_ZONE_CENTER_X = 12.5;
const SIEGE_ZONE_HALF: readonly [number, number] = [5, 3.5];

function bodyColor(meta: BodyMeta): readonly [number, number, number] {
  if (meta.kind === "ground") return GROUND_COLOR;
  if (meta.kind === "dummy") return DUMMY_COLOR;
  if (meta.kind === "projectile") return PROJECTILE_COLOR;
  return MATERIALS[meta.material].color;
}

function buildBaseColors(bodyMeta: readonly BodyMeta[], capacity: number): Float32Array {
  const colors = new Float32Array(capacity * 3);
  for (let i = 0; i < bodyMeta.length; i += 1) {
    const [r, g, b] = bodyColor(bodyMeta[i]!);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return colors;
}

function Band({ from, to }: { from: THREE.Vector3; to: THREE.Vector3 }) {
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const length = Math.max(0.01, from.distanceTo(to));
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    to.clone().sub(from).normalize(),
  );
  return (
    <mesh position={mid} quaternion={quaternion}>
      <cylinderGeometry args={[0.025, 0.025, length, 6]} />
      <meshStandardMaterial color={BAND_COLOR} roughness={0.7} />
    </mesh>
  );
}

function SlingshotFork() {
  const [x, y, z] = SLING_ANCHOR;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[-0.18, y * 0.5, 0]} rotation={[0, 0, 0.18]}>
        <boxGeometry args={[0.12, y + 0.3, 0.12]} />
        <meshStandardMaterial color={FORK_COLOR} roughness={0.85} />
      </mesh>
      <mesh position={[0.18, y * 0.5, 0]} rotation={[0, 0, -0.18]}>
        <boxGeometry args={[0.12, y + 0.3, 0.12]} />
        <meshStandardMaterial color={FORK_COLOR} roughness={0.85} />
      </mesh>
    </group>
  );
}

function GroundDressing() {
  const [anchorX, , anchorZ] = SLING_ANCHOR;
  return (
    <>
      <mesh position={[anchorX, PLATFORM_THICKNESS / 2, anchorZ]} receiveShadow>
        <boxGeometry args={[SLING_PLATFORM_SIZE[0], PLATFORM_THICKNESS, SLING_PLATFORM_SIZE[1]]} />
        <meshStandardMaterial color={FORK_COLOR} roughness={0.85} />
      </mesh>
      <mesh position={[SIEGE_ZONE_CENTER_X, PLATFORM_THICKNESS / 2, 0]} receiveShadow>
        <boxGeometry args={[SIEGE_ZONE_HALF[0] * 2, PLATFORM_THICKNESS, SIEGE_ZONE_HALF[1] * 2]} />
        <meshStandardMaterial color={PACKED_EARTH_COLOR} roughness={0.95} />
      </mesh>
    </>
  );
}

function TrajectoryPreview({ points }: { points: readonly (readonly [number, number, number])[] }) {
  const dots = points.filter((_, index) => index % 4 === 0);
  return (
    <>
      {dots.map((point, index) => (
        <mesh key={index} position={[point[0], point[1], point[2]]}>
          <sphereGeometry args={[0.06, 6, 6]} />
          <meshBasicMaterial color="#f3e6cf" transparent opacity={0.65} />
        </mesh>
      ))}
    </>
  );
}

function AimCatcher() {
  const store = useSlingshotStore();
  const draggingRef = useRef(false);

  const onPointerDown = (event: ThreeEvent<PointerEvent>): void => {
    event.stopPropagation();
    store.beginAim([event.point.x, event.point.y, event.point.z]);
    draggingRef.current = store.getState().phase === "dragging";
  };

  const onPointerMove = (event: ThreeEvent<PointerEvent>): void => {
    if (!draggingRef.current) return;
    store.updateAim([event.point.x, event.point.y, event.point.z]);
  };

  const onPointerRelease = (): void => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    store.releaseAim();
  };

  return (
    <mesh
      position={[GROUND_CENTER[0], 6, GROUND_CENTER[2]]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerRelease}
      onPointerLeave={onPointerRelease}
    >
      <planeGeometry args={[GROUND_HALF[0] * 2, 24]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export function SlingshotOverlay() {
  const store = useSlingshotStore();
  const state = useSlingshotState();
  const baseColors = useMemo(
    () => buildBaseColors(store.bodyMeta, store.world.capacity),
    [store, state.epoch],
  );
  const anchor = new THREE.Vector3(...SLING_ANCHOR);
  const pouch = state.dragPoint !== null ? new THREE.Vector3(...state.dragPoint) : anchor;
  const forkLeft = new THREE.Vector3(SLING_ANCHOR[0] - 0.18, SLING_ANCHOR[1] + 0.3, SLING_ANCHOR[2]);
  const forkRight = new THREE.Vector3(SLING_ANCHOR[0] + 0.18, SLING_ANCHOR[1] + 0.3, SLING_ANCHOR[2]);

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[12, 20, 10]} intensity={1.1} />
      <GroundDressing />
      <InstancedBodies world={store.world} baseColors={baseColors} epoch={state.epoch} />
      <SlingshotFork />
      {state.phase === "dragging" && (
        <>
          <Band from={forkLeft} to={pouch} />
          <Band from={forkRight} to={pouch} />
          <mesh position={pouch}>
            <sphereGeometry args={[0.18, 10, 10]} />
            <meshStandardMaterial color={POUCH_COLOR} roughness={0.9} />
          </mesh>
          <TrajectoryPreview points={state.trajectory} />
        </>
      )}
      {state.phase === "aiming" && (
        <mesh position={anchor}>
          <sphereGeometry args={[0.18, 10, 10]} />
          <meshStandardMaterial color={POUCH_COLOR} roughness={0.9} />
        </mesh>
      )}
      <AimCatcher />
    </>
  );
}
