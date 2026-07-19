import { useEffect, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createObjectiveBanner } from "@jgengine/core/ui/objectiveBanner";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { ObjectiveBannerHost, type ObjectiveBannerTheme } from "@jgengine/react/objectiveBanner";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

// One shared controller the HUD announces onto and the host renders.
const banners = createObjectiveBanner();

// Per-kind color so each announcement reads differently — the model never sees this.
const kindThemes: Record<string, ObjectiveBannerTheme> = {
  wave: { accent: "#38bdf8", title: "#e0f2fe" },
  victory: { accent: "#4ade80", title: "#dcfce7" },
  objective: { accent: "#fbbf24", title: "#fef9c3" },
};

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "banner" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#26401a", "#7fb04a"], seed: "banner" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "objective-banner",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

// Announce the opening banner exactly once when the HUD first mounts (not at scene
// init, which can run many seconds before the frame is drawn). A long hold keeps it
// centered through capture and while the reader looks at it.
let openingAnnounced = false;

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

function ObjectiveBannerUI(): ReactNode {
  useEffect(() => {
    if (openingAnnounced) return;
    openingAnnounced = true;
    banners.announce({ title: "WAVE 3", subtitle: "Defend the core", kind: "wave", inMs: 320, holdMs: 120_000, outMs: 600 });
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 12 }}>
        <button
          type="button"
          style={hudButton}
          onClick={() => banners.announce({ title: "VICTORY", subtitle: "All waves cleared", kind: "victory" })}
        >
          🏆 Victory
        </button>
        <button
          type="button"
          style={hudButton}
          onClick={() => banners.announce({ title: "OBJECTIVE COMPLETE", subtitle: "Core defended", kind: "objective" })}
        >
          ✅ Objective
        </button>
        <button type="button" style={hudButton} onClick={() => banners.skip()}>
          ⏭️ Skip
        </button>
      </div>
      <ObjectiveBannerHost controller={banners} kindThemes={kindThemes} />
    </div>
  );
}

export const objectiveBannerDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: ObjectiveBannerUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
