import type { ReactNode } from "react";

import { defineGameDefinition, type PhysicsConfig } from "@jgengine/core/game/defineGame";
import type { PlayerMovementConfig } from "@jgengine/core/game/playableGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

interface WalkFeel {
  name: string;
  label: string;
  color: string;
  walkSpeed: number;
  movement: PlayerMovementConfig;
  physics: PhysicsConfig;
}

// The two characters differ only in these numbers; the engine walk controller does the rest.
export const FLOATY_FEEL: WalkFeel = {
  name: "walk-floaty",
  label: "Floaty platformer",
  color: "#f472b6",
  walkSpeed: 3,
  movement: { feel: { groundAcceleration: 30, airAcceleration: 25, groundFriction: 20, jumpBufferMs: 150, coyoteMs: 120 } },
  physics: { gravity: -12, jumpVelocity: 7 },
};

export const WEIGHTY_FEEL: WalkFeel = {
  name: "walk-weighty",
  label: "Weighty shooter",
  color: "#64748b",
  walkSpeed: 3,
  movement: { feel: { groundAcceleration: 10, airAcceleration: 1.5, groundFriction: 8 } },
  physics: { gravity: -32, jumpVelocity: 6 },
};

function Stage({ color }: { color: string }): ReactNode {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#3f5f3a" roughness={0.95} />
      </mesh>
      <gridHelper args={[80, 80, "#1f2f1c", "#2c4428"]} position={[0, 0.01, 0]} />
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-1.5, 0.5 + i * 0.25, i * 2]} castShadow>
          <boxGeometry args={[0.4, 1 + i * 0.5, 0.4]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      ))}
    </>
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
    environment: () => <Stage color={feel.color} />,
    GameUI: () => (
      <div className="pointer-events-none absolute left-5 top-5 rounded-lg bg-black/60 px-4 py-3 font-sans text-sm text-white">
        <div className="text-base font-semibold">{feel.label}</div>
        <div className="opacity-80">
          gravity {-(feel.physics.gravity ?? 0)} · jump {feel.physics.jumpVelocity} · air {feel.movement.feel?.airAcceleration}
        </div>
      </div>
    ),
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
