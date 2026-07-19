import { useEffect, useReducer, useRef, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { resolveStatusApplication, type StatusInstance } from "@jgengine/core/combat/statusApplication";
import { toStatusEffectViews } from "@jgengine/core/combat/statusEffectView";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { StatusEffectBar, type StatusIconResolver } from "@jgengine/react/statusEffectBar";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

/** Sample timed effects — free-string `kind`s with a base duration and starting stack count. */
const SAMPLE_EFFECTS: readonly { kind: string; durationMs: number; magnitude: number; stacks: number }[] = [
  { kind: "poison", durationMs: 8000, magnitude: 4, stacks: 3 },
  { kind: "haste", durationMs: 6000, magnitude: 15, stacks: 1 },
  { kind: "shield", durationMs: 10000, magnitude: 60, stacks: 1 },
  { kind: "regen", durationMs: 5000, magnitude: 8, stacks: 2 },
];

const DURATION_BY_KIND: Record<string, number> = Object.fromEntries(
  SAMPLE_EFFECTS.map((effect) => [effect.kind, effect.durationMs]),
);

/** Build a live status instance through the real status model, then age it to a partial remaining. */
function seedInstance(effect: (typeof SAMPLE_EFFECTS)[number], elapsedFraction: number): StatusInstance {
  const outcome = resolveStatusApplication({
    spec: {
      status: effect.kind,
      durationMs: effect.durationMs,
      magnitude: effect.magnitude,
      stack: { kind: "stack", max: 9, add: effect.stacks },
    },
    // Fold the extra starting stacks onto a fresh instance so the badge reads > 1.
    current:
      effect.stacks > 1
        ? { status: effect.kind, stacks: 1, remainingMs: effect.durationMs, ticks: 0, magnitude: effect.magnitude }
        : null,
    rng: () => 0, // deterministic: always lands
  });
  const instance = outcome.instance ?? {
    status: effect.kind,
    stacks: effect.stacks,
    remainingMs: effect.durationMs,
    ticks: 0,
    magnitude: effect.magnitude,
  };
  return { ...instance, remainingMs: Math.round(effect.durationMs * (1 - elapsedFraction)) };
}

/** Game-authored ring colors: debuffs read hot, buffs cool. `kind` is never interpreted by the engine. */
function ringColor(kind: string): string {
  switch (kind) {
    case "poison":
      return "#7ac74f";
    case "haste":
      return "#f8b84e";
    case "shield":
      return "#38bdf8";
    case "regen":
      return "#22d3ee";
    default:
      return "var(--jg-accent, #38bdf8)";
  }
}

/** Game-authored glyphs for its own statuses. */
const iconFor: StatusIconResolver = (kind) => {
  switch (kind) {
    case "poison":
      return "poison";
    case "haste":
      return "wing";
    case "shield":
      return "shield";
    case "regen":
      return "heart";
    default:
      return null;
  }
};

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "status" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "status" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "status-effects",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

const panel: CSSProperties = {
  position: "absolute",
  top: 28,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  padding: "14px 20px",
  borderRadius: "var(--jg-frame-radius, 12px)",
  background: "var(--jg-frame-bg, linear-gradient(180deg, rgba(20,24,32,0.86), rgba(10,12,16,0.9)))",
  border: "var(--jg-frame-border, 1px solid rgba(255,255,255,0.12))",
  boxShadow: "var(--jg-frame-glow, 0 6px 20px rgba(0,0,0,0.45))",
  pointerEvents: "auto",
};

function StatusEffectDemoUI(): ReactNode {
  // Drive the existing status model over time: age each instance every frame, loop when it expires.
  const instancesRef = useRef<StatusInstance[]>(
    SAMPLE_EFFECTS.map((effect, index) => seedInstance(effect, 0.15 + index * 0.16)),
  );
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    const tick = (now: number): void => {
      const dt = now - last;
      last = now;
      instancesRef.current = instancesRef.current.map((instance) => {
        const remainingMs = instance.remainingMs - dt;
        if (remainingMs > 0) return { ...instance, remainingMs };
        // Re-apply through the model so it loops (refresh duration to full).
        return { ...instance, remainingMs: DURATION_BY_KIND[instance.status] ?? instance.remainingMs };
      });
      bump();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const effects = toStatusEffectViews(instancesRef.current, {
    durationMs: (instance) => DURATION_BY_KIND[instance.status] ?? instance.remainingMs,
  });

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div style={panel}>
        <div style={{ fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", fontWeight: 700, opacity: 0.75 }}>
          Status effects
        </div>
        <StatusEffectBar effects={effects} iconFor={iconFor} colorFor={ringColor} size={48} />
      </div>
    </div>
  );
}

export const statusEffectDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: StatusEffectDemoUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
