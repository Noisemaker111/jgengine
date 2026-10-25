import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import type { Group } from "three";
import { RELAY, relayStore } from "../relay";

/** Original salvage antenna: copper coils, ceramic insulators, riveted feet and a split tuning fork. */
export function SalvageRelay() {
  const ctx = useGameContext();
  const state = useStore(relayStore);
  const rotor = useRef<Group>(null);
  const live = state.phase === "defend" || state.phase === "upload";
  const color = state.rewarded ? "#7ef1bf" : live ? "#ffbb55" : "#64dbea";
  useFrame((_, dt) => { if (rotor.current && !ctx.time.isPaused()) rotor.current.rotation.y += dt * (live ? 1.1 : 0.2); });
  const y = ctx.world.groundHeightAt(RELAY.x, RELAY.z);
  return <group position={[RELAY.x, y, RELAY.z]}>
    <mesh receiveShadow position={[0, 0.12, 0]}><cylinderGeometry args={[2.2, 2.5, 0.24, 12]} /><meshStandardMaterial color="#293a40" roughness={0.7} metalness={0.45} /></mesh>
    <mesh position={[0, 0.26, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[2, 2.15, 48]} /><meshBasicMaterial color={color} side={2} /></mesh>
    <mesh castShadow position={[0, 1.45, 0]}><cylinderGeometry args={[0.23, 0.42, 2.6, 8]} /><meshStandardMaterial color="#d49c6c" metalness={0.65} roughness={0.4} /></mesh>
    {[0.6, 1.1, 1.6, 2.1].map((h) => <group key={h} position={[0, h, 0]}>
      <mesh><cylinderGeometry args={[0.53, 0.53, 0.13, 12]} /><meshStandardMaterial color="#f1dec4" roughness={0.55} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.56, 0.065, 8, 32]} /><meshStandardMaterial color="#b96537" roughness={0.32} metalness={0.65} /></mesh>
    </group>)}
    {[0, 1, 2, 3].map((i) => <group key={i} rotation={[0, i * Math.PI / 2, 0]}>
      <mesh castShadow position={[1.1, 0.43, 0]} rotation={[0, 0, -0.22]}><boxGeometry args={[1.8, 0.17, 0.22]} /><meshStandardMaterial color="#b86334" metalness={0.45} roughness={0.7} /></mesh>
      <mesh position={[1.8, 0.3, 0]}><cylinderGeometry args={[0.13, 0.16, 0.3, 6]} /><meshStandardMaterial color="#dfbf76" metalness={0.65} roughness={0.4} /></mesh>
    </group>)}
    <group ref={rotor} position={[0, 2.9, 0]}>
      {[-1, 1].map((side) => <group key={side} position={[side * 0.67, 0, 0]}>
        <mesh castShadow><boxGeometry args={[0.16, 1.9, 0.24]} /><meshStandardMaterial color="#dd9b55" metalness={0.55} roughness={0.38} /></mesh>
        <mesh position={[0, 0.55, 0]}><boxGeometry args={[0.19, 0.55, 0.28]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
      </group>)}
      <mesh position={[0, -0.7, 0]}><boxGeometry args={[1.5, 0.22, 0.25]} /><meshStandardMaterial color="#dd9b55" metalness={0.55} roughness={0.38} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.95, 0.035, 8, 48, Math.PI * 1.7]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} /></mesh>
    </group>
    <group position={[0, 0.95, 1.25]} rotation={[-0.35, 0, 0]}>
      <mesh castShadow><boxGeometry args={[1.2, 0.65, 0.22]} /><meshStandardMaterial color="#28383e" metalness={0.4} roughness={0.7} /></mesh>
      <mesh position={[0, 0, 0.12]}><planeGeometry args={[0.85, 0.34]} /><meshBasicMaterial color={color} /></mesh>
      {[0, 1, 2].map((i) => <mesh key={i} position={[-0.3 + i * 0.3, 0, 0.125]}><planeGeometry args={[0.1, 0.23]} /><meshBasicMaterial color={i < state.wave ? "#132d2e" : "#315760"} /></mesh>)}
    </group>
    {live && <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[RELAY.radius - 0.15, RELAY.radius, 96]} /><meshBasicMaterial color={color} transparent opacity={0.6} side={2} depthWrite={false} /></mesh>}
  </group>;
}
