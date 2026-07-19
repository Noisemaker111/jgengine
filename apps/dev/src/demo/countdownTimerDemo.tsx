import { type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createTimerSet } from "@jgengine/core/time/timerSet";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { TimerReadout, TimerRing } from "@jgengine/react/timerReadout";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const RUNNER = "runner";

// One TimerSet drives every clock on screen — a round countdown, a respawn clock,
// and an ability charge ring. Ids are free strings with no genre meaning.
const timers = createTimerSet();

// Seed the timers already mid-flight so a screenshot at settle shows live values.
// The set's clock is Date.now; restoring a snapshot banks the desired elapsed and
// re-anchors running timers to now. The round clock keeps ticking (live mm:ss);
// the two rings are seeded paused at a chosen partial so a demo capture at any
// instant shows a stable mid-arc fill instead of a wrap boundary.
timers.restore({
  timers: [
    { id: "round", durationMs: 180_000, direction: "down", loop: false, elapsedMs: 72_000, running: true, fired: false },
    { id: "respawn", durationMs: 10_000, direction: "down", loop: false, elapsedMs: 3_400, running: false, fired: false },
    { id: "charge", durationMs: 6_000, direction: "up", loop: false, elapsedMs: 4_200, running: false, fired: false },
  ],
});

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "timer" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#243b1a", "#7fae43"], seed: "timer" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [RUNNER]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "countdown-timer",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(RUNNER, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

const panel: CSSProperties = {
  pointerEvents: "auto",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.25)",
  background: "linear-gradient(160deg, rgba(20,24,32,0.92), rgba(11,14,19,0.92))",
  padding: "12px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  alignItems: "center",
};

const label: CSSProperties = {
  fontSize: 11,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "#94a3b8",
  fontWeight: 700,
};

function CountdownTimerUI(): ReactNode {
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white" style={{ ["--jg-accent" as string]: "#38bdf8" }}>
      {/* Round timer, top-center — big mm:ss readout. */}
      <div style={{ position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)", ...panel }}>
        <span style={label}>Round</span>
        <TimerReadout timer={timers} id="round" style={{ fontSize: 34 }} />
      </div>

      {/* Respawn + ability charge rings, bottom-center. */}
      <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 28 }}>
        <div style={panel}>
          <span style={label}>Respawn</span>
          <TimerRing timer={timers} id="respawn" mode="drain" size={84} color="#f97316">
            <TimerReadout timer={timers} id="respawn" format="ss.d" style={{ fontSize: 18 }} />
          </TimerRing>
        </div>
        <div style={panel}>
          <span style={label}>Overdrive</span>
          <TimerRing timer={timers} id="charge" mode="fill" size={84}>
            <TimerReadout timer={timers} id="charge" source="elapsed" format="ss.d" style={{ fontSize: 18 }} />
          </TimerRing>
        </div>
      </div>
    </div>
  );
}

export const countdownTimerDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: CountdownTimerUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
