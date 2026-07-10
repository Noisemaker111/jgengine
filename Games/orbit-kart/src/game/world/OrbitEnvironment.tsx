import { useMemo } from "react";
import * as THREE from "three";
import { seededRng } from "@jgengine/core/random/rng";
import { SkyDaylight } from "@jgengine/shell/environment";

import { ASTEROID_CLUSTERS, BOOST_PADS, CHECKPOINT_DEFS, PLANETOIDS, type Planetoid } from "../cluster/catalog";
import { ARENA_SIZE, KART_Y } from "../constants";
import { PALETTE } from "../theme";
import { world as worldFeature } from "../../world";

const SKY_DESCRIPTOR = worldFeature.kind === "environment" ? worldFeature.sky : undefined;
const VOID_COLOR = PALETTE.spaceIndigo;
const STAR_COUNT = 900;

function pointOnSphere(rng: () => number, radius: number): readonly [number, number, number] {
  const u = rng();
  const v = rng();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return [radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta)];
}

function Starfield() {
  const geometry = useMemo(() => {
    const rng = seededRng("orbit-kart-starfield");
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const tint = new THREE.Color();
    for (let i = 0; i < STAR_COUNT; i += 1) {
      const radius = ARENA_SIZE * (0.55 + rng() * 0.65);
      const angle = rng() * Math.PI * 2;
      const height = 40 + rng() * 260;
      positions[i * 3] = Math.sin(angle) * radius;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.cos(angle) * radius;
      const warmth = rng();
      tint.setRGB(0.85 + warmth * 0.15, 0.85 + warmth * 0.1, 1);
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, []);
  return (
    <points geometry={geometry}>
      <pointsMaterial size={1.6} vertexColors sizeAttenuation transparent opacity={0.9} />
    </points>
  );
}

function VoidPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[ARENA_SIZE, ARENA_SIZE]} />
      <meshStandardMaterial color={VOID_COLOR} roughness={0.95} metalness={0.05} />
    </mesh>
  );
}

function Craters({ planetoid }: { planetoid: Planetoid }) {
  const craters = useMemo(() => {
    const rng = seededRng(planetoid.craterSeed);
    const count = 5 + Math.floor(rng() * 4);
    return Array.from({ length: count }, () => {
      const [x, y, z] = pointOnSphere(rng, planetoid.radius * 1.001);
      const scale = planetoid.radius * (0.14 + rng() * 0.16);
      return { position: [x, y, z] as const, scale };
    });
  }, [planetoid.craterSeed, planetoid.radius]);

  return (
    <>
      {craters.map((crater, index) => {
        const normal = new THREE.Vector3(...crater.position).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        return (
          <mesh key={index} position={crater.position} quaternion={quaternion}>
            <circleGeometry args={[crater.scale, 10]} />
            <meshStandardMaterial color="#000000" transparent opacity={0.28} roughness={1} />
          </mesh>
        );
      })}
    </>
  );
}

function PlanetoidRing({ planetoid }: { planetoid: Planetoid }) {
  if (planetoid.ringColor === null) return null;
  return (
    <mesh rotation={[Math.PI / 2.35, 0, 0]}>
      <ringGeometry args={[planetoid.radius * 1.35, planetoid.radius * 1.85, 48]} />
      <meshStandardMaterial
        color={planetoid.ringColor}
        emissive={planetoid.ringColor}
        emissiveIntensity={0.35}
        transparent
        opacity={0.55}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function PlanetoidBody({ planetoid }: { planetoid: Planetoid }) {
  return (
    <group position={[planetoid.position[0], 0, planetoid.position[1]]}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[planetoid.radius, 40, 32]} />
        <meshStandardMaterial color={planetoid.color} roughness={0.8} metalness={0.12} />
      </mesh>
      <Craters planetoid={planetoid} />
      <PlanetoidRing planetoid={planetoid} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position-y={0.03}>
        <ringGeometry args={[planetoid.wellRadius - 0.4, planetoid.wellRadius, 64]} />
        <meshBasicMaterial color={planetoid.color} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function AsteroidField() {
  return (
    <>
      {ASTEROID_CLUSTERS.flatMap((cluster) =>
        cluster.rocks.map((rock, index) => {
          const rng = seededRng(`${cluster.id}-${index}`);
          const rotation: [number, number, number] = [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI];
          return (
            <mesh
              key={`${cluster.id}-${index}`}
              position={[rock.position[0], rock.radius * 0.4, rock.position[1]]}
              rotation={rotation}
              castShadow
            >
              <icosahedronGeometry args={[rock.radius, 0]} />
              <meshStandardMaterial color="#4b4658" roughness={0.95} metalness={0.05} />
            </mesh>
          );
        }),
      )}
    </>
  );
}

function CheckpointRings() {
  return (
    <>
      {CHECKPOINT_DEFS.map((checkpoint, index) => {
        const next = CHECKPOINT_DEFS[(index + 1) % CHECKPOINT_DEFS.length]!;
        const heading = Math.atan2(next.position[0] - checkpoint.position[0], next.position[1] - checkpoint.position[1]);
        const isFinish = index === CHECKPOINT_DEFS.length - 1;
        const color = isFinish ? PALETTE.starlight : PALETTE.boostTangerine;
        return (
          <group key={checkpoint.id} position={[checkpoint.position[0], KART_Y, checkpoint.position[1]]} rotation={[0, heading, 0]}>
            <mesh rotation={[0, 0, 0]}>
              <torusGeometry args={[9, isFinish ? 0.55 : 0.35, 12, 32]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isFinish ? 0.85 : 0.55} roughness={0.4} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function BoostPads() {
  return (
    <>
      {BOOST_PADS.map((pad) => (
        <mesh key={pad.id} position={[pad.position[0], 0.05, pad.position[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[3.4, 3.4, 0.1, 24]} />
          <meshStandardMaterial
            color={PALETTE.boostTangerine}
            emissive={PALETTE.boostTangerine}
            emissiveIntensity={0.9}
            transparent
            opacity={0.75}
          />
        </mesh>
      ))}
    </>
  );
}

export function OrbitEnvironment() {
  return (
    <>
      {SKY_DESCRIPTOR !== undefined ? <SkyDaylight sky={SKY_DESCRIPTOR} /> : null}
      <ambientLight intensity={0.25} color={PALETTE.starlight} />
      <Starfield />
      <VoidPlane />
      {PLANETOIDS.map((planetoid) => (
        <PlanetoidBody key={planetoid.id} planetoid={planetoid} />
      ))}
      <AsteroidField />
      <CheckpointRings />
      <BoostPads />
    </>
  );
}
