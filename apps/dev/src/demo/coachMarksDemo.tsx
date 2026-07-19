import { type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createCoachMarkSequence } from "@jgengine/core/ui/coachMarks";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { CoachMarkHost } from "@jgengine/react/coachMarks";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const SCOUT = "scout";

const tour = createCoachMarkSequence({
  steps: [
    {
      id: "bag",
      title: "Your bag",
      body: "Open your inventory here to inspect loot and manage gear.",
      anchor: "#bag-button",
      placement: "top",
    },
    {
      id: "map",
      title: "World map",
      body: "Track objectives and fast-travel points from the map.",
      anchor: "#map-button",
      placement: "top",
    },
    {
      id: "combat",
      title: "You're in the fight",
      body: "Enemies nearby — use the action bar to attack. This step unlocks once combat begins.",
      condition: "entered-arena",
    },
  ],
});

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "coach" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "coach" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [SCOUT]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "coach-marks",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(SCOUT, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

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
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      {/* A small HUD the tour points at. */}
      <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 12 }}>
        <button id="bag-button" type="button" style={hudButton}>🎒 Bag</button>
        <button id="map-button" type="button" style={hudButton}>🗺️ Map</button>
        <button
          id="arena-button"
          type="button"
          style={hudButton}
          onClick={() => tour.satisfy("entered-arena")}
        >
          ⚔️ Enter arena
        </button>
      </div>
      <CoachMarkHost sequence={tour} />
    </div>
  );
}

export const coachMarksDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: CoachMarksUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
