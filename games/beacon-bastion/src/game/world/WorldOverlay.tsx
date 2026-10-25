import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGameContext } from "@jgengine/react/provider";
import { useGameStore } from "@jgengine/react/hooks";
import { SceneCaptureBinding } from "@jgengine/shell/render/sceneCapture";
import { StaticShapeInstances } from "@jgengine/shell/render/staticShapeInstances";

import { bindKeepCapture } from "../thumbs";

import { buildCost, keep, towerStats } from "../keep";
import { session } from "../session";
import { activeProjectiles } from "../combat/pendingProjectiles";
import { BUILD_PLOTS, FLANK_POINT_KEY, HAS_FLANK, ROUTES, SPAWN_POINT, groundHeightAt } from "./path";

/** Where the east flank road opens. */
const FLANK_GATE = ROUTES[FLANK_POINT_KEY]![0]!;
import { plotShapes } from "./plotShapes";
import { rangeRingBand } from "./rangeRing";

function BuildPlots() {
  const gold = useGameStore((c) => keep.of(c).num("keep.gold"));
  const occupied = useGameStore((c) => BUILD_PLOTS.map((plot) => keep.of(c).occupant(plot.id) !== null).join(","));
  const selectedId = session.selectedTowerId;
  const cost = selectedId === null ? 0 : buildCost(selectedId);
  const affordable = selectedId !== null && gold >= cost;
  // Prepared stone foundations - an empty plot reads as masonry waiting for a tower - with a halo
  // coloured by whether the picked tower is affordable.
  const color = selectedId === null ? "#4a5a44" : affordable ? "#5fbf6a" : "#8a4a4a";
  const shapes = useMemo(() => plotShapes(BUILD_PLOTS, occupied.split(",").map((flag) => flag !== "true"), color), [occupied, color]);
  return <StaticShapeInstances instances={shapes} />;
}

/** A tower still rising: a timber frame that climbs with the keep's build order, so a timed build reads on the field. */
function BuildSites() {
  const sites = useGameStore((c) => {
    const world = keep.of(c);
    return world.orders("build").map((order) => `${world.instance(order.target ?? "")?.slot ?? ""}:${order.progress.toFixed(2)}`).join(",");
  });
  if (sites.length === 0) return null;
  return (
    <>
      {sites.split(",").map((site) => {
        const [slot, progressText] = site.split(":");
        const plot = BUILD_PLOTS.find((candidate) => candidate.id === slot);
        if (plot === undefined) return null;
        const height = 0.3 + 2.6 * Number(progressText);
        return (
          <group key={slot} position={[plot.position[0], plot.position[1], plot.position[2]]}>
            {[[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].map(([dx, dz]) => (
              <mesh key={`${dx}:${dz}`} position={[dx!, height / 2, dz!]} castShadow>
                <boxGeometry args={[0.18, height, 0.18]} />
                <meshStandardMaterial color="#8a6a3e" roughness={1} />
              </mesh>
            ))}
            <mesh position-y={height} castShadow>
              <boxGeometry args={[2.1, 0.14, 2.1]} />
              <meshStandardMaterial color="#a07a46" roughness={1} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/** The inspected tower's firing radius: a draped ground outline, so the raider road stays readable under it. */
function RangeRing({ center, radius }: { center: readonly [number, number]; radius: number }) {
  const [x, z] = center;
  const geometry = useMemo(() => {
    const band = rangeRingBand({ center: [x, z], radius, sampleHeight: groundHeightAt });
    const draped = new THREE.BufferGeometry();
    draped.setAttribute("position", new THREE.BufferAttribute(band.positions, 3));
    draped.setIndex(new THREE.BufferAttribute(band.indices, 1));
    draped.computeVertexNormals();
    return draped;
  }, [x, z, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} renderOrder={4}>
      <meshStandardMaterial
        color="#f4d35e"
        emissive="#f4d35e"
        emissiveIntensity={0.6}
        roughness={0.5}
        transparent
        opacity={0.85}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Selection ring plus the live firing radius of the tower whose sell/upgrade panel is open. */
function InspectedTower() {
  const inspectedId = useGameStore(() => session.inspectedTowerId);
  const slot = useGameStore((c) => (inspectedId === null ? null : keep.of(c).instance(inspectedId)?.slot ?? null));
  const range = useGameStore((c) => (inspectedId === null ? 0 : towerStats(keep.of(c), inspectedId).range));
  const plot = slot === null ? undefined : BUILD_PLOTS.find((candidate) => candidate.id === slot);
  if (plot === undefined) return null;
  return (
    <>
      <group position={[plot.position[0], plot.position[1], plot.position[2]]}>
        <mesh position-y={0.33} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.5, 1.75, 32]} />
          <meshStandardMaterial color="#f4d35e" emissive="#f4d35e" emissiveIntensity={0.8} roughness={0.5} />
        </mesh>
      </group>
      <RangeRing center={[plot.position[0], plot.position[2]]} radius={range} />
    </>
  );
}

/** Raider gate landmark at a spawn — two rough stone pillars and a dark banner mark where the horde emerges. */
function SpawnGate({ at, facing = 0 }: { at: readonly [number, number, number]; facing?: number }) {
  const [x, y, z] = at;
  return (
    <group position={[x, y, z]} rotation={[0, facing, 0]}>
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

/** VFX-only overlay — the authored scene (draped creep path + instanced foliage) is auto-mounted
 * by `defineGame({ editorLayers })`. */
export function BeaconBastionWorldOverlay() {
  return (
    <>
      <SceneCaptureBinding bind={bindKeepCapture} />
      <SpawnGate at={SPAWN_POINT} />
      {HAS_FLANK ? <SpawnGate at={FLANK_GATE} facing={Math.PI / 2} /> : null}
      <BuildPlots />
      <BuildSites />
      <InspectedTower />
      <ProjectileBolts />
    </>
  );
}

