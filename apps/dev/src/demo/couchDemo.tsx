import type { ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { ViewportsConfig } from "@jgengine/core/game/viewports";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { localPlayers } from "@jgengine/core/runtime/localPlayers";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { useGameContext } from "@jgengine/react/provider";
import { ViewportHuds } from "@jgengine/shell/camera/Viewports";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";
const SEAT_COLORS = ["#f97316", "#38bdf8", "#a3e635", "#e879f9"];
const VIEWPORTS: ViewportsConfig = { layout: "auto", split: "vertical" };

// Pillars in the seat colours so each split-screen view reads differently.
function Stage(): ReactNode {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#4b6b3f" roughness={0.95} />
      </mesh>
      <gridHelper args={[80, 40, "#2c4428", "#3b5a33"]} position={[0, 0.01, 0]} />
      {Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(angle) * 12, 1.5, Math.sin(angle) * 12]} castShadow>
            <boxGeometry args={[1, 3, 1]} />
            <meshStandardMaterial color={SEAT_COLORS[i % SEAT_COLORS.length]} roughness={0.6} />
          </mesh>
        );
      })}
    </>
  );
}

function SeatHud(): ReactNode {
  const ctx = useGameContext();
  return (
    <ViewportHuds ctx={ctx} config={VIEWPORTS}>
      {(slot) => {
        return (
          <div className="absolute left-3 top-3 rounded bg-black/60 px-3 py-2 font-mono text-xs text-white">
            <div className="text-base font-bold" style={{ color: SEAT_COLORS[slot.index % SEAT_COLORS.length] }}>
              P{slot.index + 1}
            </div>
            <div className="opacity-70">{slot.deviceId ?? "keyboard"}</div>
          </div>
        );
      }}
    </ViewportHuds>
  );
}

function makeCouchGame(): PlayableGame {
  const entityCatalog: Record<string, GameContextEntityEntry> = {
    [HERO]: { movement: { walkSpeed: 5 }, role: "player" },
  };
  let context: GameContext | null = null;
  return {
    game: defineGameDefinition({
      name: "couch",
      assets: createAssetCatalog(),
      multiplayer: null,
      inventories: {},
      input: {
        moveForward: ["KeyW", "padaxis:1-"],
        moveBack: ["KeyS", "padaxis:1+"],
        moveLeft: ["KeyA", "padaxis:0-"],
        moveRight: ["KeyD", "padaxis:0+"],
        sprint: ["ShiftLeft", "pad:10"],
        jump: ["Space", "pad:0"],
      },
    }),
    content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
    loop: {
      onInit: (ctx) => {
        context = ctx;
      },
      onNewPlayer: (ctx, player) => {
        context = ctx;
        const userId = player?.userId ?? ctx.player.userId;
        const seat = localPlayers(ctx).slots().find((slot) => slot.userId === userId)?.index ?? 0;
        ctx.scene.entity.spawn(HERO, { id: userId, position: [seat * 4, 0, 0], role: "player" });
      },
      onTick: () => {},
      onReset: () => {},
      onDispose: () => {
        context = null;
      },
    },
    localPlayers: { maxSlots: 4 },
    viewports: VIEWPORTS,
    backdrop: { background: "#a9c8e6" },
    environment: () => <Stage />,
    GameUI: SeatHud,
    camera: { rig: "topDown", topDown: { height: 12, pitch: 0.9 } },
    capture: {
      probe: (): Record<string, number> => {
        if (context === null) return {};
        const out: Record<string, number> = { seats: localPlayers(context).slots().length };
        for (const slot of localPlayers(context).slots()) {
          const hero = context.scene.entity.get(slot.userId);
          if (hero !== null) {
            out[`p${slot.index + 1}x`] = hero.position[0];
            out[`p${slot.index + 1}z`] = hero.position[2];
          }
        }
        return out;
      },
    },
  };
}

/** Local co-op probe: pads hot-join seats and the screen splits per seat (`bun run drive couch --param gamepad=2`). */
export const couchDemoGame: PlayableGame = makeCouchGame();
