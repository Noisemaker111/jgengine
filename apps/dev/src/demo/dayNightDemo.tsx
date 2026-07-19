import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createDayNightCycle, type DayNightKeyframe } from "@jgengine/core/time/dayNightCycle";
import { environment, grass, terrain } from "@jgengine/core/world/features";

import { DayNightSky } from "@jgengine/shell/environment/DayNightSky";
import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const WANDERER = "wanderer";

/** Free-form phase labels + tint/light colors — the model never interprets these strings. */
const KEYFRAMES: readonly DayNightKeyframe[] = [
  { at: 0, phase: "night", color: "#0b1026", lightColor: "#05060f", intensity: 0.18 },
  { at: 0.25, phase: "dawn", color: "#ffb37a", lightColor: "#3c5a82", intensity: 0.5 },
  { at: 0.5, phase: "day", color: "#e3f4ff", lightColor: "#3fa4f2", intensity: 1 },
  { at: 0.75, phase: "dusk", color: "#ff8a5c", lightColor: "#4a3a5c", intensity: 0.5 },
];

// ONE wired thing: a running clock plus color grading. Starts on a warm dusk and rolls
// slowly onward so any settle frame lands on a clearly tinted, non-noon sky.
const cycle = createDayNightCycle({ keyframes: KEYFRAMES, dayLengthMs: 600_000, start: 0.75 });

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 80, d: 80 }, height: 3, frequency: 0.03, seed: "daynight" }),
  vegetation: grass({ area: { w: 70, d: 70 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "daynight" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [WANDERER]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "day-night",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(WANDERER, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

const panel: CSSProperties = {
  position: "absolute",
  top: 20,
  left: 20,
  pointerEvents: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(12,16,22,0.82)",
  color: "#e2e8f0",
  padding: "14px 16px",
  minWidth: 180,
  fontSize: 13,
};

const button: CSSProperties = {
  pointerEvents: "auto",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(30,41,59,0.9)",
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 12px",
  cursor: "pointer",
};

function DayNightUI(): ReactNode {
  const [phase, setPhase] = useState(cycle.phase());
  const [fraction, setFraction] = useState(cycle.dayFraction());
  const [paused, setPaused] = useState(cycle.isPaused());
  const swatchRef = useRef<HTMLDivElement>(null);

  // Poll the model a few times a second for the readout; the sky itself tracks it per frame.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 120) {
        last = now;
        const sample = cycle.sample();
        setPhase(sample.phase);
        setFraction(sample.dayFraction);
        if (swatchRef.current !== null) swatchRef.current.style.background = sample.color;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => cycle.subscribe(() => setPaused(cycle.isPaused())), []);

  const clock = new Date(fraction * 24 * 3600 * 1000).toISOString().slice(11, 16);

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div ref={swatchRef} style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid rgba(255,255,255,0.25)" }} />
          <div>
            <div style={{ fontWeight: 700, textTransform: "capitalize" }}>{phase}</div>
            <div style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{clock} · {(fraction * 100).toFixed(0)}%</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={button} onClick={() => cycle.toggle()}>
            {paused ? "▶ Play" : "⏸ Pause"}
          </button>
          <button type="button" style={button} onClick={() => cycle.setSpeed(cycle.speed() >= 8 ? 1 : cycle.speed() * 2)}>
            Faster
          </button>
        </div>
      </div>
    </div>
  );
}

export const dayNightDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: DayNightUI,
  // Opt out of the cinematic default sky so this demo's own DayNightSky is the only sky/lighting.
  look: "flat",
  environment: () => (
    <>
      <DayNightSky cycle={cycle} />
      <EnvironmentScene feature={terrainFeature} />
    </>
  ),
  camera: { initialDistance: 30, initialHeight: 9, minDistance: 12, maxDistance: 60, targetHeight: 7, maxPolarAngle: 1.5 },
};
