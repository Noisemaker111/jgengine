import { DoubleSide } from "three";
import { WORLD_BOUNDS, worldZ } from "../../world";
import { frontProgressAt } from "../course/storm";
import { useRunState } from "../ui/hooks";

export function StormWallOverlay() {
  const run = useRunState();
  const front = frontProgressAt(run.status === "ready" ? 0 : run.now);
  const z = worldZ(front);

  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, 42, 0]}>
        <planeGeometry args={[WORLD_BOUNDS.w * 1.5, 96]} />
        <meshBasicMaterial color="#3d4a5c" transparent opacity={0.5} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 42, 1]}>
        <planeGeometry args={[WORLD_BOUNDS.w * 1.5, 96]} />
        <meshBasicMaterial color="#f25c05" transparent opacity={0.16} side={DoubleSide} />
      </mesh>
    </group>
  );
}
