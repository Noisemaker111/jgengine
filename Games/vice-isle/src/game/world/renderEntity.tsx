import type { ReactNode } from "react";
import { BackSide } from "three";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { vehicleById } from "../entities/vehicles/catalog";

export function Outline({ w, h, d, x = 0, y = 0, z = 0 }: { w: number; h: number; d: number; x?: number; y?: number; z?: number }) {
  return (
    <mesh position={[x, y, z]} scale={1.08}>
      <boxGeometry args={[w, h, d]} />
      <meshBasicMaterial color="#0c0d10" side={BackSide} />
    </mesh>
  );
}

function CarMesh({ body, cabin, isCop }: { body: string; cabin: string; isCop: boolean }) {
  return (
    <group>
      <Outline w={1.9} h={0.62} d={4.2} y={0.45} />
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.9, 0.6, 4.2]} />
        <meshToonMaterial color={body} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <boxGeometry args={[1.94, 0.16, 4.24]} />
        <meshToonMaterial color="#14161b" />
      </mesh>
      <Outline w={1.6} h={0.57} d={2.1} y={0.95} z={-0.3} />
      <mesh position={[0, 0.95, -0.3]} castShadow>
        <boxGeometry args={[1.6, 0.55, 2.1]} />
        <meshToonMaterial color={body} />
      </mesh>
      <mesh position={[0, 0.97, 0.72]}>
        <boxGeometry args={[1.44, 0.42, 0.08]} />
        <meshToonMaterial color="#8fd8ef" />
      </mesh>
      <mesh position={[0, 0.97, -1.32]}>
        <boxGeometry args={[1.44, 0.42, 0.08]} />
        <meshToonMaterial color="#8fd8ef" />
      </mesh>
      {[-0.82, 0.82].map((x) => (
        <mesh key={`side-${x}`} position={[x, 0.97, -0.3]}>
          <boxGeometry args={[0.06, 0.38, 1.7]} />
          <meshToonMaterial color={cabin} />
        </mesh>
      ))}
      {isCop ? (
        <>
          <mesh position={[-0.24, 1.32, -0.3]}>
            <boxGeometry args={[0.42, 0.18, 0.4]} />
            <meshToonMaterial color="#e33b3b" emissive="#e33b3b" emissiveIntensity={1.4} />
          </mesh>
          <mesh position={[0.24, 1.32, -0.3]}>
            <boxGeometry args={[0.42, 0.18, 0.4]} />
            <meshToonMaterial color="#3b6ee3" emissive="#3b6ee3" emissiveIntensity={1.4} />
          </mesh>
          <mesh position={[0, 0.5, 0.4]}>
            <boxGeometry args={[1.94, 0.3, 1.2]} />
            <meshToonMaterial color="#14161b" />
          </mesh>
        </>
      ) : null}
      {[
        [-0.88, 1.35],
        [0.88, 1.35],
        [-0.88, -1.45],
        [0.88, -1.45],
      ].map(([x, z], i) => (
        <group key={i} position={[x ?? 0, 0.32, z ?? 0]} rotation={[0, 0, Math.PI / 2]}>
          <mesh>
            <cylinderGeometry args={[0.34, 0.34, 0.28, 14]} />
            <meshToonMaterial color="#101215" />
          </mesh>
          <mesh position={[0, (x ?? 0) > 0 ? 0.15 : -0.15, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.02, 10]} />
            <meshToonMaterial color="#c9d2e0" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.5, 2.12]}>
        <boxGeometry args={[1.5, 0.18, 0.08]} />
        <meshToonMaterial color="#ffe08a" emissive="#ffe08a" emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[0, 0.5, -2.12]}>
        <boxGeometry args={[1.5, 0.18, 0.08]} />
        <meshToonMaterial color="#ff5a4e" emissive="#ff5a4e" emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

function PersonMesh({ shirt, skin, hat, pants = "#2c2f38", scale = 1 }: { shirt: string; skin: string; hat?: string; pants?: string; scale?: number }) {
  return (
    <group scale={scale}>
      <Outline w={0.56} h={0.62} d={0.34} y={0.82} />
      <mesh position={[0, 0.82, 0]} castShadow>
        <boxGeometry args={[0.56, 0.62, 0.34]} />
        <meshToonMaterial color={shirt} />
      </mesh>
      {[-0.36, 0.36].map((x) => (
        <group key={`arm-${x}`}>
          <mesh position={[x, 0.86, 0]}>
            <boxGeometry args={[0.14, 0.5, 0.16]} />
            <meshToonMaterial color={shirt} />
          </mesh>
          <mesh position={[x, 0.56, 0]}>
            <boxGeometry args={[0.13, 0.14, 0.15]} />
            <meshToonMaterial color={skin} />
          </mesh>
        </group>
      ))}
      {[-0.14, 0.14].map((x) => (
        <mesh key={`leg-${x}`} position={[x, 0.26, 0]}>
          <boxGeometry args={[0.2, 0.52, 0.24]} />
          <meshToonMaterial color={pants} />
        </mesh>
      ))}
      {[-0.14, 0.14].map((x) => (
        <mesh key={`shoe-${x}`} position={[x, 0.03, 0.04]}>
          <boxGeometry args={[0.21, 0.1, 0.32]} />
          <meshToonMaterial color="#15171c" />
        </mesh>
      ))}
      <Outline w={0.36} h={0.38} d={0.32} y={1.34} />
      <mesh position={[0, 1.34, 0]} castShadow>
        <boxGeometry args={[0.36, 0.38, 0.32]} />
        <meshToonMaterial color={skin} />
      </mesh>
      <mesh position={[0, 1.34, 0.165]}>
        <boxGeometry args={[0.3, 0.08, 0.02]} />
        <meshToonMaterial color="#15171c" />
      </mesh>
      {hat !== undefined ? (
        <>
          <mesh position={[0, 1.56, 0]}>
            <boxGeometry args={[0.42, 0.14, 0.38]} />
            <meshToonMaterial color={hat} />
          </mesh>
          <mesh position={[0, 1.5, 0.24]}>
            <boxGeometry args={[0.4, 0.05, 0.18]} />
            <meshToonMaterial color={hat} />
          </mesh>
        </>
      ) : null}
    </group>
  );
}

const PERSON_LOOKS: Record<string, { shirt: string; skin: string; hat?: string; pants?: string; scale?: number }> = {
  street_runner: { shirt: "#f2599b", skin: "#e8b58a", pants: "#274a70" },
  ped_beach: { shirt: "#ffd166", skin: "#d99e6f", pants: "#e8e2d2" },
  ped_city: { shirt: "#5fb0e8", skin: "#e8b58a" },
  ped_docks: { shirt: "#9aa38f", skin: "#c98d5f", pants: "#3d4a3a" },
  contact_marco: { shirt: "#f4f0e6", skin: "#caa26e", hat: "#f4f0e6", pants: "#d9cfb3" },
  ganger_dock: { shirt: "#c23b3b", skin: "#d99e6f", hat: "#701f1f" },
  ganger_enforcer: { shirt: "#8a1f1f", skin: "#c98d5f", hat: "#33110f", scale: 1.15 },
  kingpin_sal: { shirt: "#f5f0e0", skin: "#caa26e", hat: "#c9a227", pants: "#f5f0e0", scale: 1.25 },
  cop_patrol: { shirt: "#2e4f8f", skin: "#e8b58a", hat: "#1d3260", pants: "#1f2b45" },
  cop_swat: { shirt: "#20242e", skin: "#e8b58a", hat: "#12141a", pants: "#181b22" },
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
