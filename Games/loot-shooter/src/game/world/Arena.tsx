import { useMemo } from "react";
import * as THREE from "three";
import { ARENA_COLORS } from "../palette";
import { ARENA_HALF } from "./setup";

function makeFloorTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d")!;
  g.fillStyle = ARENA_COLORS.floor;
  g.fillRect(0, 0, size, size);
  const cell = size / 8;
  g.strokeStyle = ARENA_COLORS.floorLine;
  g.lineWidth = 2;
  for (let i = 0; i <= 8; i += 1) {
    g.beginPath();
    g.moveTo(i * cell, 0);
    g.lineTo(i * cell, size);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i * cell);
    g.lineTo(size, i * cell);
    g.stroke();
  }
  for (let i = 0; i < 260; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 3;
    g.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.16)";
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10);
  return texture;
}

function Walls() {
  const half = ARENA_HALF;
  const length = half * 2 + 2;
  const sides: readonly { position: [number, number, number]; rotation: number }[] = [
    { position: [0, 1.5, half + 1], rotation: 0 },
    { position: [0, 1.5, -half - 1], rotation: 0 },
    { position: [half + 1, 1.5, 0], rotation: Math.PI / 2 },
    { position: [-half - 1, 1.5, 0], rotation: Math.PI / 2 },
  ];
  return (
    <group>
      {sides.map((side, index) => (
        <group key={index} position={side.position} rotation={[0, side.rotation, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[length, 3, 2]} />
            <meshStandardMaterial color={ARENA_COLORS.wall} roughness={0.85} metalness={0.2} />
          </mesh>
          <mesh position={[0, 1.6, 0]}>
            <boxGeometry args={[length, 0.18, 2.1]} />
            <meshStandardMaterial
              color={ARENA_COLORS.wallTrim}
              emissive={ARENA_COLORS.wallTrim}
              emissiveIntensity={0.9}
              roughness={0.4}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CornerPylons() {
  const offset = ARENA_HALF - 2.5;
  const corners: readonly [number, number][] = [
    [offset, offset],
    [-offset, offset],
    [offset, -offset],
    [-offset, -offset],
  ];
  return (
    <group>
      {corners.map(([x, z], index) => (
        <group key={index} position={[x, 0, z]}>
          <mesh position={[0, 3, 0]} castShadow>
            <cylinderGeometry args={[0.35, 0.5, 6, 8]} />
            <meshStandardMaterial color="#10161c" roughness={0.7} metalness={0.4} />
          </mesh>
          <mesh position={[0, 5.4, 0]}>
            <cylinderGeometry args={[0.42, 0.42, 0.8, 8]} />
            <meshStandardMaterial
              color={ARENA_COLORS.pylon}
              emissive={ARENA_COLORS.pylon}
              emissiveIntensity={2.2}
            />
          </mesh>
          <pointLight position={[0, 5.6, 0]} color={ARENA_COLORS.pylon} intensity={70} distance={38} decay={1.6} />
        </group>
      ))}
    </group>
  );
}

function CenterPad() {
  return (
    <group position={[0, 0.02, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.6, 3.1, 48]} />
        <meshStandardMaterial
          color={ARENA_COLORS.pylon}
          emissive={ARENA_COLORS.pylon}
          emissiveIntensity={0.8}
          transparent
          opacity={0.85}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.6, 48]} />
        <meshStandardMaterial color="#0d1218" roughness={0.6} metalness={0.3} />
      </mesh>
    </group>
  );
}

export function Arena() {
  const floorTexture = useMemo(() => makeFloorTexture(), []);
  const span = ARENA_HALF * 2 + 4;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[span, span]} />
        <meshStandardMaterial map={floorTexture} roughness={0.92} metalness={0.08} />
      </mesh>
      <Walls />
      <CornerPylons />
      <CenterPad />
    </group>
  );
}
