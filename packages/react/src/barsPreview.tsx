import { type CSSProperties } from "react";

import {
  AmmoCounter,
  barTokens,
  BossBar,
  ExperienceBar,
  HealthBar,
  ManaBar,
  ShieldBar,
  SoulBar,
  StaminaBar,
  type BarTokens,
} from "./bars";

/**
 * A deterministic preview of every atomic vitals bar plus a composed example — the fixture behind
 * #1033's visual evidence. All values are static (no game provider), so it renders identically every
 * time for screenshots. Rendering the same set under two different {@link BarTokens} blocks proves
 * that global theming survives the umbrella's decomposition: one token change restyles every bar.
 */

const PANEL: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 14,
  borderRadius: 10,
  background: "rgba(10,12,16,0.72)",
  border: "1px solid rgba(255,255,255,0.08)",
};

function Portrait({ color }: { color: string }) {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 6,
        background: `radial-gradient(circle at 40% 30%, ${color}, rgba(0,0,0,0.6))`,
        border: "2px solid rgba(0,0,0,0.75)",
        flex: "0 0 auto",
      }}
    />
  );
}

function AtomicMatrix({ label, tokens }: { label: string; tokens?: BarTokens }) {
  return (
    <div style={{ ...PANEL, ...(tokens === undefined ? {} : barTokens(tokens)) }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "rgba(255,255,255,0.6)" }}>
        {label}
      </span>
      <HealthBar value={82} max={100} label="HP" />
      <HealthBar value={14} max={100} label="HP" />
      <ShieldBar value={40} max={60} label="SH" />
      <ManaBar value={55} max={80} label="MP" />
      <StaminaBar value={90} max={100} label="ST" />
      <ExperienceBar value={3} max={10} segments={10} showValue={false} label="XP" />
      <SoulBar value={3} max={5} segments={5} showValue={false} label="SOUL" />
      <AmmoCounter loaded={17} reserve={90} magazine={30} />
      <BossBar value={640} max={1000} name="Ancient Wyrm" width="100%" />
      {/* composed player plate — the game builds this stack; the engine never ships it as one unit */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        <Portrait color={tokens?.health ?? "#e5484d"} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 auto" }}>
          <HealthBar value={82} max={100} width="100%" showValue={false} />
          <ShieldBar value={40} max={60} width="100%" showValue={false} />
        </div>
      </div>
    </div>
  );
}

/** Renders the atomic bar matrix twice under different token blocks to prove global re-theming. */
export function BarsPreview({ className }: { className?: string }) {
  return (
    <div
      data-bars-preview
      className={className}
      style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: 20, fontFamily: "system-ui, sans-serif", color: "#f5f7fa" }}
    >
      <AtomicMatrix label="default tokens" />
      <AtomicMatrix
        label="restyled tokens"
        tokens={{
          health: "#2fbf71",
          healthLow: "#e0a80d",
          shield: "#f2c14e",
          mana: "#6c5ce7",
          stamina: "#00b894",
          xp: "#0984e3",
          soul: "#e17055",
          ammo: "#fdcb6e",
          frame: "#0a0a0a",
          radius: "2px",
          height: "20px",
        }}
      />
    </div>
  );
}
