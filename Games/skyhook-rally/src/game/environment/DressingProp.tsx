import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, type Group } from "three";

import type { DressingProp } from "../world/archipelago";
import { BANNER_TEAL, BRASS, BRASS_DARK, CLOUD_CREAM } from "./palette";

function Windmill() {
  const bladesRef = useRef<Group>(null);
  useFrame((_, dt) => {
    const blades = bladesRef.current;
    if (blades === null) return;
    blades.rotation.z += dt * 1.1;
  });
  return (
    <group>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.75, 2.2, 8]} />
        <meshStandardMaterial color={CLOUD_CREAM} roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.35, 0]}>
        <coneGeometry args={[0.65, 0.7, 8]} />
        <meshStandardMaterial color={BRASS} metalness={0.5} roughness={0.4} />
      </mesh>
      <group ref={bladesRef} position={[0, 2, 0.75]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (Math.PI / 2) * i]} position={[0, 0.9, 0]}>
            <boxGeometry args={[0.16, 1.8, 0.05]} />
            <meshStandardMaterial color={BRASS_DARK} roughness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function MailHut() {
  return (
    <group>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[1.4, 1.2, 1.4]} />
        <meshStandardMaterial color={CLOUD_CREAM} roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[1.15, 0.9, 4]} />
        <meshStandardMaterial color={BRASS} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.5, 0.71]}>
        <boxGeometry args={[0.45, 0.7, 0.04]} />
        <meshStandardMaterial color={BRASS_DARK} roughness={0.6} />
      </mesh>
    </group>
  );
}

function Banner() {
  return (
    <group>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 2.2, 6]} />
        <meshStandardMaterial color={BRASS_DARK} metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0.42, 1.55, 0]}>
        <planeGeometry args={[0.85, 0.5]} />
        <meshStandardMaterial color={BANNER_TEAL} side={DoubleSide} roughness={0.7} />
      </mesh>
    </group>
  );
}

export function DressingPropMesh({ prop }: { prop: DressingProp }) {
  return (
    <group position={[prop.position.x, prop.position.y, prop.position.z]} rotation={[0, prop.rotationY, 0]}>
      {prop.kind === "windmill" ? <Windmill /> : prop.kind === "hut" ? <MailHut /> : <Banner />}
    </group>
  );
}
