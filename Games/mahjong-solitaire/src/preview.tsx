import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const GOLD = "#e6c65a";
const JADE =
  "radial-gradient(130% 100% at 50% 0%,#1e6f52 0%,#155a41 44%,#0e4631 76%,#0a3324 100%)";

const panelStyle: CSSProperties = {
  background: "rgba(9,32,22,0.84)",
  border: "1px solid rgba(230,198,90,0.28)",
  borderRadius: "0.9cqw",
  padding: "0.6cqw 1cqw",
  color: "#f3efdc",
  boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "3cqw" }}>
      <div style={{ fontSize: "0.9cqw", letterSpacing: "0.05em", textTransform: "uppercase", color: "rgba(240,235,215,0.55)" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.6cqw", fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function Tile({ left, top, z, glyph, color, state }: { left: string; top: string; z: number; glyph: string; color: string; state?: "selected" | "hinted" }) {
  const border =
    state === "selected" ? "2px solid #67e8f9" : state === "hinted" ? "2px solid #f0a23a" : "1px solid rgba(0,0,0,0.35)";
  const shadow = state === "selected" ? "0 0 10px rgba(103,232,249,0.55)" : state === "hinted" ? "0 0 10px rgba(240,162,58,0.55)" : "0 2px 3px rgba(0,0,0,0.35)";
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        zIndex: z,
        width: "3.4cqw",
        height: "4.4cqw",
        borderRadius: "0.4cqw",
        border,
        boxShadow: shadow,
        background: "linear-gradient(180deg,#faf6e6,#eee3bd)",
        display: "grid",
        placeItems: "center",
        fontSize: "1.8cqw",
        fontWeight: 700,
        color,
      }}
    >
      {glyph}
    </div>
  );
}

export default function MahjongSolitairePreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: JADE,
        color: "#f3efdc",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div style={{ position: "absolute", top: "14%", left: "50%", width: "60%", height: "70%", transform: "translateX(-50%)" }}>
        <Tile left="2%" top="6%" z={1} glyph="8萬" color="#b3322c" />
        <Tile left="14%" top="2%" z={2} glyph="4筒" color="#1f7a8c" />
        <Tile left="26%" top="8%" z={1} glyph="6條" color="#2f8f4e" />
        <Tile left="38%" top="0%" z={3} glyph="東" color="#33506b" />
        <Tile left="50%" top="6%" z={2} glyph="中" color="#c0392b" />
        <Tile left="62%" top="2%" z={1} glyph="3筒" color="#1f7a8c" />
        <Tile left="74%" top="8%" z={2} glyph="7條" color="#2f8f4e" />
        <Tile left="86%" top="4%" z={1} glyph="2萬" color="#b3322c" />

        <Tile left="8%" top="26%" z={2} glyph="5筒" color="#1f7a8c" />
        <Tile left="20%" top="30%" z={1} glyph="9條" color="#2f8f4e" />
        <Tile left="32%" top="22%" z={3} glyph="發" color="#2e8b57" />
        <Tile left="44%" top="28%" z={1} glyph="1萬" color="#b3322c" state="hinted" />
        <Tile left="56%" top="22%" z={2} glyph="南" color="#33506b" state="hinted" />
        <Tile left="68%" top="30%" z={1} glyph="6筒" color="#1f7a8c" />
        <Tile left="80%" top="24%" z={2} glyph="白" color="#2f5d8a" />

        <Tile left="14%" top="50%" z={1} glyph="3條" color="#2f8f4e" state="selected" />
        <Tile left="26%" top="46%" z={2} glyph="7萬" color="#b3322c" />
        <Tile left="38%" top="52%" z={1} glyph="西" color="#33506b" />
        <Tile left="50%" top="48%" z={2} glyph="8筒" color="#1f7a8c" />
        <Tile left="62%" top="54%" z={1} glyph="梅" color="#c65a86" />
        <Tile left="74%" top="46%" z={2} glyph="5條" color="#2f8f4e" />

        <Tile left="20%" top="70%" z={1} glyph="9筒" color="#1f7a8c" />
        <Tile left="32%" top="74%" z={2} glyph="2條" color="#2f8f4e" />
        <Tile left="44%" top="68%" z={1} glyph="北" color="#33506b" />
        <Tile left="56%" top="74%" z={1} glyph="4萬" color="#b3322c" />
        <Tile left="68%" top="70%" z={2} glyph="蘭" color="#c65a86" />
      </div>

      <div style={{ position: "absolute", top: "3%", left: "3%", ...panelStyle, display: "flex", flexDirection: "column", gap: "0.15cqw" }}>
        <div style={{ fontWeight: 800, letterSpacing: "0.1em", color: GOLD, fontSize: "1.3cqw" }}>MAHJONG 麻將</div>
        <div style={{ fontSize: "0.9cqw", color: "rgba(240,235,215,0.66)" }}>Free play</div>
      </div>

      <div style={{ position: "absolute", top: "3%", left: "50%", transform: "translateX(-50%)", ...panelStyle, display: "flex", gap: "1.4cqw", alignItems: "center" }}>
        <Stat label="Pairs" value="46" />
        <Stat label="Free" value="4" />
        <div style={{ width: "1px", height: "2.2cqw", background: "rgba(255,255,255,0.16)" }} />
        <Stat label="Time" value="1:42" />
        <Stat label="Best" value="—" />
      </div>

      <div style={{ position: "absolute", bottom: "3%", right: "2.5%", ...panelStyle, display: "flex", gap: "0.7cqw", flexWrap: "wrap", maxWidth: "34cqw" }}>
        {["Hint", "Undo", "Shuffle ·3", "New", "Daily", "Restart"].map((label) => (
          <span
            key={label}
            style={{
              border: "1px solid rgba(230,198,90,0.3)",
              borderRadius: "0.6cqw",
              padding: "0.4cqw 0.8cqw",
              fontSize: "1cqw",
              fontWeight: 700,
              background: "rgba(255,255,255,0.06)",
              color: "#f2eeda",
            }}
          >
            {label}
          </span>
        ))}
      </div>

      <div style={{ position: "absolute", bottom: "3%", left: "50%", transform: "translateX(-50%)", fontSize: "0.9cqw", color: "rgba(235,230,210,0.62)" }}>
        Mahjong solitaire — Brodie Lockard (1981)
      </div>
    </div>
  );
}
