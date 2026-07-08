import type { ReactNode } from "react";
import { useMemo, useRef } from "react";
import { Color, Fog, type Group, type Mesh, type PointLight } from "three";
import { useFrame, useThree } from "@react-three/fiber";

import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useSceneEntities, usePlayer } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";

import { MUNCHER } from "../catalog";
import {
  cellToWorld,
  COLS,
  GHOSTS,
  ROWS,
  wallCells,
  XMIN,
  ZMIN,
  type PowerupKind,
} from "../maze";
import {
  FOG_NEAR,
  getFogFar,
  getForcefieldRemaining,
  getFrightenedRemaining,
  getLanternRemaining,
  getMuzzleFlash,
  ghostModeOf,
  remainingPelletCells,
  remainingPowerCells,
  remainingPowerups,
} from "../../loop";

const WALL_COLOR = "#0e0e1c";
const FLOOR_COLOR = "#050509";
const CEIL_COLOR = "#08070f";
const FOG_COLOR = "#03030a";
const PELLET_COLOR = "#ffdca0";
const POWER_COLOR = "#8affc0";
const EYE_MENACE = "#ff1414";
const FRIGHT_COLOR = "#1e30ff";
const FRIGHT_BLINK = "#f0f0ff";
const WALL_HEIGHT = 3;

const POWERUP_COLOR: Record<PowerupKind, string> = {
  forcefield: "#39e0ff",
  doublebarrel: "#ff7a29",
  lantern: "#ffe14d",
};

const centerX = XMIN + (COLS - 1) / 2;
const centerZ = ZMIN + (ROWS - 1) / 2;

function FogController(): ReactNode {
  const scene = useThree((state) => state.scene);
  const fog = useMemo(() => new Fog(FOG_COLOR, FOG_NEAR, getFogFar()), []);
  const bg = useMemo(() => new Color(FOG_COLOR), []);
  useFrame((_, dt) => {
    scene.fog = fog;
    scene.background = bg;
    const target = getFogFar();
    fog.far += (target - fog.far) * (1 - Math.exp(-3 * dt));
    fog.near = FOG_NEAR;
  });
  return null;
}

function PlayerTorch(): ReactNode {
  const light = useRef<PointLight>(null);
  const camera = useThree((state) => state.camera);
  useFrame((state) => {
    if (light.current === null) return;
    light.current.position.copy(camera.position);
    const lantern = getLanternRemaining() > 0;
    const flicker = 0.9 + Math.sin(state.clock.elapsedTime * 27) * 0.05 + Math.sin(state.clock.elapsedTime * 8.3) * 0.05;
    light.current.intensity = (lantern ? 5.5 : 2.6) * flicker;
    light.current.distance = getFogFar() + 4;
  });
  return <pointLight ref={light} color="#9fb4d8" decay={1.4} />;
}

export function MazeEnvironment(): ReactNode {
  return (
    <group>
      <FogController />
      <PlayerTorch />
      <mesh rotation-x={-Math.PI / 2} position={[centerX, -0.02, centerZ]}>
        <planeGeometry args={[COLS + 2, ROWS + 2]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.95} metalness={0.05} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[centerX, WALL_HEIGHT, centerZ]}>
        <planeGeometry args={[COLS + 2, ROWS + 2]} />
        <meshStandardMaterial color={CEIL_COLOR} roughness={1} metalness={0} />
      </mesh>
      {wallCells.map((cell) => {
        const [x, , z] = cellToWorld(cell.c, cell.r);
        return (
          <mesh key={`${cell.c}-${cell.r}`} position={[x, WALL_HEIGHT / 2, z]}>
            <boxGeometry args={[0.98, WALL_HEIGHT, 0.98]} />
            <meshStandardMaterial color={WALL_COLOR} roughness={0.92} metalness={0.08} />
          </mesh>
        );
      })}
    </group>
  );
}

function Pellet({ x, z, r, color }: { x: number; z: number; r: number; color: string }): ReactNode {
  return (
    <mesh position={[x, 0.35, z]}>
      <sphereGeometry args={[r, 10, 10]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function PowerPellet({ x, z }: { x: number; z: number }): ReactNode {
  const ref = useRef<Mesh>(null);
  useFrame((state) => {
    if (ref.current === null) return;
    const s = 1 + Math.sin(state.clock.elapsedTime * 6) * 0.22;
    ref.current.scale.setScalar(s);
  });
  return (
    <mesh ref={ref} position={[x, 0.4, z]}>
      <sphereGeometry args={[0.24, 14, 14]} />
      <meshBasicMaterial color={POWER_COLOR} />
    </mesh>
  );
}

function PowerupPickup({ x, z, kind }: { x: number; z: number; kind: PowerupKind }): ReactNode {
  const ref = useRef<Group>(null);
  const color = POWERUP_COLOR[kind];
  useFrame((state) => {
    if (ref.current === null) return;
    ref.current.rotation.y = state.clock.elapsedTime * 1.6;
    ref.current.position.y = 0.55 + Math.sin(state.clock.elapsedTime * 2.4) * 0.12;
  });
  return (
    <group ref={ref} position={[x, 0.55, z]}>
      <mesh>
        <octahedronGeometry args={[0.28, 0]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh scale={1.35}>
        <octahedronGeometry args={[0.28, 0]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} wireframe />
      </mesh>
      <pointLight color={color} intensity={1.4} distance={3.2} decay={1.6} />
    </group>
  );
}

function ForceFieldBubble(): ReactNode {
  const ctx = useGameContext();
  const { userId } = usePlayer();
  const ref = useRef<Mesh>(null);
  useFrame((state) => {
    const mesh = ref.current;
    if (mesh === null) return;
    const active = getForcefieldRemaining() > 0;
    mesh.visible = active;
    if (!active) return;
    const entity = ctx.scene.entity.get(userId);
    if (entity !== null) mesh.position.set(entity.position[0], 1, entity.position[2]);
    const s = 0.95 + Math.sin(state.clock.elapsedTime * 5) * 0.06;
    mesh.scale.setScalar(s);
  });
  return (
    <mesh ref={ref} visible={false}>
      <sphereGeometry args={[1.15, 20, 16]} />
      <meshBasicMaterial color={POWERUP_COLOR.forcefield} transparent opacity={0.16} wireframe />
    </mesh>
  );
}

function MuzzleFlash(): ReactNode {
  const light = useRef<PointLight>(null);
  const camera = useThree((state) => state.camera);
  useFrame(() => {
    if (light.current === null) return;
    const flash = getMuzzleFlash();
    light.current.intensity = flash * 14;
    if (flash > 0) {
      light.current.position.copy(camera.position);
      light.current.translateZ(-1.2);
    }
  });
  return <pointLight ref={light} color="#ffd27a" intensity={0} distance={9} decay={1.3} />;
}

export function PelletOverlay(): ReactNode {
  useSceneEntities();
  const pellets = remainingPelletCells();
  const powers = remainingPowerCells();
  const powerups = remainingPowerups();
  return (
    <group>
      {pellets.map((cell) => {
        const [x, , z] = cellToWorld(cell.c, cell.r);
        return <Pellet key={`p-${cell.c}-${cell.r}`} x={x} z={z} r={0.1} color={PELLET_COLOR} />;
      })}
      {powers.map((cell) => {
        const [x, , z] = cellToWorld(cell.c, cell.r);
        return <PowerPellet key={`o-${cell.c}-${cell.r}`} x={x} z={z} />;
      })}
      {powerups.map((spawn) => {
        const [x, , z] = cellToWorld(spawn.c, spawn.r);
        return <PowerupPickup key={`u-${spawn.c}-${spawn.r}`} x={x} z={z} kind={spawn.kind} />;
      })}
      <ForceFieldBubble />
      <MuzzleFlash />
    </group>
  );
}

const ghostColorByKind: Record<string, string> = {};
for (const ghost of GHOSTS) ghostColorByKind[ghost.kind] = ghost.color;

function Ghost({ entity }: { entity: SceneEntity }): ReactNode {
  const mode = ghostModeOf(entity.id);
  const frightened = mode === "frightened";
  const eaten = mode === "eaten";
  const blink = frightened && getFrightenedRemaining() < 2 && Math.floor(getFrightenedRemaining() * 6) % 2 === 0;
  const kindColor = ghostColorByKind[entity.name] ?? "#cccccc";
  const body = frightened ? (blink ? FRIGHT_BLINK : FRIGHT_COLOR) : kindColor;
  const eyeColor = eaten || (!frightened && !eaten) ? EYE_MENACE : "#ffd7a0";
  const menacing = !frightened && !eaten;
  return (
    <group position-y={0.42}>
      {!eaten ? (
        <>
          <mesh position-y={0.06}>
            <sphereGeometry args={[0.4, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={body} emissive={body} emissiveIntensity={frightened ? 0.4 : 0.12} roughness={0.7} />
          </mesh>
          <mesh position-y={-0.04}>
            <cylinderGeometry args={[0.4, 0.4, 0.34, 18]} />
            <meshStandardMaterial color={body} emissive={body} emissiveIntensity={frightened ? 0.4 : 0.12} roughness={0.7} />
          </mesh>
        </>
      ) : null}
      <mesh position={[-0.15, 0.12, 0.32]} rotation-z={menacing ? 0.4 : 0}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color={eyeColor} fog={!menacing} />
      </mesh>
      <mesh position={[0.15, 0.12, 0.32]} rotation-z={menacing ? -0.4 : 0}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color={eyeColor} fog={!menacing} />
      </mesh>
      {menacing ? <pointLight color={EYE_MENACE} intensity={1.1} distance={4} decay={1.8} position={[0, 0.12, 0.3]} /> : null}
    </group>
  );
}

export function renderMazeEntity(entity: SceneEntity): ReactNode {
  if (entity.name === MUNCHER) return <group />;
  if (ghostColorByKind[entity.name] !== undefined) return <Ghost entity={entity} />;
  return null;
}
