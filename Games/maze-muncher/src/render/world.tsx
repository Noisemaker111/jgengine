import type { ReactNode } from "react";
import { useRef } from "react";
import type { Mesh } from "three";
import { useFrame } from "@react-three/fiber";

import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useSceneEntities } from "@jgengine/react/hooks";

import { MUNCHER } from "../catalog";
import { cellToWorld, COLS, GHOSTS, ROWS, wallCells, XMIN, ZMIN } from "../maze";
import { getFrightenedRemaining, ghostModeOf, remainingPelletCells, remainingPowerCells } from "../loop";

const WALL_COLOR = "#2222d6";
const FLOOR_COLOR = "#05010f";
const PELLET_COLOR = "#ffd7a0";
const FRIGHT_COLOR = "#1e30ff";
const FRIGHT_BLINK = "#f0f0ff";

const centerX = XMIN + (COLS - 1) / 2;
const centerZ = ZMIN + (ROWS - 1) / 2;

export function MazeEnvironment(): ReactNode {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[centerX, -0.02, centerZ]}>
        <planeGeometry args={[COLS + 2, ROWS + 2]} />
        <meshBasicMaterial color={FLOOR_COLOR} />
      </mesh>
      {wallCells.map((cell) => {
        const [x, , z] = cellToWorld(cell.c, cell.r);
        return (
          <mesh key={`${cell.c}-${cell.r}`} position={[x, 0.4, z]}>
            <boxGeometry args={[0.92, 0.8, 0.92]} />
            <meshBasicMaterial color={WALL_COLOR} />
          </mesh>
        );
      })}
    </group>
  );
}

function Pellet({ x, z, r, color }: { x: number; z: number; r: number; color: string }): ReactNode {
  return (
    <mesh position={[x, 0.3, z]}>
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
    <mesh ref={ref} position={[x, 0.32, z]}>
      <sphereGeometry args={[0.26, 14, 14]} />
      <meshBasicMaterial color={PELLET_COLOR} />
    </mesh>
  );
}

export function PelletOverlay(): ReactNode {
  useSceneEntities();
  const pellets = remainingPelletCells();
  const powers = remainingPowerCells();
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
    </group>
  );
}

const ghostColorByKind: Record<string, string> = {};
for (const ghost of GHOSTS) ghostColorByKind[ghost.kind] = ghost.color;

function Muncher(): ReactNode {
  return (
    <mesh position-y={0.45}>
      <sphereGeometry args={[0.44, 20, 16]} />
      <meshBasicMaterial color="#ffe11a" />
    </mesh>
  );
}

function Ghost({ entity }: { entity: SceneEntity }): ReactNode {
  const mode = ghostModeOf(entity.id);
  const frightened = mode === "frightened";
  const eaten = mode === "eaten";
  const blink = frightened && getFrightenedRemaining() < 2 && Math.floor(getFrightenedRemaining() * 6) % 2 === 0;
  const body = eaten ? "#0a0a1e" : frightened ? (blink ? FRIGHT_BLINK : FRIGHT_COLOR) : (ghostColorByKind[entity.name] ?? "#cccccc");
  const eyeColor = frightened && !blink ? "#ffd7a0" : "#ffffff";
  return (
    <group position-y={0.42}>
      {!eaten ? (
        <>
          <mesh position-y={0.06}>
            <sphereGeometry args={[0.4, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshBasicMaterial color={body} />
          </mesh>
          <mesh position-y={-0.04}>
            <cylinderGeometry args={[0.4, 0.4, 0.34, 18]} />
            <meshBasicMaterial color={body} />
          </mesh>
        </>
      ) : null}
      <mesh position={[-0.15, 0.12, 0.32]}>
        <sphereGeometry args={[0.11, 10, 10]} />
        <meshBasicMaterial color={eyeColor} />
      </mesh>
      <mesh position={[0.15, 0.12, 0.32]}>
        <sphereGeometry args={[0.11, 10, 10]} />
        <meshBasicMaterial color={eyeColor} />
      </mesh>
    </group>
  );
}

export function renderMazeEntity(entity: SceneEntity): ReactNode {
  if (entity.name === MUNCHER) return <Muncher />;
  if (ghostColorByKind[entity.name] !== undefined) return <Ghost entity={entity} />;
  return null;
}
