import type { ReactNode } from "react";
import type { SceneObject } from "@jgengine/core/scene/objectStore";

import { buildableDef } from "../objects/catalog";

function Carousel(): ReactNode {
  return (
    <group>
      <mesh position-y={0.15}>
        <cylinderGeometry args={[3.4, 3.6, 0.3, 20]} />
        <meshStandardMaterial color="#d9cdb0" roughness={0.9} />
      </mesh>
      <mesh position-y={1.6}>
        <cylinderGeometry args={[0.22, 0.22, 3, 8]} />
        <meshStandardMaterial color="#f0d24a" metalness={0.4} roughness={0.4} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <group key={i} position={[Math.cos(a) * 2.4, 0.9, Math.sin(a) * 2.4]}>
            <mesh position-y={0.35}>
              <boxGeometry args={[0.5, 0.7, 1.1]} />
              <meshStandardMaterial color={i % 2 === 0 ? "#f06d9a" : "#4fb0e0"} roughness={0.6} />
            </mesh>
            <mesh position-y={1.2}>
              <cylinderGeometry args={[0.05, 0.05, 1.4, 6]} />
              <meshStandardMaterial color="#f0d24a" metalness={0.5} />
            </mesh>
          </group>
        );
      })}
      <mesh position-y={3.3}>
        <coneGeometry args={[3.7, 1.6, 16]} />
        <meshStandardMaterial color="#f06d9a" roughness={0.5} />
      </mesh>
      <mesh position-y={4.2}>
        <sphereGeometry args={[0.3, 10, 8]} />
        <meshStandardMaterial color="#ffd24a" emissive="#ffb020" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function CoasterStation(): ReactNode {
  return (
    <group>
      <mesh position-y={1}>
        <boxGeometry args={[6, 2, 4]} />
        <meshStandardMaterial color="#3f7be0" roughness={0.7} />
      </mesh>
      <mesh position-y={2.3}>
        <boxGeometry args={[6.6, 0.5, 4.6]} />
        <meshStandardMaterial color="#ff5a3c" roughness={0.6} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[-2.4 + i * 1.2, 5, -1.8]}>
          <boxGeometry args={[0.24, 10, 0.24]} />
          <meshStandardMaterial color="#c9ccd6" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 10.2, -1.8]}>
        <boxGeometry args={[5.2, 0.4, 0.6]} />
        <meshStandardMaterial color="#ff5a3c" metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[2, 7, 0.9]} rotation={[0.9, 0, 0]}>
        <boxGeometry args={[5.4, 0.35, 0.8]} />
        <meshStandardMaterial color="#ff5a3c" roughness={0.4} />
      </mesh>
      <mesh position={[-1.6, 10.6, -1.8]}>
        <boxGeometry args={[1.4, 0.7, 1]} />
        <meshStandardMaterial color="#f0c53a" roughness={0.5} />
      </mesh>
      <mesh position={[3.4, 3, 0]}>
        <boxGeometry args={[0.8, 4, 0.8]} />
        <meshStandardMaterial color="#3f7be0" roughness={0.7} />
      </mesh>
    </group>
  );
}

function FerrisWheel(): ReactNode {
  return (
    <group position-y={0.2}>
      <mesh position-y={2} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.5, 4.4, 0.5]} />
        <meshStandardMaterial color="#c9ccd6" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position-y={2} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[0.5, 4.4, 0.5]} />
        <meshStandardMaterial color="#c9ccd6" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position-y={5} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[4.2, 0.18, 8, 32]} />
        <meshStandardMaterial color="#33b1c9" metalness={0.3} roughness={0.4} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <group key={i} position={[Math.cos(a) * 4.2, 5 + Math.sin(a) * 4.2, 0]}>
            <mesh>
              <boxGeometry args={[0.7, 0.7, 0.9]} />
              <meshStandardMaterial color={["#e2483d", "#f0c53a", "#4fb04a", "#3f63d8"][i % 4]} roughness={0.5} />
            </mesh>
          </group>
        );
      })}
      <mesh position-y={5}>
        <sphereGeometry args={[0.4, 10, 8]} />
        <meshStandardMaterial color="#ffe066" emissive="#ffb020" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function DropTower(): ReactNode {
  return (
    <group>
      <mesh position-y={5}>
        <cylinderGeometry args={[0.5, 0.7, 10, 10]} />
        <meshStandardMaterial color="#2a2f3a" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position-y={2}>
        <cylinderGeometry args={[2, 2.4, 0.6, 12]} />
        <meshStandardMaterial color="#e2483d" roughness={0.6} />
      </mesh>
      <mesh position={[1, 3.2, 0]}>
        <boxGeometry args={[1.4, 0.5, 2.4]} />
        <meshStandardMaterial color="#ffd24a" roughness={0.5} />
      </mesh>
      <mesh position-y={10.4}>
        <coneGeometry args={[0.9, 1.4, 8]} />
        <meshStandardMaterial color="#e2483d" emissive="#e2483d" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function Stall({ color, trim }: { color: string; trim: string }): ReactNode {
  return (
    <group>
      <mesh position-y={0.8}>
        <boxGeometry args={[2.6, 1.6, 2]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position-y={1.75}>
        <boxGeometry args={[3, 0.35, 2.4]} />
        <meshStandardMaterial color={trim} roughness={0.5} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[-1.2 + i * 0.6, 2.05, 1.2]}>
          <boxGeometry args={[0.5, 0.4, 0.05]} />
          <meshStandardMaterial color={i % 2 === 0 ? "#ffffff" : color} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 2.5, 0]}>
        <boxGeometry args={[1.3, 0.7, 0.1]} />
        <meshStandardMaterial color="#ffffff" emissive={trim} emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 2.5, 0.08]}>
        <planeGeometry args={[0.9, 0.5]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function TrackPiece(): ReactNode {
  return (
    <group position-y={0.35}>
      <mesh position={[-0.6, 0, 0]}>
        <boxGeometry args={[0.15, 0.15, 3.6]} />
        <meshStandardMaterial color="#ff5a3c" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0.6, 0, 0]}>
        <boxGeometry args={[0.15, 0.15, 3.6]} />
        <meshStandardMaterial color="#ff5a3c" metalness={0.4} roughness={0.4} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[0, -0.12, -1.6 + i * 0.8]}>
          <boxGeometry args={[1.6, 0.12, 0.2]} />
          <meshStandardMaterial color="#8a5a34" roughness={0.8} />
        </mesh>
      ))}
      <mesh position-y={-0.35}>
        <boxGeometry args={[0.2, 0.7, 0.2]} />
        <meshStandardMaterial color="#c9ccd6" metalness={0.3} />
      </mesh>
    </group>
  );
}

function PathTile(): ReactNode {
  return (
    <mesh position-y={0.04} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[3.9, 3.9]} />
      <meshStandardMaterial color="#c8bfa6" roughness={0.95} />
    </mesh>
  );
}

function Tree(): ReactNode {
  return (
    <group>
      <mesh position-y={0.8}>
        <cylinderGeometry args={[0.22, 0.3, 1.6, 6]} />
        <meshStandardMaterial color="#6b4a2a" roughness={0.9} />
      </mesh>
      <mesh position-y={2.1}>
        <sphereGeometry args={[1.2, 10, 8]} />
        <meshStandardMaterial color="#3f8f3a" roughness={0.8} />
      </mesh>
      <mesh position={[0.5, 2.7, 0.3]}>
        <sphereGeometry args={[0.8, 10, 8]} />
        <meshStandardMaterial color="#4fa544" roughness={0.8} />
      </mesh>
    </group>
  );
}

function FlowerBed(): ReactNode {
  return (
    <group>
      <mesh position-y={0.2}>
        <boxGeometry args={[3, 0.4, 3]} />
        <meshStandardMaterial color="#6b4a2a" roughness={0.9} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-1 + (i % 3), 0.55, -1 + Math.floor(i / 3)]}>
          <sphereGeometry args={[0.26, 8, 6]} />
          <meshStandardMaterial color={["#e85fa0", "#f0c53a", "#e2483d"][i % 3]} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function Lamp(): ReactNode {
  return (
    <group>
      <mesh position-y={1.4}>
        <cylinderGeometry args={[0.08, 0.1, 2.8, 6]} />
        <meshStandardMaterial color="#3a3f4c" metalness={0.5} />
      </mesh>
      <mesh position-y={2.9}>
        <sphereGeometry args={[0.32, 10, 8]} />
        <meshStandardMaterial color="#ffe9a8" emissive="#ffd24a" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

function Fountain(): ReactNode {
  return (
    <group>
      <mesh position-y={0.3}>
        <cylinderGeometry args={[3, 3.2, 0.6, 20]} />
        <meshStandardMaterial color="#c9ccd6" roughness={0.7} />
      </mesh>
      <mesh position-y={0.55}>
        <cylinderGeometry args={[2.6, 2.6, 0.3, 20]} />
        <meshStandardMaterial color="#7fbfe0" roughness={0.2} metalness={0.2} />
      </mesh>
      <mesh position-y={1.4}>
        <cylinderGeometry args={[0.4, 0.6, 1.8, 12]} />
        <meshStandardMaterial color="#c9ccd6" roughness={0.6} />
      </mesh>
      <mesh position-y={2.6}>
        <coneGeometry args={[0.5, 1, 10]} />
        <meshStandardMaterial color="#a6dcf0" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

function Topiary(): ReactNode {
  return (
    <group>
      <mesh position-y={0.9}>
        <coneGeometry args={[0.9, 1.8, 8]} />
        <meshStandardMaterial color="#2f7a34" roughness={0.8} />
      </mesh>
      <mesh position-y={2.1}>
        <sphereGeometry args={[0.6, 10, 8]} />
        <meshStandardMaterial color="#3f8f3a" roughness={0.8} />
      </mesh>
    </group>
  );
}

function JanitorPost(): ReactNode {
  return (
    <group>
      <mesh position-y={1}>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#2b6db0" roughness={0.7} />
      </mesh>
      <mesh position-y={2.2}>
        <coneGeometry args={[1.6, 0.8, 4]} />
        <meshStandardMaterial color="#ffd24a" roughness={0.6} />
      </mesh>
      <group position={[1.4, 0, 0.4]}>
        <mesh position-y={0.7}>
          <capsuleGeometry args={[0.22, 0.5, 4, 8]} />
          <meshStandardMaterial color="#2fb37a" roughness={0.6} />
        </mesh>
        <mesh position={[0.3, 0.9, 0]} rotation={[0, 0, 0.4]}>
          <cylinderGeometry args={[0.04, 0.04, 1.2, 6]} />
          <meshStandardMaterial color="#8a5a34" />
        </mesh>
      </group>
    </group>
  );
}

export function renderParkObject(object: SceneObject): ReactNode | undefined {
  switch (object.catalogId) {
    case "ride_carousel":
      return <Carousel />;
    case "ride_coaster":
      return <CoasterStation />;
    case "ride_ferris":
      return <FerrisWheel />;
    case "ride_dropzone":
      return <DropTower />;
    case "stall_food": {
      const def = buildableDef(object.catalogId);
      return <Stall color={def.color} trim={def.trim} />;
    }
    case "stall_drink": {
      const def = buildableDef(object.catalogId);
      return <Stall color={def.color} trim={def.trim} />;
    }
    case "stall_souvenir": {
      const def = buildableDef(object.catalogId);
      return <Stall color={def.color} trim={def.trim} />;
    }
    case "track_piece":
      return <TrackPiece />;
    case "path_walk":
      return <PathTile />;
    case "deco_tree":
      return <Tree />;
    case "deco_flowerbed":
      return <FlowerBed />;
    case "deco_lamp":
      return <Lamp />;
    case "deco_fountain":
      return <Fountain />;
    case "deco_topiary":
      return <Topiary />;
    case "staff_janitor":
      return <JanitorPost />;
    default:
      return undefined;
  }
}
