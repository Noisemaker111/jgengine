import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { useGameContext } from "@jgengine/react/provider";
import type { Group, Mesh } from "three";

import { ROTOR_ANGULAR_SPEED, rotorBladeCount, rotorRadius } from "../../items/weapons/catalog";
import { getRunState } from "../../run/state";

const MAX_BOLTS = 10;
const MAX_PULSES = 6;
const MAX_BLADES = 6;

function hideMesh(mesh: Mesh | null): void {
  if (mesh !== null) mesh.visible = false;
}

export function CombatOverlay() {
  const ctx = useGameContext();
  const boltRefs = useRef<(Mesh | null)[]>(new Array(MAX_BOLTS).fill(null));
  const pulseRefs = useRef<(Mesh | null)[]>(new Array(MAX_PULSES).fill(null));
  const bladeGroupRef = useRef<Group>(null);
  const bladeRefs = useRef<(Mesh | null)[]>(new Array(MAX_BLADES).fill(null));

  useFrame(() => {
    const run = getRunState(ctx);
    const now = ctx.time.now();

    for (let i = 0; i < MAX_BOLTS; i += 1) {
      const mesh = boltRefs.current[i];
      const bolt = run.bolts[i];
      if (mesh === null) continue;
      if (bolt === undefined) {
        hideMesh(mesh);
        continue;
      }
      const t = Math.min(1, Math.max(0, (now - bolt.firedAt) / bolt.travelSeconds));
      mesh.visible = true;
      mesh.position.set(
        bolt.origin[0] + (bolt.target[0] - bolt.origin[0]) * t,
        bolt.origin[1] + 0.9,
        bolt.origin[2] + (bolt.target[2] - bolt.origin[2]) * t,
      );
    }

    for (let i = 0; i < MAX_PULSES; i += 1) {
      const mesh = pulseRefs.current[i];
      const pulse = run.pulses[i];
      if (mesh === null) continue;
      if (pulse === undefined) {
        hideMesh(mesh);
        continue;
      }
      const t = Math.min(1, Math.max(0, (now - pulse.firedAt) / pulse.durationSeconds));
      const radius = Math.max(0.01, pulse.maxRadius * t);
      mesh.visible = true;
      mesh.position.set(pulse.at[0], pulse.at[1] + 0.05, pulse.at[2]);
      mesh.scale.set(radius, radius, radius);
      const material = mesh.material as { opacity: number } | { opacity: number }[];
      if (!Array.isArray(material)) material.opacity = 0.55 * (1 - t);
    }

    const player = ctx.scene.entity.get(ctx.player.userId);
    if (player !== null && run.outcome === "playing") {
      const level = run.weapons.rotorBlades.level;
      const blades = rotorBladeCount(level);
      const radius = rotorRadius(level);
      const angle = now * ROTOR_ANGULAR_SPEED;
      if (bladeGroupRef.current !== null) bladeGroupRef.current.visible = true;
      for (let i = 0; i < MAX_BLADES; i += 1) {
        const mesh = bladeRefs.current[i];
        if (mesh === null) continue;
        if (i >= blades) {
          hideMesh(mesh);
          continue;
        }
        const theta = angle + (i * Math.PI * 2) / blades;
        mesh.visible = true;
        mesh.position.set(
          player.position[0] + Math.cos(theta) * radius,
          player.position[1] + 0.55,
          player.position[2] + Math.sin(theta) * radius,
        );
      }
    } else if (bladeGroupRef.current !== null) {
      bladeGroupRef.current.visible = false;
    }
  });

  return (
    <group>
      {Array.from({ length: MAX_BOLTS }, (_, i) => (
        <mesh key={`bolt-${i}`} ref={(mesh) => { boltRefs.current[i] = mesh; }} visible={false}>
          <sphereGeometry args={[0.16, 8, 8]} />
          <meshStandardMaterial color="#8be9f0" emissive="#2fb7c4" emissiveIntensity={1.6} />
        </mesh>
      ))}
      {Array.from({ length: MAX_PULSES }, (_, i) => (
        <mesh key={`pulse-${i}`} ref={(mesh) => { pulseRefs.current[i] = mesh; }} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <ringGeometry args={[0.85, 1, 48]} />
          <meshBasicMaterial color="#a566d9" transparent opacity={0.5} />
        </mesh>
      ))}
      <group ref={bladeGroupRef}>
        {Array.from({ length: MAX_BLADES }, (_, i) => (
          <mesh key={`blade-${i}`} ref={(mesh) => { bladeRefs.current[i] = mesh; }} visible={false}>
            <boxGeometry args={[0.32, 0.08, 0.14]} />
            <meshStandardMaterial color="#dfe9ea" emissive="#2fb7c4" emissiveIntensity={0.8} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
