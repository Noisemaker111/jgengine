import { useEffect, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createEventTicker } from "@jgengine/core/game/eventTicker";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { KillFeed, type KillFeedKindStyle } from "@jgengine/react/killFeed";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

// A long ttl so pre-pushed entries stay visible (but visibly fading) through capture,
// which can span a minute-plus of wall-clock between mount and the captured frame.
const TTL_MS = 600_000;
const ticker = createEventTicker({ limit: 8, ttlMs: TTL_MS });

// Per-kind accent + icon — the model never sees any of this.
const kindStyles: Record<string, KillFeedKindStyle> = {
  kill: { accent: "#f87171", icon: "skull" },
  assist: { accent: "#fbbf24", icon: "swap" },
  info: { accent: "#38bdf8", icon: "flag" },
  objective: { accent: "#4ade80", icon: "star" },
};

const KILLS = [
  "Ranger eliminated Marauder",
  "Vanguard headshot Scout",
  "Reaper double-killed Sentry",
];
const ASSISTS = ["Medic assisted Ranger", "Sniper assisted Vanguard"];
const INFO = ["Wave 3 cleared", "Supply drop inbound", "Point B captured"];

let filled = false;

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "killfeed" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#1f3320", "#5f8a3a"], seed: "killfeed" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "kill-feed",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
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

const pick = (list: readonly string[]): string => list[Math.floor(Math.random() * list.length)]!;

function KillFeedUI(): ReactNode {
  // Pre-push a few entries with staggered ages (via snapshot back-dating) so the very first
  // frame shows a populated, visibly-fading ticker rather than an empty stack.
  useEffect(() => {
    if (filled) return;
    filled = true;
    const now = Date.now();
    ticker.restore({
      now,
      nextId: 5,
      entries: [
        { id: 1, at: now - 240_000, kind: "info", text: "Match started", icon: undefined },
        { id: 2, at: now - 150_000, kind: "kill", text: "Reaper eliminated Grunt", icon: undefined },
        { id: 3, at: now - 70_000, kind: "assist", text: "Medic assisted Reaper", icon: undefined },
        { id: 4, at: now - 15_000, kind: "kill", text: "Ranger eliminated Marauder", icon: undefined },
      ],
    });
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div style={{ position: "absolute", top: 20, right: 20, width: 260 }}>
        <KillFeed ticker={ticker} kindStyles={kindStyles} />
      </div>
      <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 12 }}>
        <button type="button" style={hudButton} onClick={() => ticker.push({ kind: "kill", text: pick(KILLS) })}>
          💀 Kill
        </button>
        <button type="button" style={hudButton} onClick={() => ticker.push({ kind: "assist", text: pick(ASSISTS) })}>
          🤝 Assist
        </button>
        <button type="button" style={hudButton} onClick={() => ticker.push({ kind: "info", text: pick(INFO) })}>
          📣 Info
        </button>
        <button type="button" style={hudButton} onClick={() => ticker.clear()}>
          🧹 Clear
        </button>
      </div>
    </div>
  );
}

export const killFeedDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: KillFeedUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
