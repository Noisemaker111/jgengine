import type { ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { measureMovement } from "@jgengine/core/movement/movementProbe";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { PlayableGame } from "@jgengine/shell/registry";

import { FLOATY_FEEL, WEIGHTY_FEEL, type WalkFeel } from "./walkFeelTuning";

const HERO = "hero";

function Stage({ color }: { color: string }): ReactNode {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#4b6b3f" roughness={0.95} />
      </mesh>
      <gridHelper args={[80, 80, "#2c4428", "#3b5a33"]} position={[0, 0.01, 0]} />
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[-1.2, 1, i * 2]} castShadow>
          <boxGeometry args={[0.15, 2, 0.15]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      ))}
      {[0.5, 1, 1.5, 2].map((height) => (
        <mesh key={height} position={[-1.2, height, 11]}>
          <boxGeometry args={[0.1, 0.03, 22]} />
          <meshStandardMaterial color="#f8fafc" transparent opacity={0.5} />
        </mesh>
      ))}
    </>
  );
}

function FeelPanel({ feel }: { feel: WalkFeel }): ReactNode {
  const report = measureMovement(feel);
  const rows: [string, string][] = [
    ["jump height", `${report.jumpHeight.toFixed(2)} m (tap ${report.tapJumpHeight.toFixed(2)} m)`],
    ["air time", `${report.airTime.toFixed(2)} s`],
    ["air control", `${report.airControlReach.toFixed(2)} m`],
    ["to top speed", `${report.timeToTopSpeed.toFixed(2)} s`],
    ["stop distance", `${report.stopDistance.toFixed(2)} m`],
  ];
  return (
    <div className="pointer-events-none absolute left-5 top-5 rounded-lg bg-black/65 px-4 py-3 font-sans text-sm text-white">
      <div className="mb-1 text-base font-semibold">{feel.label}</div>
      {rows.map(([name, value]) => (
        <div key={name} className="flex justify-between gap-6">
          <span className="opacity-70">{name}</span>
          <span className="tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  );
}

function makeWalkFeelGame(feel: WalkFeel): PlayableGame {
  const entityCatalog: Record<string, GameContextEntityEntry> = {
    [HERO]: { movement: { walkSpeed: feel.walkSpeed }, role: "player" },
  };
  let context: GameContext | null = null;
  return {
    game: defineGameDefinition({
      name: feel.name,
      assets: createAssetCatalog(),
      multiplayer: null,
      inventories: {},
      physics: feel.physics,
      input: {
        moveForward: ["KeyW"],
        moveBack: ["KeyS"],
        moveLeft: ["KeyA"],
        moveRight: ["KeyD"],
        sprint: ["ShiftLeft"],
        jump: ["Space"],
      },
    }),
    content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
    loop: {
      onInit: (ctx) => {
        context = ctx;
      },
      onNewPlayer: (ctx) => {
        context = ctx;
        ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
      },
      onTick: () => {},
      onReset: () => {},
      onDispose: () => {
        context = null;
      },
    },
    movement: feel.movement,
    backdrop: { background: "#a9c8e6" },
    environment: () => <Stage color={feel.color} />,
    GameUI: () => <FeelPanel feel={feel} />,
    camera: { initialDistance: 9, initialHeight: 3.5, minDistance: 5, maxDistance: 20, targetHeight: 1 },
    capture: {
      probe: (): Record<string, number> => {
        const hero = context?.scene.entity.get(context.player.userId);
        if (hero === null || hero === undefined) return {};
        return { x: hero.position[0], y: hero.position[1], z: hero.position[2] };
      },
    },
  };
}

export const walkFloatyDemoGame: PlayableGame = makeWalkFeelGame(FLOATY_FEEL);
export const walkWeightyDemoGame: PlayableGame = makeWalkFeelGame(WEIGHTY_FEEL);
