import { type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createLeaderboard } from "@jgengine/core/game/leaderboard";
import { rankLeaderboard } from "@jgengine/core/game/leaderboardRank";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { Scoreboard, type ScoreboardTheme } from "@jgengine/react/scoreboard";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";
const YOU = "you";

// Build the ranked-score store the model already ships, track one stat, and score
// eight players — including a tie (Nova & Pyre at 640) and the local "you" entry.
const board = createLeaderboard();
board.track({ stat: "score", scope: "global" });
const SCORES: { userId: string; label: string; score: number }[] = [
  { userId: "kestrel", label: "Kestrel", score: 920 },
  { userId: "vega", label: "Vega", score: 815 },
  { userId: "nova", label: "Nova", score: 640 },
  { userId: "pyre", label: "Pyre", score: 640 },
  { userId: YOU, label: "You", score: 570 },
  { userId: "juno", label: "Juno", score: 430 },
  { userId: "orin", label: "Orin", score: 295 },
  { userId: "sable", label: "Sable", score: 150 },
];
for (const { userId, score } of SCORES) {
  board.increment(userId, "score", { scope: "global", by: score });
}
const LABELS = new Map(SCORES.map((entry) => [entry.userId, entry.label] as const));

// snapshot() → rankLeaderboard() with the local player highlighted and top-3 medals.
const ranked = rankLeaderboard(board.snapshot(), { highlightUserId: YOU, tieMode: "standard" });

const scoreboardTheme: ScoreboardTheme = {
  bg: "linear-gradient(180deg, rgba(24,20,40,0.95), rgba(12,10,22,0.97))",
  border: "1px solid rgba(168,130,255,0.35)",
  radius: "14px",
  accent: "#c084fc",
  localBg: "rgba(192,132,252,0.18)",
};

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "scoreboard" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#241a3a", "#6b4aa0"], seed: "scoreboard" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "scoreboard",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

function ScoreboardUI(): ReactNode {
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div style={{ position: "absolute", top: 28, left: "50%", transform: "translateX(-50%)" }}>
        <Scoreboard
          entries={ranked}
          title="Top Runners"
          scoreLabel="Points"
          theme={scoreboardTheme}
          nameFor={(entry) => LABELS.get(entry.userId) ?? entry.label ?? entry.userId}
          formatScore={(value) => value.toLocaleString()}
          style={{ minWidth: 320 }}
        />
      </div>
    </div>
  );
}

export const scoreboardDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: ScoreboardUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
