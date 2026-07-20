import { useEffect, useReducer, useRef, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createWaveRunner, type WaveRunner } from "@jgengine/core/ai/waveRunner";
import type { SpawnRequest } from "@jgengine/core/ai/spawnDirector";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { WaveHud } from "@jgengine/react/waveHud";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

// A spawned marker the onSpawn sink records — the runner never builds entities itself.
interface Marker {
  id: number;
  kind: string;
  wave: number;
}

const markers: Marker[] = [];
let markerId = 0;
const MAX_ALIVE = 14;

// Free-string entry "kinds" the game owns; the runner never interprets them.
const KIND_COLOR: Record<string, string> = {
  grunt: "#38bdf8",
  brute: "#f97316",
  ravager: "#ef4444",
};

// One shared runner: ~3 escalating waves on a fixed seed, driven each frame below.
const runner: WaveRunner = createWaveRunner({
  seed: 1337,
  maxAlive: MAX_ALIVE,
  waves: [
    { budget: 30, duration: 8, entries: [{ id: "grunt", cost: 6 }] },
    { budget: 60, duration: 8, entries: [{ id: "grunt", cost: 6 }, { id: "brute", cost: 16, minWave: 1 }] },
    { budget: 110, duration: 8, entries: [{ id: "brute", cost: 16 }, { id: "ravager", cost: 26, minWave: 2 }] },
  ],
  onSpawn: (request: SpawnRequest) => {
    markers.push({ id: markerId++, kind: request.entryId, wave: request.wave });
  },
});

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "wave" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#26401a", "#7fb04a"], seed: "wave" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "wave-director",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

// Jump straight to WAVE 3 once, so the screenshot lands on a mid-run escalated wave
// with a partly-filled progress bar and real spawn counts.
let advanced = false;

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

function WaveDirectorUI(): ReactNode {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const lastRef = useRef(0);

  // Advance to WAVE 3 and prime a few spawns before the first paint.
  useEffect(() => {
    if (!advanced) {
      advanced = true;
      runner.forceNextWave();
      runner.forceNextWave();
      runner.raiseAlert(0.55);
      for (let i = 0; i < 5; i += 1) runner.update(0.5, { alive: markers.length });
    }
    // Drive the runner's clock each frame from the demo loop.
    let running = true;
    const loop = (now: number): void => {
      if (!running) return;
      const dt = lastRef.current === 0 ? 0.016 : Math.min(0.1, (now - lastRef.current) / 1000);
      lastRef.current = now;
      runner.update(dt, { alive: markers.length });
      bump();
      requestAnimationFrame(loop);
    };
    const handle = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(handle);
    };
  }, []);

  const shown = markers.slice(-MAX_ALIVE);

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      {/* Wave/spawn HUD panel — the visible face of the runner. */}
      <div style={{ position: "absolute", top: 20, left: 20 }}>
        <WaveHud runner={runner} />
      </div>

      {/* Simple spawned markers, colored by the game-owned free-string kind. */}
      <div style={{ position: "absolute", top: 20, right: 20, display: "flex", flexWrap: "wrap", gap: 6, width: 176, justifyContent: "flex-end" }}>
        {shown.map((marker) => (
          <div
            key={marker.id}
            title={`${marker.kind} · wave ${marker.wave + 1}`}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: KIND_COLOR[marker.kind] ?? "#94a3b8",
              boxShadow: "0 2px 6px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.35)",
            }}
          />
        ))}
      </div>

      <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 12 }}>
        <button type="button" style={hudButton} onClick={() => runner.forceNextWave()}>
          ⏭️ Force next wave
        </button>
        <button type="button" style={hudButton} onClick={() => runner.raiseAlert(0.3)}>
          🚨 Raise alert
        </button>
      </div>
    </div>
  );
}

export const waveDirectorDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: WaveDirectorUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
