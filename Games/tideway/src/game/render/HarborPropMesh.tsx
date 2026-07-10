import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { BUOY_OBJECT_IDS, PROP_OBJECT_IDS } from "../world/catalogIds";

const PALETTE = {
  deepWater: "#14505c",
  foam: "#e6f2ef",
  hullRed: "#c74a34",
  buoyYellow: "#f2c14e",
  ink: "#0e2a30",
};

function BuoyMesh({ tall }: { tall: boolean }) {
  const height = tall ? 1.1 : 0.7;
  return (
    <group>
      <mesh position={[0, height * 0.5, 0]}>
        <cylinderGeometry args={[0.16, 0.2, height, 8]} />
        <meshStandardMaterial color={PALETTE.buoyYellow} roughness={0.6} />
      </mesh>
      <mesh position={[0, height + 0.14, 0]}>
        <sphereGeometry args={[0.18, 10, 8]} />
        <meshStandardMaterial color={PALETTE.hullRed} roughness={0.5} />
      </mesh>
      <mesh position={[0, height + 0.44, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.4, 5]} />
        <meshStandardMaterial color={PALETTE.ink} />
      </mesh>
    </group>
  );
}

function PilingMesh() {
  return (
    <mesh position={[0, 1.1, 0]}>
      <cylinderGeometry args={[0.14, 0.18, 2.2, 8]} />
      <meshStandardMaterial color={PALETTE.ink} roughness={0.9} />
    </mesh>
  );
}

function CrateMesh() {
  return (
    <mesh position={[0, 0.35, 0]}>
      <boxGeometry args={[0.7, 0.7, 0.7]} />
      <meshStandardMaterial color={PALETTE.hullRed} roughness={0.8} />
    </mesh>
  );
}

function LampMesh() {
  return (
    <group>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 2.4, 6]} />
        <meshStandardMaterial color={PALETTE.ink} />
      </mesh>
      <mesh position={[0, 2.5, 0]}>
        <sphereGeometry args={[0.16, 8, 8]} />
        <meshStandardMaterial color={PALETTE.buoyYellow} emissive={PALETTE.buoyYellow} emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

function NetMesh() {
  return (
    <mesh position={[0, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.5, 0.1, 6, 14]} />
      <meshStandardMaterial color={PALETTE.deepWater} roughness={0.9} />
    </mesh>
  );
}

function BarrelMesh() {
  return (
    <mesh position={[0, 0.35, 0]}>
      <cylinderGeometry args={[0.32, 0.32, 0.7, 10]} />
      <meshStandardMaterial color={PALETTE.foam} roughness={0.7} />
    </mesh>
  );
}

export function HarborPropMesh({ object }: { object: SceneObject }) {
  switch (object.catalogId) {
    case BUOY_OBJECT_IDS.gate:
      return <BuoyMesh tall />;
    case BUOY_OBJECT_IDS.channel:
    case BUOY_OBJECT_IDS.shore:
      return <BuoyMesh tall={false} />;
    case PROP_OBJECT_IDS.piling:
      return <PilingMesh />;
    case PROP_OBJECT_IDS.crate:
      return <CrateMesh />;
    case PROP_OBJECT_IDS.lamp:
      return <LampMesh />;
    case PROP_OBJECT_IDS.net:
      return <NetMesh />;
    case PROP_OBJECT_IDS.barrel:
      return <BarrelMesh />;
    default:
      return null;
  }
}
