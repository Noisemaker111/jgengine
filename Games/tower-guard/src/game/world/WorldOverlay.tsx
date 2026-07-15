import { useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGameContext } from "@jgengine/react/provider";
import { useGameStore } from "@jgengine/react/hooks";
import { AuthoredScene } from "@jgengine/shell/scene";

import { editorLayers } from "../../editorLayers";
import { GOLD_CURRENCY } from "../entities/base/catalog";
import { towerDef } from "../entities/towers/catalog";
import { session } from "../session";
import { activeProjectiles } from "../combat/pendingProjectiles";
import { BUILD_PLOTS } from "./path";

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
        const color = selectedId === null ? "#3d4a3a" : affordable ? "#5fbf6a" : "#8a4a4a";
        return (
          <mesh
            key={plot.id}
            position={[plot.position[0], plot.position[1] + 0.04, plot.position[2]]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[1.1, 1.5, 20]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.6} />
          </mesh>
        );
      })}
    </>
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
      <BuildPlots />
      <ProjectileBolts />
    </>
  );
}
