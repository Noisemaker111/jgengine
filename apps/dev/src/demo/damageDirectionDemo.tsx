import { useEffect, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createDamageDirectionTracker } from "@jgengine/core/vfx/damageDirection";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { DamageDirectionOverlay } from "@jgengine/react/damageDirection";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const TARGET = "target";

// The demo drives a virtual clock so the fade is deterministic and a still capture
// always shows several arcs mid-fade — if timers throttle, the clock simply freezes
// and the current arcs persist. A real game would just pass `Date.now`.
let virtualNow = 0;

// A shared brain: merge near-identical bearings so a burst reads as one strong arc.
const tracker = createDamageDirectionTracker({
  now: () => virtualNow,
  duration: 1600,
  mergeWindow: 0.18,
});

// A scripted volley from several bearings, each with a style `kind` the overlay colors.
const VOLLEY: readonly { angle: number; intensity: number; kind: string }[] = [
  { angle: 0, intensity: 1, kind: "melee" }, // dead ahead
  { angle: Math.PI * 0.5, intensity: 0.8, kind: "fire" }, // right flank
  { angle: Math.PI, intensity: 0.9, kind: "melee" }, // behind
  { angle: -Math.PI * 0.5, intensity: 0.7, kind: "poison" }, // left flank
  { angle: Math.PI * 0.75, intensity: 0.85, kind: "crit" }, // back-right
  { angle: -Math.PI * 0.25, intensity: 0.6, kind: "fire" }, // front-left
];

const ARC_COLORS: Record<string, string> = {
  melee: "#e5484d",
  fire: "#ff7a1a",
  poison: "#8fd14f",
  crit: "#ffd23f",
};

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "damagedir" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#3a2f24", "#6b5a3a"], seed: "damagedir" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [TARGET]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "damage-direction",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(TARGET, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

const legendChip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: "#e2e8f0",
};

function DamageDirectionUI(): ReactNode {
  useEffect(() => {
    // Seed a staggered volley: each hit is registered at a slightly later virtual
    // time so at rest they sit at different ages → different eased intensities, and
    // all stay well under the 1600ms fade window (max age 750ms). Several arcs are
    // therefore visible around the reticle the moment the scene settles.
    virtualNow = 0;
    tracker.clear();
    VOLLEY.forEach((hit, i) => {
      virtualNow = i * 150;
      tracker.registerHit(hit);
    });
    virtualNow = 800;
    // Keep it alive when timers run: advance the virtual clock and re-fire the
    // oldest bearing so the arcs pulse. If timers throttle, the last frame persists.
    let step = 0;
    const id = setInterval(() => {
      virtualNow += 150;
      tracker.registerHit(VOLLEY[step % VOLLEY.length]!);
      step += 1;
      if (virtualNow > 100_000) virtualNow = 800; // keep numbers bounded
    }, 150);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <DamageDirectionOverlay tracker={tracker} colors={ARC_COLORS} />
      <div
        style={{
          position: "absolute",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4 }}>Damage-direction indicators</div>
        <div style={{ marginTop: 4, fontSize: 11.5, color: "rgba(203,213,225,0.85)" }}>
          Arcs flare toward where each hit came from, then fade.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 16,
          padding: "8px 14px",
          borderRadius: 10,
          background: "rgba(17,22,30,0.8)",
          border: "1px solid rgba(148,163,184,0.28)",
        }}
      >
        {Object.entries(ARC_COLORS).map(([kind, color]) => (
          <span key={kind} style={legendChip}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
            {kind}
          </span>
        ))}
      </div>
    </div>
  );
}

export const damageDirectionDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: DamageDirectionUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
