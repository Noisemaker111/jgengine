import { devtools } from "@jgengine/core/devtools/devtools";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { DEFAULT_GRAPHICS_PROFILES } from "@jgengine/core/settings/graphicsProfile";
import { parseGraphicsQuality } from "@jgengine/core/settings/graphicsSettings";
import { DEFAULT_GRAPHICS_QUALITY, type GraphicsQuality } from "@jgengine/core/settings/settingsModel";
import { EFFECT_LIBRARY, effectNames } from "@jgengine/core/vfx/effectLibrary";
import { planParticleBudget } from "@jgengine/core/vfx/particleBudget";
import type { PlayableGame } from "@jgengine/shell/registry";
import { useEffect, useState } from "react";

import { demoGame } from "./demoGame";

const COLUMNS = 6;
const SPACING = 4.2;
const ROWS = Math.ceil(EFFECT_LIBRARY.length / COLUMNS);
const TIERS: readonly GraphicsQuality[] = ["low", "medium", "high"];

/** One cell per library effect, laid out in reading order so the sheet reads left-to-right. */
const CELLS = EFFECT_LIBRARY.map((effect, index) => ({
  effect,
  position: [
    (index % COLUMNS - (COLUMNS - 1) / 2) * SPACING,
    0.5,
    (Math.floor(index / COLUMNS) - (ROWS - 1) / 2) * SPACING,
  ] as const,
}));

/**
 * Every effect stands so one frame shows all of them. A burst effect has no steady rate, so the
 * sheet holds it open at six plays a second — a preview adaptation of its authored `burst`, never
 * how a game plays it.
 */
function onInit(ctx: GameContext): void {
  for (const { effect, position } of CELLS) {
    const override = effect.mode === "burst" ? { rate: effect.burst * 6, max: effect.burst } : {};
    ctx.particles.attachEffect(`sheet:${effect.name}`, effect.name, { position: [...position], config: override });
  }
}

function onReset(): void {}

const REQUESTS = EFFECT_LIBRARY.map((effect) => ({ id: effect.name, priority: effect.priority, requested: effect.config.max ?? 512 }));

function planFor(quality: GraphicsQuality) {
  return planParticleBudget(REQUESTS, DEFAULT_GRAPHICS_PROFILES[quality].particleBudget);
}

const applied: GraphicsQuality =
  parseGraphicsQuality(typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("quality")) ?? DEFAULT_GRAPHICS_QUALITY;

/** Reads the shell's live particle probe so the sheet reports measured counts, not just the plan. */
function useLiveParticles(): { live: number; cap: number; dropped: number } {
  const [live, setLive] = useState({ live: 0, cap: 0, dropped: 0 });
  useEffect(() => {
    const timer = setInterval(() => {
      const probe = devtools.probes.read()["particles"] as { count?: number; cap?: number; dropped?: number } | undefined;
      setLive({ live: probe?.count ?? 0, cap: probe?.cap ?? 0, dropped: probe?.dropped ?? 0 });
    }, 400);
    return () => clearInterval(timer);
  }, []);
  return live;
}

const labelStyle = { fontFamily: "sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.85)" } as const;

function Legend() {
  const live = useLiveParticles();
  return <div style={{ ...labelStyle, pointerEvents: "none", position: "absolute", inset: 0, color: "#f2f3f0" }}>
    <div style={{ position: "absolute", top: 12, left: 16, fontSize: 15, fontWeight: 600 }}>
      VFX library · {EFFECT_LIBRARY.length} named effects · GPU pooled particles
    </div>
    <div style={{ position: "absolute", top: 34, left: 16, fontSize: 11, opacity: 0.85 }}>
      applied tier {applied} · cap {DEFAULT_GRAPHICS_PROFILES[applied].particleBudget} · live {live.live} · dropped {live.dropped}
    </div>
    <div style={{ position: "absolute", top: 56, left: 16, fontSize: 11, lineHeight: 1.5 }}>
      {TIERS.map((quality) => {
        const plan = planFor(quality);
        return <div key={quality}>
          {quality.padEnd(6, " ")} cap {DEFAULT_GRAPHICS_PROFILES[quality].particleBudget} · {plan.grants.length} admitted · ceiling {plan.particles} · dropped {plan.dropped.length}
          {plan.dropped.length > 0 ? ` (${plan.dropped.join(", ")})` : ""}
        </div>;
      })}
    </div>
    <div style={{ position: "absolute", bottom: 10, left: 16, right: 16, fontSize: 10, opacity: 0.8 }}>
      {effectNames().join(" · ")}
    </div>
  </div>;
}

/** Contact sheet for the shared VFX library; `?quality=low|medium|high` pins the applied tier. */
export const vfxLibraryGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "vfx-library" },
  renderEntity: () => <group />,
  renderObject: () => <group />,
  loop: { ...demoGame.loop, onInit, onTick: () => {}, onReset },
  look: "flat",
  lighting: { ambient: { intensity: 0.35 }, directional: [{ position: [6, 12, 8], intensity: 1.1 }] },
  backdrop: { background: "#0e1114" },
  postProcessing: { enabled: true, toneMapping: "agx", exposure: 1, bloom: false, ao: false, grade: false, stylize: false, aa: "msaa" },
  environment: () => <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[34, 30]} />
      <meshStandardMaterial color="#1b1f24" roughness={0.95} />
    </mesh>
  </>,
  GameUI: Legend,
  camera: { initialDistance: 17, initialHeight: 12, minDistance: 8, maxDistance: 60, targetHeight: 1.5, maxPolarAngle: 1.35 },
  capture: {
    views: {
      sheet: { look: "0,1,0", lookFrom: "19,15,0.6" },
      closeup: { look: "-6,1,-5", lookFrom: "9,6,0.5" },
    },
  },
};
