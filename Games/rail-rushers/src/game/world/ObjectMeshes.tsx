import type { SceneObject } from "@jgengine/core/scene/objectStore";

import {
  JUNCTION_STAND_OBJECT,
  PROP_BOULDER,
  PROP_FENCE,
  PROP_MARKER,
  PROP_PINE,
  PROP_SIGNAL,
  STATION_HOUSE_OBJECT,
} from "../objects/catalog";

const POSTER_CREAM = "#f2e8cf";
const POSTER_GREEN = "#386641";
const POSTER_RED = "#bc4749";
const POSTER_BRASS = "#a98467";
const POSTER_COAL = "#6b705c";

function JunctionStandMesh({ lanternColor }: { lanternColor: string }) {
  return (
    <group>
      <mesh position-y={0.6} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 1.2, 8]} />
        <meshStandardMaterial color={POSTER_COAL} roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh position-y={1.25} rotation={[0, 0, Math.PI / 5]} castShadow>
        <boxGeometry args={[0.5, 0.06, 0.06]} />
        <meshStandardMaterial color={POSTER_BRASS} roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0.22, 1.42, 0]}>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshStandardMaterial color={lanternColor} emissive={lanternColor} emissiveIntensity={1.6} />
      </mesh>
    </group>
  );
}

function StationHouseMesh() {
  return (
    <group>
      <mesh position-y={1.1} castShadow>
        <boxGeometry args={[4.2, 2.2, 3.2]} />
        <meshStandardMaterial color={POSTER_CREAM} roughness={0.85} />
      </mesh>
      <mesh position={[0, 2.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[3.1, 1.4, 4]} />
        <meshStandardMaterial color={POSTER_GREEN} roughness={0.8} />
      </mesh>
      <mesh position={[1.8, 3.1, 0]}>
        <boxGeometry args={[0.3, 0.9, 0.3]} />
        <meshStandardMaterial color={POSTER_COAL} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.9, 1.61]}>
        <boxGeometry args={[0.9, 1.6, 0.06]} />
        <meshStandardMaterial color={POSTER_BRASS} roughness={0.6} />
      </mesh>
    </group>
  );
}

function PineMesh() {
  return (
    <group>
      <mesh position-y={0.35} castShadow>
        <cylinderGeometry args={[0.09, 0.12, 0.7, 6]} />
        <meshStandardMaterial color="#5a4632" roughness={0.9} />
      </mesh>
      <mesh position-y={1.15} castShadow>
        <coneGeometry args={[0.7, 1.4, 8]} />
        <meshStandardMaterial color={POSTER_GREEN} roughness={0.85} />
      </mesh>
      <mesh position-y={1.85} castShadow>
        <coneGeometry args={[0.5, 1, 8]} />
        <meshStandardMaterial color="#4d7a4a" roughness={0.85} />
      </mesh>
    </group>
  );
}

function BoulderMesh() {
  return (
    <mesh position-y={0.35} rotation={[0.3, 0.6, 0.1]} castShadow>
      <dodecahedronGeometry args={[0.55, 0]} />
      <meshStandardMaterial color={POSTER_COAL} roughness={0.95} flatShading />
    </mesh>
  );
}

function SignalPostMesh() {
  return (
    <group>
      <mesh position-y={0.8} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 1.6, 8]} />
        <meshStandardMaterial color={POSTER_COAL} roughness={0.8} />
      </mesh>
      <mesh position-y={1.55} castShadow>
        <boxGeometry args={[0.35, 0.5, 0.08]} />
        <meshStandardMaterial color={POSTER_RED} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.55, 0.05]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color={POSTER_CREAM} emissive={POSTER_CREAM} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

function MileMarkerMesh() {
  return (
    <mesh position-y={0.4} castShadow>
      <boxGeometry args={[0.28, 0.8, 0.16]} />
      <meshStandardMaterial color={POSTER_CREAM} roughness={0.8} />
    </mesh>
  );
}

function FenceMesh() {
  return (
    <group>
      <mesh position={[-0.5, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.05, 0.7, 6]} />
        <meshStandardMaterial color={POSTER_BRASS} roughness={0.75} />
      </mesh>
      <mesh position={[0.5, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.05, 0.7, 6]} />
        <meshStandardMaterial color={POSTER_BRASS} roughness={0.75} />
      </mesh>
      <mesh position-y={0.55} castShadow>
        <boxGeometry args={[1.15, 0.06, 0.06]} />
        <meshStandardMaterial color={POSTER_BRASS} roughness={0.75} />
      </mesh>
    </group>
  );
}

export function renderTracksideObject(object: SceneObject) {
  switch (object.catalogId) {
    case JUNCTION_STAND_OBJECT:
      return <JunctionStandMesh lanternColor={object.visual?.color ?? POSTER_GREEN} />;
    case STATION_HOUSE_OBJECT:
      return <StationHouseMesh />;
    case PROP_PINE:
      return <PineMesh />;
    case PROP_BOULDER:
      return <BoulderMesh />;
    case PROP_SIGNAL:
      return <SignalPostMesh />;
    case PROP_MARKER:
      return <MileMarkerMesh />;
    case PROP_FENCE:
      return <FenceMesh />;
    default:
      return null;
  }
}
