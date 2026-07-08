import { useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { generateBuilding } from "@jgengine/core/world/buildings";
import type { Tile } from "@jgengine/core/tactics/tacticalGrid";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useEngineState } from "@jgengine/react/engineStore";
import { EnvironmentScene } from "@jgengine/shell/environment";
import { GeneratedBuilding, type BuildingMaterialPalette } from "@jgengine/shell/structures/GeneratedBuilding";

import { GRID_SIZE, TILE_SIZE, tileToWorld } from "../board";
import { ENEMY_UNITS } from "../entities/enemies/catalog";
import { PLAYER_UNITS } from "../entities/players/catalog";
import { WAVES } from "../waves";
import { world } from "../../world";
import { store } from "../battle/controller";

const RUIN_PALETTE: BuildingMaterialPalette = {
  wall: "#57534a",
  window: "#3c5a6b",
  storefront: "#3c5a6b",
  shutter: "#43403a",
  awning: "#6b4a3a",
  airConditioner: "#8a8578",
  clothesline: "#8a8578",
  storeSign: "#c2703c",
  roof: "#3a3730",
  roofProp: "#726a58",
  guardrail: "#8a8578",
  corner: "#463f36",
};

function buildGridLineGeometry(): THREE.BufferGeometry {
  const half = (GRID_SIZE * TILE_SIZE) / 2;
  const points: number[] = [];
  for (let i = 0; i <= GRID_SIZE; i += 1) {
    const offset = -half + i * TILE_SIZE;
    points.push(-half, 0, offset, half, 0, offset, offset, 0, -half, offset, 0, half);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

function GridLines() {
  const geometry = useMemo(buildGridLineGeometry, []);
  return (
    <lineSegments geometry={geometry} position-y={0.05}>
      <lineBasicMaterial color="#7fd8ff" transparent opacity={0.4} />
    </lineSegments>
  );
}

function Obstacles({ waveIndex }: { waveIndex: number }) {
  const wave = WAVES[waveIndex] ?? WAVES[0]!;
  const buildings = useMemo(
    () =>
      wave.obstacles.map((tile) => {
        const [x, , z] = tileToWorld(tile);
        return generateBuilding({
          id: `ruin-${waveIndex}-${tile[0]}-${tile[1]}`,
          seed: `grid-tactics-${waveIndex}-${tile[0]}-${tile[1]}`,
          center: [x, z],
          floors: 1,
          baysWide: 1,
          baysDeep: 1,
          bayWidth: TILE_SIZE * 0.72,
          floorHeight: 1.5,
          facadeDepth: 0.12,
          roofOverhang: 0.08,
        });
      }),
    [wave, waveIndex],
  );
  return (
    <>
      {buildings.map((building) => (
        <GeneratedBuilding key={building.id} building={building} palette={RUIN_PALETTE} />
      ))}
    </>
  );
}

export function GridEnvironment() {
  const state = useEngineState(store);
  return (
    <>
      <EnvironmentScene feature={world} />
      <GridLines />
      <Obstacles waveIndex={state.waveIndex} />
    </>
  );
}

function TileMarker({ tile, color, opacity }: { tile: Tile; color: string; opacity: number }) {
  const [x, , z] = tileToWorld(tile);
  return (
    <mesh position={[x, 0.03, z]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[TILE_SIZE * 0.86, TILE_SIZE * 0.86]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function IntentMarker({ tile, targetTile }: { tile: Tile; targetTile: Tile | null }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current === null) return;
    const pulse = 0.22 + Math.sin(clock.elapsedTime * 3) * 0.08;
    (ref.current.material as THREE.MeshBasicMaterial).opacity = pulse;
  });
  const [x, , z] = tileToWorld(tile);
  return (
    <>
      <mesh ref={ref} position={[x, 0.04, z]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[TILE_SIZE * 0.9, TILE_SIZE * 0.9]} />
        <meshBasicMaterial color="#f7b955" transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {targetTile !== null ? <TileMarker tile={targetTile} color="#ff4d4d" opacity={0.34} /> : null}
    </>
  );
}

export function BattleOverlay() {
  const state = useEngineState(store);
  return (
    <>
      {state.moveTiles.map((tile) => (
        <TileMarker key={`m-${tile[0]}-${tile[1]}`} tile={tile} color="#4fd1ff" opacity={0.32} />
      ))}
      {state.attackTiles.map((tile) => (
        <TileMarker key={`a-${tile[0]}-${tile[1]}`} tile={tile} color="#ff5d5d" opacity={0.24} />
      ))}
      {state.phase === "player"
        ? state.intents
            .filter((entry) => entry.intent.kind !== "hold")
            .map((entry) => (
              <IntentMarker
                key={entry.enemyId}
                tile={entry.intent.kind === "hold" ? entry.tile : entry.intent.moveTo}
                targetTile={entry.intent.kind === "attack" ? entry.intent.targetTile : null}
              />
            ))
        : null}
    </>
  );
}

function unitLookColors(catalogId: string): { hull: string; trim: string } {
  const player = PLAYER_UNITS[catalogId];
  if (player !== undefined) return { hull: player.hull, trim: player.trim };
  const enemy = ENEMY_UNITS[catalogId];
  if (enemy !== undefined) return { hull: enemy.hull, trim: enemy.trim };
  return { hull: "#888888", trim: "#cccccc" };
}

function BulwarkBody({ hull, trim }: { hull: string; trim: string }) {
  return (
    <>
      <mesh position-y={0.5}>
        <boxGeometry args={[0.62, 0.7, 0.62]} />
        <meshStandardMaterial color={hull} roughness={0.55} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.9, 0.22, 0.5]} />
        <meshStandardMaterial color={trim} roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.36, 0.4]}>
        <boxGeometry args={[0.5, 0.5, 0.16]} />
        <meshStandardMaterial color={trim} roughness={0.3} metalness={0.6} />
      </mesh>
    </>
  );
}

function MarksmanBody({ hull, trim }: { hull: string; trim: string }) {
  return (
    <>
      <mesh position-y={0.55}>
        <cylinderGeometry args={[0.24, 0.32, 0.9, 8]} />
        <meshStandardMaterial color={hull} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0.16, 0.85, 0.28]} rotation-x={0.3}>
        <boxGeometry args={[0.12, 0.12, 0.8]} />
        <meshStandardMaterial color={trim} roughness={0.3} metalness={0.6} />
      </mesh>
      <mesh position={[0, 1.05, 0]}>
        <coneGeometry args={[0.18, 0.3, 8]} />
        <meshStandardMaterial color={trim} roughness={0.35} metalness={0.5} />
      </mesh>
    </>
  );
}

function AegisBody({ hull, trim }: { hull: string; trim: string }) {
  return (
    <>
      <mesh position-y={0.6}>
        <boxGeometry args={[0.7, 1.05, 0.7]} />
        <meshStandardMaterial color={hull} roughness={0.6} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.55, 0.45]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.42, 0.42, 0.08, 20]} />
        <meshStandardMaterial color={trim} roughness={0.3} metalness={0.6} />
      </mesh>
    </>
  );
}

function CrawlerBody({ hull, trim }: { hull: string; trim: string }) {
  return (
    <>
      <mesh position-y={0.28}>
        <boxGeometry args={[0.7, 0.4, 0.5]} />
        <meshStandardMaterial color={hull} roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.55, 0.14]} rotation-x={Math.PI}>
        <coneGeometry args={[0.16, 0.34, 6]} />
        <meshStandardMaterial color={trim} roughness={0.4} metalness={0.2} />
      </mesh>
    </>
  );
}

function BruteBody({ hull, trim }: { hull: string; trim: string }) {
  return (
    <>
      <mesh position-y={0.55}>
        <boxGeometry args={[0.85, 1.0, 0.75]} />
        <meshStandardMaterial color={hull} roughness={0.75} metalness={0.15} />
      </mesh>
      <mesh position={[0.55, 0.5, 0]}>
        <boxGeometry args={[0.28, 0.5, 0.4]} />
        <meshStandardMaterial color={trim} roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[-0.55, 0.5, 0]}>
        <boxGeometry args={[0.28, 0.5, 0.4]} />
        <meshStandardMaterial color={trim} roughness={0.6} metalness={0.2} />
      </mesh>
    </>
  );
}

function SpitterBody({ hull, trim }: { hull: string; trim: string }) {
  return (
    <>
      <mesh position-y={0.5}>
        <cylinderGeometry args={[0.2, 0.36, 0.85, 7]} />
        <meshStandardMaterial color={hull} roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.95, 0.18]} rotation-x={0.5}>
        <cylinderGeometry args={[0.1, 0.1, 0.5, 8]} />
        <meshStandardMaterial color={trim} roughness={0.35} metalness={0.4} />
      </mesh>
    </>
  );
}

const BODY_BY_ID: Record<string, (props: { hull: string; trim: string }) => ReactNode> = {
  bulwark: BulwarkBody,
  marksman: MarksmanBody,
  aegis: AegisBody,
  crawler: CrawlerBody,
  brute: BruteBody,
  spitter: SpitterBody,
};

function UnitMesh({ entity }: { entity: SceneEntity }) {
  const state = useEngineState(store);
  const { hull, trim } = unitLookColors(entity.name);
  const Body = BODY_BY_ID[entity.name] ?? BulwarkBody;
  const selected = state.selectedUnitId === entity.id;
  const acted = state.actedIds.includes(entity.id);
  return (
    <group scale={acted ? 0.92 : 1}>
      <Body hull={hull} trim={trim} />
      {selected ? (
        <mesh position-y={0.02} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.62, 0.74, 28]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {acted ? (
        <mesh position-y={0.02} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.5, 20]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.22} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
    </group>
  );
}

export function renderUnit(entity: SceneEntity) {
  return <UnitMesh entity={entity} />;
}
