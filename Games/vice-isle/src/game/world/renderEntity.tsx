import type { ReactNode } from "react";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { vehicleById } from "../entities/vehicles/catalog";

function CarMesh({ body, cabin, isCop }: { body: string; cabin: string; isCop: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.9, 0.6, 4.2]} />
        <meshToonMaterial color={body} />
      </mesh>
      <mesh position={[0, 0.95, -0.3]} castShadow>
        <boxGeometry args={[1.6, 0.55, 2.1]} />
        <meshToonMaterial color={cabin} />
      </mesh>
      {isCop ? (
        <mesh position={[0, 1.3, -0.3]}>
          <boxGeometry args={[0.9, 0.18, 0.4]} />
          <meshToonMaterial color="#e33b3b" emissive="#e33b3b" emissiveIntensity={0.8} />
        </mesh>
      ) : null}
      {[
        [-0.85, 1.35],
        [0.85, 1.35],
        [-0.85, -1.45],
        [0.85, -1.45],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x ?? 0, 0.32, z ?? 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.32, 0.32, 0.3, 12]} />
          <meshToonMaterial color="#181a1f" />
        </mesh>
      ))}
      <mesh position={[0, 0.45, 2.12]}>
        <boxGeometry args={[1.5, 0.25, 0.1]} />
        <meshToonMaterial color="#ffe08a" emissive="#ffe08a" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function PersonMesh({ shirt, skin, hat }: { shirt: string; skin: string; hat?: string }) {
  return (
    <group>
      <mesh position={[0, 0.65, 0]} castShadow>
        <boxGeometry args={[0.55, 0.8, 0.35]} />
        <meshToonMaterial color={shirt} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.32]} />
        <meshToonMaterial color="#2c2f38" />
      </mesh>
      <mesh position={[0, 1.28, 0]} castShadow>
        <boxGeometry args={[0.36, 0.4, 0.34]} />
        <meshToonMaterial color={skin} />
      </mesh>
      {hat !== undefined ? (
        <mesh position={[0, 1.55, 0]}>
          <boxGeometry args={[0.42, 0.16, 0.4]} />
          <meshToonMaterial color={hat} />
        </mesh>
      ) : null}
    </group>
  );
}

const PERSON_LOOKS: Record<string, { shirt: string; skin: string; hat?: string }> = {
  street_runner: { shirt: "#f2599b", skin: "#e8b58a" },
  ped_beach: { shirt: "#ffd166", skin: "#d99e6f" },
  ped_city: { shirt: "#5fb0e8", skin: "#e8b58a" },
  ped_docks: { shirt: "#9aa38f", skin: "#c98d5f" },
  contact_marco: { shirt: "#f4f0e6", skin: "#caa26e", hat: "#f4f0e6" },
  ganger_dock: { shirt: "#c23b3b", skin: "#d99e6f", hat: "#701f1f" },
  ganger_enforcer: { shirt: "#8a1f1f", skin: "#c98d5f", hat: "#33110f" },
  kingpin_sal: { shirt: "#f5f0e0", skin: "#caa26e", hat: "#c9a227" },
  cop_patrol: { shirt: "#2e4f8f", skin: "#e8b58a", hat: "#1d3260" },
  cop_swat: { shirt: "#20242e", skin: "#e8b58a", hat: "#12141a" },
};

export function renderEntity(entity: SceneEntity): ReactNode {
  const vehicle = vehicleById(entity.name);
  if (vehicle !== undefined) {
    return <CarMesh body={vehicle.body} cabin={vehicle.cabin} isCop={entity.name === "car_cop"} />;
  }
  const look = PERSON_LOOKS[entity.name];
  if (look !== undefined) return <PersonMesh {...look} />;
  return undefined;
}
