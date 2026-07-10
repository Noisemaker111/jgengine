import type { CloudPuff } from "../world/archipelago";
import { CLOUD_CREAM } from "./palette";

const OFFSETS: readonly [number, number, number][] = [
  [0, 0, 0],
  [0.7, 0.12, 0.3],
  [-0.6, 0.05, -0.35],
  [0.15, -0.1, 0.55],
];

export function CloudPuffMesh({ cloud }: { cloud: CloudPuff }) {
  return (
    <group position={[cloud.position.x, cloud.position.y, cloud.position.z]}>
      {OFFSETS.map((offset, i) => (
        <mesh key={i} position={[offset[0] * cloud.scale * 0.5, offset[1] * cloud.scale * 0.5, offset[2] * cloud.scale * 0.5]}>
          <sphereGeometry args={[cloud.scale * (0.4 + i * 0.03), 10, 8]} />
          <meshStandardMaterial color={CLOUD_CREAM} transparent opacity={0.82} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
