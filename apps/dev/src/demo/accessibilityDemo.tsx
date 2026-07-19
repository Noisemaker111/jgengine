import { type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import {
  createAccessibilityStore,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  type ColorblindMode,
} from "@jgengine/core/ui/accessibility";
import { AccessibilityProvider, useAccessibility } from "@jgengine/react/accessibility";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const SCOUT = "scout";

const store = createAccessibilityStore();

const COLORBLIND_MODES: readonly ColorblindMode[] = ["none", "protanopia", "deuteranopia", "tritanopia", "grayscale"];

const SWATCHES: readonly { label: string; color: string }[] = [
  { label: "Health", color: "#ef4444" },
  { label: "Stamina", color: "#22c55e" },
  { label: "Mana", color: "#3b82f6" },
  { label: "XP", color: "#a855f7" },
  { label: "Danger", color: "#f59e0b" },
];

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 70, d: 70 }, height: 2, frequency: 0.03, seed: "a11y" }),
  vegetation: grass({ area: { w: 60, d: 60 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "a11y" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [SCOUT]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "accessibility",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(SCOUT, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

function Panel({ children }: { children: ReactNode }) {
  const { state } = useAccessibility();
  return (
    <div
      style={{
        borderRadius: 12,
        padding: 14,
        background: state.highContrast ? "rgba(0,0,0,0.96)" : "rgba(17,22,30,0.82)",
        border: state.highContrast ? "2px solid #ffffff" : "1px solid rgba(148,163,184,0.28)",
        color: "#f1f5f9",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "calc(0.95rem * var(--jg-text-scale, 1))",
      }}
    >
      {children}
    </div>
  );
}

function Controls() {
  const { state, store: s } = useAccessibility();
  const btn = (active: boolean): CSSProperties => ({
    borderRadius: 6,
    border: `1px solid ${active ? "rgba(56,189,248,0.6)" : "rgba(148,163,184,0.4)"}`,
    background: active ? "rgba(56,189,248,0.22)" : "transparent",
    color: active ? "#bae6fd" : "rgba(226,232,240,0.8)",
    padding: "4px 10px",
    fontSize: "calc(0.8rem * var(--jg-text-scale, 1))",
    fontWeight: 600,
    cursor: "pointer",
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 260 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 96 }}>Text size</span>
        <button type="button" style={btn(false)} onClick={() => s.set({ textScale: Math.max(TEXT_SCALE_MIN, state.textScale - 0.25) })}>A−</button>
        <span style={{ minWidth: 40, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{state.textScale.toFixed(2)}×</span>
        <button type="button" style={btn(false)} onClick={() => s.set({ textScale: Math.min(TEXT_SCALE_MAX, state.textScale + 0.25) })}>A+</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 96 }}>Colorblind</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {COLORBLIND_MODES.map((mode) => (
            <button key={mode} type="button" style={btn(state.colorblind === mode)} onClick={() => s.set({ colorblind: mode })}>
              {mode === "none" ? "off" : mode.slice(0, 4)}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" style={btn(state.reducedMotion)} onClick={() => s.set({ reducedMotion: !state.reducedMotion })}>Reduced motion</button>
        <button type="button" style={btn(state.highContrast)} onClick={() => s.set({ highContrast: !state.highContrast })}>High contrast</button>
        <button type="button" style={btn(state.captions)} onClick={() => s.set({ captions: !state.captions })}>Captions</button>
      </div>
    </div>
  );
}

function Swatches() {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
      {SWATCHES.map((swatch) => (
        <div key={swatch.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: swatch.color, border: "1px solid rgba(0,0,0,0.35)" }} />
          <span style={{ fontSize: "calc(0.7rem * var(--jg-text-scale, 1))", color: "rgba(226,232,240,0.85)" }}>{swatch.label}</span>
        </div>
      ))}
    </div>
  );
}

function Captions() {
  const { state } = useAccessibility();
  if (!state.captions) return null;
  return (
    <div
      style={{
        marginTop: 8,
        borderRadius: 8,
        padding: "6px 12px",
        background: "rgba(0,0,0,0.8)",
        color: "#fefce8",
        fontSize: "calc(0.85rem * var(--jg-text-scale, 1))",
        fontStyle: "italic",
      }}
    >
      [Radio] “Command, the outpost is secure. Over.”
    </div>
  );
}

function AccessibilityUI() {
  return (
    <AccessibilityProvider store={store} className="pointer-events-none absolute inset-0">
      <div className="pointer-events-auto absolute left-4 top-4" style={{ maxWidth: 420 }}>
        <Panel>
          <h1 style={{ fontSize: "calc(1.1rem * var(--jg-text-scale, 1))", fontWeight: 700, color: "#7dd3fc", margin: 0 }}>
            Accessibility
          </h1>
          <p style={{ margin: "2px 0 10px", color: "rgba(226,232,240,0.65)" }}>
            Text scale, colorblind filters, high contrast, reduced motion &amp; captions.
          </p>
          <Swatches />
          <div style={{ height: 12 }} />
          <Controls />
          <Captions />
        </Panel>
      </div>
    </AccessibilityProvider>
  );
}

export const accessibilityDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: AccessibilityUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 28, initialHeight: 22, minDistance: 12, maxDistance: 56, targetHeight: 0, maxPolarAngle: 1.3 },
};
