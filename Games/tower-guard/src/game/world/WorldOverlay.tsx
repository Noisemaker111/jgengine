import { useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGameContext } from "@jgengine/react/provider";
import { useGameStore } from "@jgengine/react/hooks";
import { resolveScatter } from "@jgengine/core/world/scatterRegion";
import { InstancedScatter } from "@jgengine/shell/scatter";

import { editorLayers } from "../../editorLayers";
import { GOLD_CURRENCY } from "../entities/base/catalog";
import { towerDef } from "../entities/towers/catalog";
import { session } from "../session";
import { activeProjectiles } from "../combat/pendingProjectiles";
import { BUILD_PLOTS, PATH_WAYPOINTS_XZ, groundHeightAt } from "./path";

/** Instances the authored foliage regions at runtime — the editor document driving the live scene. */
function AuthoredFoliage() {
  const ctx = useGameContext();
  // ctx.world.ground already carries the authored `sculpt`, so ground foliage on it directly.
  const instances = useMemo(() => resolveScatter(editorLayers, ctx.world.ground), [ctx.world.ground]);
  return <InstancedScatter instances={instances} />;
}

function PathRibbon() {
  return (
    <>
      {PATH_WAYPOINTS_XZ.slice(0, -1).map((a, index) => {
        const b = PATH_WAYPOINTS_XZ[index + 1]!;
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const length = Math.hypot(dx, dz);
        const midX = (a[0] + b[0]) / 2;
        const midZ = (a[1] + b[1]) / 2;
        const angle = Math.atan2(dx, dz);
        const y = groundHeightAt(midX, midZ) + 0.03;
        return (
          <mesh key={index} position={[midX, y, midZ]} rotation={[-Math.PI / 2, 0, angle]}>
            <planeGeometry args={[3.4, length + 3.4]} />
            <meshStandardMaterial color="#7a6444" roughness={1} />
          </mesh>
        );
      })}
    </>
  );
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
      <AuthoredFoliage />
      <PathRibbon />
      <BuildPlots />
      <ProjectileBolts />
    </>
  );
}
