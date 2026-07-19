import { useEffect, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createScreenEffects } from "@jgengine/core/vfx/screenEffects";
import { environment, grass, terrain } from "@jgengine/core/world/features";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import { ScreenEffectsOverlay } from "@jgengine/shell/postfx/ScreenEffectsOverlay";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

// The core model: a serializable, clock-driven screen-feedback controller. The
// game owns the `kind` labels ("damage", "heal", "low-health") and their colors;
// the model never interprets them.
const fx = createScreenEffects();

// A sustained low-health pulse is live from the start, so a settle screenshot
// always shows the red edge tint breathing over the scene.
fx.pulse("low-health", {
  color: "#ff2a2a",
  intensity: 0.85,
  minIntensity: 0.4,
  pulseHz: 0.8,
});

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "screenfx" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "screenfx" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "screen-effects",
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

function ScreenEffectsUI(): ReactNode {
  // A slow drumbeat of damage hits keeps the screen alive during a settle capture.
  useEffect(() => {
    const timer = setInterval(() => {
      fx.vignette("damage", { color: "#ff1e1e", intensity: 0.9, durationMs: 900 });
    }, 1400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <ScreenEffectsOverlay controller={fx} blendMode="screen" />
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 12,
        }}
      >
        <button
          type="button"
          style={hudButton}
          onClick={() => fx.vignette("damage", { color: "#ff1e1e", intensity: 1, durationMs: 700 })}
        >
          💥 Damage
        </button>
        <button
          type="button"
          style={hudButton}
          onClick={() => fx.flash("heal", { color: "#3ef07a", intensity: 0.8, durationMs: 600 })}
        >
          ✨ Heal
        </button>
        <button
          type="button"
          style={hudButton}
          onClick={() => fx.flash("stun", { color: "#ffd54a", intensity: 0.9, durationMs: 900, easing: "easeInOut" })}
        >
          ⚡ Stun
        </button>
      </div>
    </div>
  );
}

export const screenEffectsDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: ScreenEffectsUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
