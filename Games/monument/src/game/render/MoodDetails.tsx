import type { ReactNode } from "react";
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { useGameClock } from "@jgengine/react/hooks";

import { CELL, GRID, type DistrictMood } from "../catalog";
import type { MoodScene } from "./Environment";

const EXTENT = GRID * CELL;

const signTextureCache = new Map<string, THREE.CanvasTexture>();

function glyphTexture(key: string, fg: string, accent: string): THREE.CanvasTexture | undefined {
  if (typeof document === "undefined") return undefined;
  const cached = signTextureCache.get(key);
  if (cached !== undefined) return cached;
  const canvas = document.createElement("canvas");
  const logicalWidth = 768;
  const logicalHeight = 256;
  canvas.width = 384;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return undefined;
  ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
  const seed = [...key].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  ctx.fillStyle = "#02060c";
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);
  ctx.fillStyle = "rgba(255,255,255,.05)";
  for (let x = 0; x < logicalWidth; x += 32) ctx.fillRect(x, 0, 2, logicalHeight);
  for (let y = 0; y < logicalHeight; y += 32) ctx.fillRect(0, y, logicalWidth, 2);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, logicalWidth, 18);
  ctx.fillRect(0, logicalHeight - 18, logicalWidth, 18);
  ctx.shadowColor = fg;
  ctx.shadowBlur = 16;
  for (let i = 0; i < 34; i++) {
    const x = 36 + ((seed + i * 47) % 690);
    const y = 48 + ((seed * 3 + i * 29) % 146);
    const w = 10 + ((seed + i * 17) % 84);
    const h = 6 + ((seed + i * 11) % 28);
    const glyphColor = i % 5 === 0 ? accent : i % 3 === 0 ? "rgba(232,255,247,.78)" : fg;
    ctx.fillStyle = glyphColor;
    ctx.globalAlpha = 0.26 + (i % 7) * 0.08;
    if (i % 4 === 0) {
      ctx.fillRect(x, y, w, 3);
      ctx.fillRect(x + w - 3, y, 3, h);
    } else if (i % 4 === 1) {
      ctx.strokeStyle = glyphColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
    } else {
      ctx.fillRect(x, y, w, h);
    }
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const x = 44 + i * 78 + ((seed + i * 13) % 22);
    const y = logicalHeight - 42;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 22, y);
    ctx.lineTo(x + 34, y - 12);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 1;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  signTextureCache.set(key, texture);
  return texture;
}

function GlyphSign({ label, fg, accent, width, height, position, opacity }: { label: string; fg: string; accent: string; width: number; height: number; position: [number, number, number]; opacity: number }): ReactNode {
  const texture = useMemo(() => glyphTexture(label, fg, accent), [label, fg, accent]);
  return (
    <mesh position={position} raycast={() => null}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} color={texture === undefined ? fg : "#ffffff"} transparent opacity={opacity} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function InstancedTrees({ points }: { points: [number, number][] }): ReactNode {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const canopies = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const trunkMesh = trunks.current;
    const canopyMesh = canopies.current;
    if (trunkMesh === null || canopyMesh === null || points.length === 0) return;
    const dummy = new THREE.Object3D();
    points.forEach(([x, z], i) => {
      dummy.rotation.set(0, (x * 0.7 + z) * 0.11, 0);
      dummy.position.set(x, 2.2, z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 4.8, z);
      dummy.updateMatrix();
      canopyMesh.setMatrixAt(i, dummy.matrix);
    });
    trunkMesh.instanceMatrix.needsUpdate = true;
    canopyMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.computeBoundingSphere();
    canopyMesh.computeBoundingSphere();
  }, [points]);
  if (points.length === 0) return null;
  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, points.length]} castShadow>
        <cylinderGeometry args={[0.16, 0.26, 4.4, 8]} />
        <meshStandardMaterial color="#4a3727" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={canopies} args={[undefined, undefined, points.length]} castShadow>
        <icosahedronGeometry args={[2.25, 1]} />
        <meshStandardMaterial color="#536249" roughness={1} />
      </instancedMesh>
    </group>
  );
}

function Searchlight({ x, z, phase, color }: { x: number; z: number; phase: number; color: string }): ReactNode {
  const beam = useRef<THREE.Group>(null);
  const { controls } = useGameClock();
  useFrame(() => {
    const group = beam.current;
    if (group === null) return;
    group.rotation.y = phase + Math.sin(controls.now() * 0.42 + phase) * 0.72;
  });
  return (
    <group position={[x, 0.45, z]}>
      <mesh position={[0, 10, 0]} castShadow>
        <boxGeometry args={[2.2, 20, 2.2]} />
        <meshStandardMaterial color="#10151a" roughness={0.58} metalness={0.34} />
      </mesh>
      <mesh position={[0, 20.9, 0]}>
        <boxGeometry args={[5.8, 1.6, 3.2]} />
        <meshStandardMaterial color="#182029" emissive={color} emissiveIntensity={0.22} roughness={0.4} />
      </mesh>
      <group ref={beam} position={[0, 20.8, 0]}>
        <mesh position={[38, 5, 0]} rotation={[0, 0, Math.PI / 2 - 0.14]} raycast={() => null}>
          <coneGeometry args={[6.5, 76, 18, 1, true]} />
          <meshBasicMaterial color={color} transparent opacity={0.15} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    </group>
  );
}

const CyberDetails = memo(function CyberDetails({ scene, night }: { scene: MoodScene; night: boolean }): ReactNode {
  const signs = useMemo<{ x: number; z: number; rot: number }[]>(() => {
    const list: { x: number; z: number; rot: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const x = -132 + ((i * 71) % 268);
      const z = -120 + ((i * 47) % 240);
      list.push({ x, z, rot: i % 2 === 0 ? 0 : Math.PI / 2 });
    }
    return list;
  }, []);
  return (
    <group>
      {signs.map((sign, i) => {
        const fg = i % 2 === 0 ? scene.window : scene.accent;
        return (
          <group key={`neon-${i}`} position={[sign.x, 0.5, sign.z]} rotation={[0, sign.rot, 0]}>
            <mesh position={[0, 4.6, 0]} castShadow>
              <boxGeometry args={[0.42, 9.2, 0.42]} />
              <meshStandardMaterial color="#17252a" metalness={0.5} roughness={0.48} />
            </mesh>
            <mesh position={[0, 8.9, 0]}>
              <boxGeometry args={[4, 0.34, 0.28]} />
              <meshStandardMaterial color="#0a1115" emissive={fg} emissiveIntensity={night ? 0.9 : 0.08} />
            </mesh>
            <GlyphSign label={`neon-${i}`} fg={fg} accent="#ff386c" width={3.8} height={2.5} position={[0, 8.9, 0.3]} opacity={night ? 1 : 0.7} />
          </group>
        );
      })}
    </group>
  );
});

const TotalitarianDetails = memo(function TotalitarianDetails({ scene, night }: { scene: MoodScene; night: boolean }): ReactNode {
  const banners = useMemo<[number, number][]>(() => [
    [-24, -96],
    [24, -32],
    [-24, 32],
    [24, 96],
  ], []);
  return (
    <group>
      <mesh position={[0, 0.2, 0]} raycast={() => null}>
        <boxGeometry args={[4.4, 0.1, EXTENT * 0.9]} />
        <meshBasicMaterial color={scene.accent} transparent opacity={night ? 0.58 : 0.28} />
      </mesh>
      <mesh position={[0, 0.21, 0]} raycast={() => null}>
        <boxGeometry args={[EXTENT * 0.9, 0.1, 4.4]} />
        <meshBasicMaterial color={scene.accent} transparent opacity={night ? 0.48 : 0.2} />
      </mesh>
      {banners.map(([x, z], i) => (
        <group key={`banner-${i}`} position={[x, 0, z]}>
          <mesh position={[0, 5, 0]} castShadow>
            <cylinderGeometry args={[0.14, 0.18, 10, 6]} />
            <meshStandardMaterial color="#1b1d1d" metalness={0.6} roughness={0.5} />
          </mesh>
          <mesh position={[0.95, 6.4, 0]}>
            <boxGeometry args={[1.9, 5.2, 0.12]} />
            <meshStandardMaterial color={scene.accent} emissive={scene.accent} emissiveIntensity={night ? 0.4 : 0.08} roughness={0.7} />
          </mesh>
        </group>
      ))}
      {[
        [-146, -146],
        [146, 146],
        [-146, 146],
      ].map(([x, z], i) => (
        <Searchlight key={`search-${i}`} x={x} z={z} phase={i * 1.7} color={scene.lamp} />
      ))}
    </group>
  );
});

const GreenDetails = memo(function GreenDetails({ night }: { night: boolean }): ReactNode {
  const trees = useMemo<[number, number][]>(() => {
    const list: [number, number][] = [];
    for (let i = 0; i < 7; i++) {
      const t = -120 + i * 40;
      list.push([-24, t], [24, t]);
    }
    return list;
  }, []);
  return (
    <group>
      {[-18, 18].map((x, i) => (
        <group key={`median-${i}`}>
          <mesh position={[x, 0.11, 0]} raycast={() => null}>
            <boxGeometry args={[2.2, 0.18, EXTENT * 0.82]} />
            <meshStandardMaterial color="#4e744f" emissive="#7fe083" emissiveIntensity={night ? 0.32 : 0.03} roughness={1} />
          </mesh>
          <mesh position={[0, 0.12, x]} raycast={() => null}>
            <boxGeometry args={[EXTENT * 0.82, 0.18, 2.2]} />
            <meshStandardMaterial color="#4e744f" emissive="#7fe083" emissiveIntensity={night ? 0.32 : 0.03} roughness={1} />
          </mesh>
        </group>
      ))}
      <InstancedTrees points={trees} />
    </group>
  );
});

const UniversityDetails = memo(function UniversityDetails({ scene, night }: { scene: MoodScene; night: boolean }): ReactNode {
  const lamps = useMemo<[number, number][]>(() => [
    [-84, -84],
    [84, -84],
    [-84, 84],
    [84, 84],
  ], []);
  const signs = useMemo<[number, number][]>(() => [
    [0, -108],
    [-60, 60],
    [60, 0],
  ], []);
  return (
    <group>
      {lamps.map(([x, z], i) => (
        <group key={`campus-lamp-${i}`} position={[x, 0.45, z]}>
          <mesh position={[0, 4.6, 0]} castShadow>
            <boxGeometry args={[0.38, 8.4, 0.38]} />
            <meshStandardMaterial color="#29323c" roughness={0.6} />
          </mesh>
          <mesh position={[0, 8.9, 0]}>
            <boxGeometry args={[2.6, 0.28, 1.1]} />
            <meshStandardMaterial color={i % 2 === 0 ? scene.windowAlt : scene.accent} emissive={i % 2 === 0 ? scene.windowAlt : scene.accent} emissiveIntensity={night ? 1.2 : 0.18} />
          </mesh>
        </group>
      ))}
      {signs.map(([x, z], i) => (
        <group key={`campus-sign-${i}`} position={[x, 0, z]}>
          <mesh position={[0, 2.4, 0]} castShadow>
            <boxGeometry args={[0.16, 4.8, 0.16]} />
            <meshStandardMaterial color="#3a4149" roughness={0.7} />
          </mesh>
          <mesh position={[0, 4.7, 0]}>
            <boxGeometry args={[3.4, 1.7, 0.14]} />
            <meshStandardMaterial color={scene.windowAlt} emissive={scene.windowAlt} emissiveIntensity={night ? 0.55 : 0.1} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

export function MoodDetails({ mood, scene, night }: { mood: DistrictMood; scene: MoodScene; night: boolean }): ReactNode {
  if (mood === "cyberpunk") return <CyberDetails scene={scene} night={night} />;
  if (mood === "totalitarian") return <TotalitarianDetails scene={scene} night={night} />;
  if (mood === "green") return <GreenDetails night={night} />;
  if (mood === "university") return <UniversityDetails scene={scene} night={night} />;
  return null;
}
