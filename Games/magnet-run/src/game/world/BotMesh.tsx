import { useStore } from "@jgengine/react/store";
import { POLARITY_COLOR } from "../systems/palette";
import { runStore } from "../systems/runState";

export function BotMesh() {
  const run = useStore(runStore);
  const polarity = run.polarity;
  const flashing = run.flipFlashUntil > run.totalElapsed;
  const color = POLARITY_COLOR[polarity];
  return (
    <group>
      <mesh castShadow>
        <capsuleGeometry args={[0.35, 0.55, 4, 10]} />
        <meshStandardMaterial color={color} metalness={0.55} roughness={0.28} emissive={color} emissiveIntensity={flashing ? 0.9 : 0.25} />
      </mesh>
      <mesh position={[0, -0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.4, 0.05, 8, 20]} />
        <meshStandardMaterial color="#dfe6ee" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}
