import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useStore } from "@jgengine/react/store";
import { creatureById } from "../entities/creatures/catalog";
import { runStore } from "../session/store";

export function CreatureMesh({ entity }: { entity: SceneEntity }): React.ReactNode {
  const def = creatureById(entity.name);
  const run = useStore(runStore);
  const straggler = run.creatures[entity.id]?.straggler ?? false;
  const coreRef = useRef<Mesh>(null);
  const seed = entity.id.length;

  useFrame(({ clock }) => {
    if (coreRef.current !== null) {
      const bob = Math.sin(clock.elapsedTime * 2 + seed) * 0.06;
      coreRef.current.position.y = 0.55 + bob;
    }
  });

  if (def === undefined) return null;
  const radius = 0.32 * def.sizeScale;
  const opacity = straggler ? 0.55 : 1;

  return (
    <group>
      <mesh ref={coreRef} position-y={0.55}>
        <icosahedronGeometry args={[radius, 1]} />
        <meshStandardMaterial
          color={def.tint}
          emissive={def.tint}
          emissiveIntensity={def.glowStrength * (straggler ? 0.5 : 1)}
          transparent
          opacity={opacity}
        />
      </mesh>
      <mesh position-y={0.55}>
        <sphereGeometry args={[radius * 2.1, 12, 12]} />
        <meshBasicMaterial color={def.tint} transparent opacity={straggler ? 0.08 : 0.16} />
      </mesh>
    </group>
  );
}
