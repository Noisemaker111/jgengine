import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";

import { HEROES } from "./entities/players/catalog";
import { ROOMS, roomBounds } from "./rooms/catalog";
import { DIR_VECTORS } from "./types";
import { currentRoomState } from "./rooms/setup";
import { duetStore } from "./stores";

const VOID_COLOR = "#080b18";
const GRID_COLOR = "#3a4d82";

function gridGeometry(minX: number, maxX: number, minZ: number, maxZ: number): THREE.BufferGeometry {
  const points: number[] = [];
  for (let x = minX; x <= maxX + 1; x++) points.push(x - 0.5, 0, minZ - 0.5, x - 0.5, 0, maxZ + 0.5);
  for (let z = minZ; z <= maxZ + 1; z++) points.push(minX - 0.5, 0, z - 0.5, maxX + 0.5, 0, z - 0.5);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

export function DuetEnvironment() {
  const roomIndex = useStore(duetStore, (s) => s.roomIndex);
  const room = ROOMS[roomIndex] ?? ROOMS[0]!;
  const bounds = roomBounds(room);
  const grid = useMemo(
    () => gridGeometry(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ),
    [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ],
  );
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.4} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={VOID_COLOR} roughness={1} metalness={0} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[bounds.centerX, -0.02, bounds.centerZ]}
        receiveShadow
      >
        <planeGeometry args={[bounds.width + 0.4, bounds.depth + 0.4]} />
        <meshStandardMaterial color="#1b2440" roughness={0.85} metalness={0.05} />
      </mesh>
      <lineSegments geometry={grid} position-y={0.012}>
        <lineBasicMaterial color={GRID_COLOR} transparent opacity={0.6} />
      </lineSegments>
    </group>
  );
}

/** Dynamic devices the heroes latch: Lumen's prism + beam, Anchor's weight. */
export function DuetVfx() {
  const ctx = useGameContext();
  const beamRef = useRef<THREE.Mesh>(null);
  const prismRef = useRef<THREE.Mesh>(null);
  const anchorRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const store = duetStore.peek(ctx);
    const room = store === undefined ? undefined : ROOMS[store.roomIndex];
    const latch = store?.latch ?? { anchorCell: null, prism: null };

    const anchor = anchorRef.current;
    if (anchor !== null) {
      anchor.visible = latch.anchorCell !== null;
      if (latch.anchorCell !== null) anchor.position.set(latch.anchorCell.x, 0.42, latch.anchorCell.z);
    }

    const prismMesh = prismRef.current;
    const beam = beamRef.current;
    if (latch.prism === null || room === undefined) {
      if (prismMesh !== null) prismMesh.visible = false;
      if (beam !== null) beam.visible = false;
      return;
    }
    const state = currentRoomState(ctx, room);
    const dir = DIR_VECTORS[latch.prism.dir];
    const start = latch.prism.cell;
    const end = state.beamPath.length > 0 ? state.beamPath[state.beamPath.length - 1]! : start;
    const length = Math.abs(end.x - start.x) + Math.abs(end.z - start.z);

    if (prismMesh !== null) {
      prismMesh.visible = true;
      prismMesh.position.set(start.x, 0.5, start.z);
    }
    if (beam !== null) {
      beam.visible = length > 0;
      if (length > 0) {
        beam.position.set((start.x + end.x) / 2 + dir.x * 0.5, 0.5, (start.z + end.z) / 2 + dir.z * 0.5);
        beam.scale.set(dir.x !== 0 ? length + 1 : 0.14, 0.14, dir.z !== 0 ? length + 1 : 0.14);
      }
    }
  });

  return (
    <group>
      <mesh ref={beamRef} visible={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={HEROES.lumen.color}
          emissive={HEROES.lumen.glow}
          emissiveIntensity={1.4}
          transparent
          opacity={0.8}
        />
      </mesh>
      <mesh ref={prismRef} visible={false} rotation-y={Math.PI / 4} castShadow>
        <octahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color={HEROES.lumen.glow} emissive={HEROES.lumen.color} emissiveIntensity={0.9} />
      </mesh>
      <mesh ref={anchorRef} visible={false} castShadow>
        <cylinderGeometry args={[0.34, 0.42, 0.7, 6]} />
        <meshStandardMaterial color="#4a3a20" metalness={0.4} roughness={0.6} />
      </mesh>
    </group>
  );
}

function HeroMesh({ entity }: { entity: SceneEntity }) {
  const active = useStore(duetStore, (state) => state.active);
  const hero = entity.name === "anchor" ? HEROES.anchor : HEROES.lumen;
  const isActive = active === hero.id;
  return (
    <group>
      {hero.id === "lumen" ? (
        <mesh position-y={0.6} castShadow>
          <cylinderGeometry args={[0.32, 0.34, 1.2, 16]} />
          <meshStandardMaterial color={hero.color} emissive={hero.glow} emissiveIntensity={isActive ? 0.85 : 0.3} />
        </mesh>
      ) : (
        <mesh position-y={0.5} castShadow>
          <boxGeometry args={[0.7, 1, 0.7]} />
          <meshStandardMaterial color={hero.color} emissive={hero.glow} emissiveIntensity={isActive ? 0.7 : 0.25} />
        </mesh>
      )}
      <mesh rotation-x={-Math.PI / 2} position-y={0.05}>
        <ringGeometry args={[0.5, 0.62, 24]} />
        <meshBasicMaterial
          color={hero.glow}
          transparent
          opacity={isActive ? 0.95 : 0.25}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

export function renderHero(entity: SceneEntity) {
  if (entity.name !== "lumen" && entity.name !== "anchor") return null;
  return <HeroMesh entity={entity} />;
}
