import { type CSSProperties } from "react";

import { AmmoCounter, ExperienceBar, HealthBar, ManaBar, ShieldBar } from "./bars";
import { HudFrame } from "./hudFrame";
import { HUD_THEME_PRESETS, defaultHudTheme, hudThemeVars, type HudTheme } from "./hudTheme";

/**
 * A deterministic preset matrix for {@link HudTheme} (#1034): every genre preset × (bars + a themed
 * frame + a slot row), rendered from static values. One `hudThemeVars(theme)` block per cell drives
 * the atomic bars, the `HudFrame variation="themed"`, and the slot chrome together — proof that a
 * single theme restyles all the shared chrome at once. Renders identically every time (screenshots).
 */

function Slot({ index }: { index: number }) {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        background: "var(--jg-slot-bg, rgba(12,14,20,0.7))",
        border: "var(--jg-slot-border, 1px solid rgba(255,255,255,0.12))",
        borderRadius: "var(--jg-slot-radius, 8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        color: "var(--jg-bar-text, #f4f6fb)",
        opacity: index === 0 ? 1 : 0.6,
      }}
    >
      {index + 1}
    </div>
  );
}

function ThemeCell({ name, theme }: { name: string; theme: HudTheme }) {
  return (
    <div style={{ ...(hudThemeVars(theme) as CSSProperties), width: 260 }}>
      <HudFrame variation="themed" title={name} padding={12}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <HealthBar value={78} max={100} label="HP" width="100%" />
          <ManaBar value={50} max={80} label="MP" width="100%" />
          <ShieldBar value={30} max={60} label="SH" width="100%" />
          <ExperienceBar value={4} max={10} segments={10} showValue={false} label="XP" width="100%" />
          <AmmoCounter loaded={17} reserve={90} magazine={30} width="100%" />
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            {[0, 1, 2, 3].map((index) => (
              <Slot key={index} index={index} />
            ))}
          </div>
        </div>
      </HudFrame>
    </div>
  );
}

/** Renders the default theme plus every genre preset as a deterministic matrix. */
export function HudThemePreview({ className }: { className?: string }) {
  const cells: [string, HudTheme][] = [
    ["default", defaultHudTheme],
    ...(Object.entries(HUD_THEME_PRESETS) as [string, HudTheme][]),
  ];
  return (
    <div
      data-hud-theme-preview
      className={className}
      style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: 22, fontFamily: "system-ui, sans-serif", background: "#0e1216" }}
    >
      {cells.map(([name, theme]) => (
        <ThemeCell key={name} name={name} theme={theme} />
      ))}
    </div>
  );
}
