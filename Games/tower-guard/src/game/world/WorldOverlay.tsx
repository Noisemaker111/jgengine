import { useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGameContext } from "@jgengine/react/provider";
import { useGameStore } from "@jgengine/react/hooks";
import { AuthoredScene } from "@jgengine/shell/scene";

import { editorLayers } from "../../editorLayers";
import { GOLD_CURRENCY } from "../entities/base/catalog";
import { towerDef } from "../entities/towers/catalog";
import { session } from "../session";
import { activeProjectiles } from "../combat/pendingProjectiles";
import { BUILD_PLOTS, SPAWN_POINT } from "./path";

/** Renders the authored scene — draped creep path + instanced foliage — straight from the document. */
function Scene() {
  const ctx = useGameContext();
  return <AuthoredScene document={editorLayers} field={ctx.world.ground} />;
}

function BuildPlots() {
  const ctx = useGameContext();
  useGameStore((c) => c.game.economy.balance(c.player.userId, GOLD_CURRENCY));
  const selectedId = session.selectedTowerId;
  const cost = selectedId === null ? 0 : towerDef(selectedId).cost;
  const gold = ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY);
  return (
    <>
      {BUILD_PLOTS.map((plot) => {
        const occupied = session.plotOccupant.get(plot.id) !== null;
        if (occupied) return null;
        const affordable = selectedId !== null && gold >= cost;
        const color = selectedId === null ? "#4a5a44" : affordable ? "#5fbf6a" : "#8a4a4a";
        return (
          <group key={plot.id} position={[plot.position[0], plot.position[1], plot.position[2]]}>
            {/* Prepared stone foundation — an empty plot reads as masonry waiting for a tower. */}
            <mesh position-y={0.12} receiveShadow castShadow>
              <cylinderGeometry args={[1.35, 1.5, 0.24, 8]} />
              <meshStandardMaterial color="#7d766a" roughness={1} />
            </mesh>
            <mesh position-y={0.26} rotation={[0, Math.PI / 8, 0]}>
              <cylinderGeometry args={[1.05, 1.05, 0.06, 8]} />
              <meshStandardMaterial color="#635c50" roughness={1} />
            </mesh>
            {/* Affordability halo */}
            <mesh position-y={0.31} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[1.12, 1.44, 24]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} roughness={0.6} transparent opacity={0.9} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/** Raider gate landmark at the spawn — two rough stone pillars and a dark banner mark where the horde emerges. */
function SpawnGate() {
  const [x, y, z] = SPAWN_POINT;
  return (
    <group position={[x, y, z]}>
      {[-1.5, 1.5].map((dx) => (
        <mesh key={dx} position={[dx, 1.1, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.7, 2.2, 0.7]} />
          <meshStandardMaterial color="#565049" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 2.45, 0]} castShadow>
        <boxGeometry args={[4, 0.5, 0.6]} />
        <meshStandardMaterial color="#463f39" roughness={1} />
      </mesh>
      <mesh position={[0, 1.75, 0.02]}>
        <planeGeometry args={[1.5, 1.3]} />
        <meshStandardMaterial color="#7a2320" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      {[-1.5, 1.5].map((dx) => (
        <mesh key={`brazier-${dx}`} position={[dx, 2.35, 0]}>
          <sphereGeometry args={[0.22, 10, 8]} />
          <meshStandardMaterial color="#ff8b3a" emissive="#ff5a1e" emissiveIntensity={1.4} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function ProjectileBolts() {
  const ctx = useGameContext();
  const [, setTick] = useState(0);
  useFrame(() => setTick((value) => value + 1));
  const now = ctx.time.now();
  const bolts = activeProjectiles(now);
  return (
    <>
      {bolts.map((bolt) => {
        const t = Math.min(1, (now - bolt.spawnedAt) / bolt.travelSeconds);
        const x = bolt.from[0] + (bolt.to[0] - bolt.from[0]) * t;
        const y = bolt.from[1] + 0.9 + (bolt.to[1] - bolt.from[1]) * t;
        const z = bolt.from[2] + (bolt.to[2] - bolt.from[2]) * t;
        return (
          <mesh key={bolt.id} position={[x, y, z]}>
            <sphereGeometry args={[0.14, 8, 8]} />
            <meshStandardMaterial color={bolt.color} emissive={bolt.color} emissiveIntensity={0.9} />
          </mesh>
        );
      })}
    </>
  );
}

export function TowerGuardWorldOverlay() {
  return (
    <>
      <Scene />
      <SpawnGate />
      <BuildPlots />
      <ProjectileBolts />
    </>
  );
}
