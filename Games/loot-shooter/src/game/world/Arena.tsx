import { useMemo } from "react";
import * as THREE from "three";
import { ARENA_COLORS } from "../palette";
import { ARENA_HALF } from "./setup";

function makeFloorTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d")!;
  g.fillStyle = ARENA_COLORS.floor;
  g.fillRect(0, 0, size, size);

  const half = size / 2;
  const tint = (color: string, x: number, y: number) => {
    g.fillStyle = color;
    g.globalAlpha = 0.14;
    g.fillRect(x, y, half, half);
    g.globalAlpha = 1;
  };
  tint("#f5a623", 0, 0);
  tint("#38e1ff", half, 0);
  tint("#8be36b", 0, half);
  tint("#c084fc", half, half);

  const cell = size / 16;
  g.strokeStyle = ARENA_COLORS.floorLine;
  g.lineWidth = 2;
  for (let i = 0; i <= 16; i += 1) {
    g.beginPath();
    g.moveTo(i * cell, 0);
    g.lineTo(i * cell, size);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i * cell);
    g.lineTo(size, i * cell);
    g.stroke();
  }
  g.strokeStyle = "#f5a623";
  g.globalAlpha = 0.35;
  g.lineWidth = 6;
  g.setLineDash([26, 18]);
  g.strokeRect(cell, cell, size - cell * 2, size - cell * 2);
  g.setLineDash([]);
  g.globalAlpha = 1;

  for (let i = 0; i < 420; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 4;
    g.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.18)";
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
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
            <meshStandardMaterial color="#1a222c" roughness={0.7} metalness={0.4} />
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
        <meshStandardMaterial color="#141a22" roughness={0.6} metalness={0.3} />
      </mesh>
    </group>
  );
}

function RefinerySkyline() {
  const z = ARENA_HALF + 9;
  return (
    <group position={[0, 0, z]}>
      {[-14, -4, 7].map((x, index) => (
        <group key={index} position={[x, 0, index === 1 ? 4 : 0]}>
          <mesh position={[0, 4.5, 0]}>
            <cylinderGeometry args={[2.6, 2.8, 9, 12]} />
            <meshStandardMaterial color="#2c333d" roughness={0.8} metalness={0.35} />
          </mesh>
          <mesh position={[0, 9.4, 0]}>
            <cylinderGeometry args={[1.1, 1.1, 1.4, 10]} />
            <meshStandardMaterial color="#232a33" roughness={0.8} metalness={0.35} />
          </mesh>
          <mesh position={[1.8, 2.2, -1.2]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.28, 0.28, 5, 8]} />
            <meshStandardMaterial color="#3d4550" roughness={0.7} metalness={0.4} />
          </mesh>
          <mesh position={[0, 6.5, 2.55]}>
            <boxGeometry args={[1.6, 0.5, 0.12]} />
            <meshStandardMaterial color="#f5a623" emissive="#f5a623" emissiveIntensity={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ScrapSkyline() {
  const base = ARENA_HALF + 8;
  return (
    <group position={[-base, 0, -base * 0.4]}>
      {[
        { x: 0, z: 0, r: 4.5, h: 4 },
        { x: 6, z: -5, r: 3.4, h: 3 },
        { x: -3, z: 7, r: 3.8, h: 3.4 },
      ].map((heap, index) => (
        <mesh key={index} position={[heap.x, heap.h / 2 - 0.4, heap.z]}>
          <coneGeometry args={[heap.r, heap.h, 7]} />
          <meshStandardMaterial color="#463228" roughness={0.95} metalness={0.25} flatShading />
        </mesh>
      ))}
      <group position={[3, 0, 6]}>
        <mesh position={[0, 5, 0]}>
          <boxGeometry args={[0.7, 10, 0.7]} />
          <meshStandardMaterial color="#2a323c" roughness={0.8} metalness={0.4} />
        </mesh>
        <mesh position={[3, 9.6, 0]}>
          <boxGeometry args={[7.5, 0.5, 0.5]} />
          <meshStandardMaterial color="#2a323c" roughness={0.8} metalness={0.4} />
        </mesh>
        <mesh position={[6, 8.2, 0]}>
          <boxGeometry args={[0.12, 2.4, 0.12]} />
          <meshStandardMaterial color="#1c232b" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

function ContainmentSkyline() {
  const base = ARENA_HALF + 8;
  return (
    <group position={[base, 0, -base * 0.4]}>
      {[
        { z: -4, h: 8 },
        { z: 2, h: 11 },
        { z: 8, h: 7 },
      ].map((tower, index) => (
        <group key={index} position={[index * 2.4, 0, tower.z]}>
          <mesh position={[0, tower.h / 2, 0]}>
            <boxGeometry args={[3, tower.h, 3]} />
            <meshStandardMaterial color="#242c38" roughness={0.75} metalness={0.35} />
          </mesh>
          <mesh position={[0, tower.h / 2, -1.52]}>
            <boxGeometry args={[0.4, tower.h * 0.72, 0.08]} />
            <meshStandardMaterial color="#38e1ff" emissive="#38e1ff" emissiveIntensity={1.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function StarField() {
  const positions = useMemo(() => {
    const points = new Float32Array(220 * 3);
    let seed = 99;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 220; i += 1) {
      const angle = rand() * Math.PI * 2;
      const radius = 120 + rand() * 60;
      points[i * 3] = Math.cos(angle) * radius;
      points[i * 3 + 1] = 18 + rand() * 70;
      points[i * 3 + 2] = Math.sin(angle) * radius;
    }
    return points;
  }, []);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#9db8d8" size={0.7} sizeAttenuation={false} transparent opacity={0.7} />
    </points>
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[span * 4, span * 4]} />
        <meshStandardMaterial color="#0d1119" roughness={1} metalness={0} />
      </mesh>
      <Walls />
      <CornerPylons />
      <CenterPad />
      <RefinerySkyline />
      <ScrapSkyline />
      <ContainmentSkyline />
      <StarField />
    </group>
  );
}
