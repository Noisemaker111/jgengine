import { type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { defineSystem } from "@jgengine/core/game/defineSystem";
import { createOnboardingSystem } from "@jgengine/core/onboarding/onboardingSystem";
import { OnboardingCallout } from "@jgengine/core/onboarding/onboardingCallout.view";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { useGame } from "@jgengine/react/hooks";

import { EnvironmentScene } from "@jgengine/core/environment/EnvironmentScene.draw";
import type { PlayableGame } from "@jgengine/shell/registry";

const SCOUT = "scout";

const arena = perContext(() => ({ entered: false }));

/** A UI tour as onboarding steps: two anchored Next cards, then one that waits for the arena. */
const tour = createOnboardingSystem({
  id: "hud-tour",
  title: "HUD tour",
  style: "blended",
  steps: [
    { id: "bag", text: "Your bag", detail: "Open your inventory here to inspect loot and manage gear.", anchor: "#bag-button", placement: "top", done: { next: true } },
    { id: "map", text: "World map", detail: "Track objectives and fast-travel points from the map.", anchor: "#map-button", placement: "top", done: { next: true } },
    {
      id: "arena",
      text: "Enter the arena",
      detail: "Enemies wait inside. This step finishes once you go in.",
      anchor: "#arena-button",
      placement: "top",
      done: { when: (ctx) => arena(ctx).entered },
    },
  ],
});

const arenaDoor = defineSystem({
  id: "arena-door",
  tick: { type: "manual" },
  create(ctx) {
    ctx.game.commands.define("enterArena", { apply: (state) => ((arena(state).entered = true), state) });
  },
});

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "coach" }),
  vegetation: grass({ area: { w: 52, d: 52 }, colour: { baseColor: "#2f4f1e", tipColor: "#8fbf4a" }, seed: "coach" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [SCOUT]: { movement: { walkSpeed: 6 }, role: "player" },
};

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(SCOUT, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

const game = defineGameDefinition({
  name: "coach-marks",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
  systems: [arenaDoor, tour],
  loop: { onNewPlayer },
});

const hudButton: CSSProperties = {
  pointerEvents: "auto",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(17,22,30,0.85)",
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 600,
  padding: "10px 14px",
  cursor: "pointer",
};

function CoachMarksUI(): ReactNode {
  const { commands } = useGame();
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      {/* A small HUD the tour points at. */}
      <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 12 }}>
        <button id="bag-button" type="button" style={hudButton}>🎒 Bag</button>
        <button id="map-button" type="button" style={hudButton}>🗺️ Map</button>
        <button id="arena-button" type="button" style={hudButton} onClick={() => void commands.run("enterArena", {})}>
          ⚔️ Enter arena
        </button>
      </div>
      <OnboardingCallout />
    </div>
  );
}

// The composed loop runs the tour and arena-door systems; the demo shell wants every hook present.
const composed = game.loop;

export const coachMarksDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: {
    onInit: (ctx) => composed?.onInit?.(ctx),
    onNewPlayer: (ctx, player) => composed?.onNewPlayer?.(ctx, player),
    onTick: (ctx, dt) => composed?.onTick?.(ctx, dt),
    onReset: (ctx) => composed?.onReset?.(ctx),
    onDispose: (ctx) => composed?.onDispose?.(ctx),
  },
  GameUI: CoachMarksUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: {
    orbit: {
      initialDistance: 26,
      initialHeight: 20,
      minDistance: 12,
      maxDistance: 52,
      targetHeight: 0,
      maxPolarAngle: 1.3,
    },
  },
};
