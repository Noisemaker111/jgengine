import { useFrame } from "@react-three/fiber";
import { useSyncExternalStore, useRef } from "react";
import * as THREE from "three";
import {
  getBoltVisualVersion,
  listBoltVisuals,
  subscribeBoltVisuals,
} from "./pendingProjectiles";

function BoltMesh({ visual }: { visual: ReturnType<typeof listBoltVisuals>[number] }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (ref.current === null) return;
    const progress = Math.min(1, visual.elapsed / visual.duration);
    ref.current.position.set(
      visual.from[0] + (visual.to[0] - visual.from[0]) * progress,
      visual.from[1] + (visual.to[1] - visual.from[1]) * progress + 0.8,
      visual.from[2] + (visual.to[2] - visual.from[2]) * progress,
    );
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.18, 10, 10]} />
      <meshStandardMaterial color={visual.color} emissive={visual.color} emissiveIntensity={1.4} />
    </mesh>
  );
}

export function WowProjectileOverlay() {
  useSyncExternalStore(subscribeBoltVisuals, getBoltVisualVersion, getBoltVisualVersion);
  const visuals = listBoltVisuals();
  return (
    <>
      {visuals.map((visual) => (
        <BoltMesh key={visual.id} visual={visual} />
      ))}
    </>
  );
}