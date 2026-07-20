import { useEffect, useMemo, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createComboMeter, type ComboTier } from "@jgengine/core/combat/comboMeter";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { ComboMeterHud } from "@jgengine/react/comboMeter";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

// Free-string tiers on the integer chain — the model never interprets these ids.
const TIERS: readonly ComboTier[] = [
  { threshold: 5, id: "good", multiplier: 1.5 },
  { threshold: 12, id: "great", multiplier: 2.5 },
  { threshold: 24, id: "savage", multiplier: 4 },
];

// Game-owned per-tier colors, keyed on the free-string tier id.
const TIER_COLORS: Record<string, string> = {
  good: "#4ade80",
  great: "#f9b23c",
  savage: "#ff4d6d",
};

// A long window so the rAF-driven drain stays legible (and populated) through the
// capture settle — a real HIT re-arms it to full; the bar then bleeds back down.
const combo = createComboMeter({ windowMs: 120_000, tiers: TIERS, count: 18 });

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "combo" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#1e2a3a", "#3a6ea5"], seed: "combo" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "combo-meter",
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
  fontSize: 14,
  fontWeight: 700,
  padding: "12px 18px",
  cursor: "pointer",
};

function ComboMeterUI(): ReactNode {
  // Seed a big "great"-tier chain with a partly-drained window so the still frame
  // clearly shows ×N, the tier label, the multiplier, and a bar mid-drain. The
  // hook's rAF loop keeps bleeding the window down live; HIT re-arms it to full.
  useEffect(() => {
    combo.restore({ count: 18, peak: 18, remainingMs: 78_000, tier: "great" });
  }, []);

  const panelStyle = useMemo<CSSProperties>(
    () => ({
      position: "absolute",
      top: 28,
      left: 28,
      padding: "18px 22px",
      borderRadius: 14,
      background: "rgba(10,14,20,0.72)",
      border: "1px solid rgba(148,163,184,0.22)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
    }),
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div style={panelStyle}>
        <ComboMeterHud meter={combo} tierColors={TIER_COLORS} barWidth={260} />
      </div>
      <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 12 }}>
        <button type="button" style={hudButton} onClick={() => combo.hit("strike")}>
          ⚔️ HIT
        </button>
        <button type="button" style={hudButton} onClick={() => combo.reset()}>
          ✖ Reset
        </button>
      </div>
    </div>
  );
}

export const comboMeterDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: ComboMeterUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
