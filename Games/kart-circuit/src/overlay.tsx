import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { currentCircuit, type Circuit } from "./track";

function Gate({ checkpoint, isStart }: { checkpoint: Circuit["checkpoints"][number]; isStart: boolean }) {
  const [x, , z] = checkpoint.center;
  const color = isStart ? "#f5c542" : "#3ba0ff";
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 2.6, 0]}>
        <boxGeometry args={[6, 0.3, 0.3]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[-3, 1.3, 0]}>
        <boxGeometry args={[0.3, 2.6, 0.3]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[3, 1.3, 0]}>
        <boxGeometry args={[0.3, 2.6, 0.3]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.3, 0]}>
        <planeGeometry args={[6, 2.6]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Wheels({ circuit }: { circuit: Circuit }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const geometry = useMemo(() => new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#15171c", roughness: 0.8 }), []);
  const count = circuit.car.wheelCount;

  useFrame(() => {
    for (let i = 0; i < count; i += 1) {
      const mesh = refs.current[i];
      const state = circuit.car.wheelState(i);
      if (mesh === null || mesh === undefined || state === null) continue;
      mesh.position.set(state.worldX, state.worldY, state.worldZ);
      mesh.rotation.set(0, circuit.car.heading + state.steerAngle * 0.5, Math.PI / 2);
    }
  });

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          geometry={geometry}
          material={material}
        />
      ))}
    </>
  );
}

export function CircuitOverlay() {
  const circuit = currentCircuit();
  const carRef = useRef<THREE.Group>(null);
  const rivalRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const c = currentCircuit();
    if (c === null) return;
    if (carRef.current !== null) {
      const [x, y, z] = c.car.position;
      carRef.current.position.set(x, y, z);
      carRef.current.rotation.set(0, c.car.heading, 0);
    }
    if (rivalRef.current !== null) {
      rivalRef.current.position.set(c.rival.x, 0.6, c.rival.z);
      rivalRef.current.rotation.set(0, c.rival.heading, 0);
    }
  });

  if (circuit === null) return null;

  return (
    <>
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[140, 120]} />
        <meshStandardMaterial color="#3c424c" roughness={1} />
      </mesh>
      <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[16, 24, 48]} />
        <meshBasicMaterial color="#555c68" side={THREE.DoubleSide} />
      </mesh>

      {circuit.checkpoints.map((cp, i) => (
        <Gate key={cp.id} checkpoint={cp} isStart={i === 0} />
      ))}

      {circuit.obstacles.map((o, i) => (
        <mesh key={i} position={[o.x, o.half[1], o.z]}>
          <boxGeometry args={[o.half[0] * 2, o.half[1] * 2, o.half[2] * 2]} />
          <meshStandardMaterial color="#6b7280" roughness={0.9} />
        </mesh>
      ))}

      <group ref={carRef}>
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[1.8, 0.7, 3.6]} />
          <meshStandardMaterial color="#e4453b" metalness={0.2} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.55, -0.2]}>
          <boxGeometry args={[1.4, 0.5, 1.6]} />
          <meshStandardMaterial color="#1f2733" metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.25, 2.0]}>
          <boxGeometry args={[1.7, 0.25, 0.3]} />
          <meshStandardMaterial color="#111318" />
        </mesh>
      </group>

      <Wheels circuit={circuit} />

      <group ref={rivalRef}>
        <mesh>
          <boxGeometry args={[1.8, 0.8, 3.4]} />
          <meshStandardMaterial color="#3b82f6" metalness={0.2} roughness={0.5} />
        </mesh>
      </group>
    </>
  );
}
