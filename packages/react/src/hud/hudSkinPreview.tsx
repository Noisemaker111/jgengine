import { useMemo, type CSSProperties } from "react";
import { HudFrame } from "./hudFrame";
import { hudTheme, hudThemeVars } from "./hudTheme";
import { type HudSkin, hudSkinVars } from "./hudSkin";
import { KitMeter } from "../uiKitRoot";

function painted(color: string, dark: string): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 32;
  const ctx = canvas.getContext("2d"); if (!ctx) return "";
  ctx.fillStyle = dark; ctx.fillRect(0, 0, 32, 32); ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.strokeRect(3, 3, 26, 26);
  return canvas.toDataURL("image/png");
}

function SkinCell({ title, skin }: { title: string; skin: HudSkin }) {
  const vars = { ...hudThemeVars(hudTheme({ skin })), ...hudSkinVars(skin) } as CSSProperties;
  return <div style={{ ...vars, width: 300 }}><HudFrame variation="themed" title={title} padding={14}>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <KitMeter value={78} max={100} label="HP" tone="good" readout />
      <KitMeter value={42} max={60} label="SH" tone="accent" readout />
      <div style={{ display: "flex", gap: 6 }}>{["A", "B", "C", "D", "E"].map((label) => <div key={label} style={{ width: 40, height: 40, display: "grid", placeItems: "center", color: "var(--jg-text)", border: "var(--jg-slot-border)", borderImage: "var(--jg-slot-image, none) var(--jg-slot-slice, 0) / var(--jg-slot-scale, 1)", background: "var(--jg-slot-bg)", borderRadius: "var(--jg-slot-radius)" }}>{label}</div>)}</div>
    </div>
  </HudFrame></div>;
}

/** Procedural two-skin fixture for visual regression captures. */
export function HudSkinPreview({ className }: { className?: string }) {
  const skins = useMemo(() => [{ title: "painted cartoon", skin: { frame: { image: painted("#ffd166", "#7b3f00"), slice: [8, 8, 8, 8], fill: true }, slot: { image: painted("#66e3ff", "#12354a"), slice: [8, 8, 8, 8] } } }, { title: "thin dark overlay", skin: { frame: { image: painted("#8d99ae", "#11151c"), slice: [4, 4, 4, 4] }, slot: { image: painted("#566070", "#090b10"), slice: [4, 4, 4, 4] } } }] as { title: string; skin: HudSkin }[], []);
  return <div className={className} data-hud-skin-preview style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: 22, background: "#0e1216", color: "#f5f7fa" }}>{skins.map((item) => <SkinCell key={item.title} {...item} />)}</div>;
}
