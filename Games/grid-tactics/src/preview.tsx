import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const labelStyle: CSSProperties = {
  fontSize: "1.1cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "#95997f",
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};

const panelStyle: CSSProperties = {
  background: "#14160f",
  border: "1px solid #454a35",
  padding: "1cqw 1.4cqw",
};

function Tile({ left, top, color, opacity }: { left: string; top: string; color: string; opacity: number }) {
  return (
    <span
      style={{
        position: "absolute",
        left,
        top,
        width: "8cqw",
        height: "8cqw",
        transform: "translate(-50%, -50%) skewY(-8deg)",
        background: color,
        opacity,
      }}
    />
  );
}

function Unit({ left, top, hull, trim, hp, maxHp }: { left: string; top: string; hull: string; trim: string; hp: number; maxHp: number }) {
  return (
    <div style={{ position: "absolute", left, top, transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5cqw" }}>
      <span
        style={{
          width: "4.6cqw",
          height: "4.6cqw",
          borderRadius: "0.6cqw",
          background: `linear-gradient(160deg, ${trim}, ${hull})`,
          border: "1px solid rgba(255,255,255,0.25)",
        }}
      />
      <span style={{ fontSize: "1cqw", fontFamily: "Consolas, monospace", color: "#e6e8d8" }}>
        {hp}/{maxHp}
      </span>
    </div>
  );
}

export default function GridTacticsPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(160deg, #14160f 0%, #0a0b07 100%)",
        color: "#e6e8d8",
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          top: "24%",
          backgroundImage:
            "repeating-linear-gradient(100deg, rgba(216,193,105,0.16) 0 1px, transparent 1px 7cqw), repeating-linear-gradient(20deg, rgba(216,193,105,0.16) 0 1px, transparent 1px 7cqw)",
        }}
      />

      {/* Obstacles — inner tiles of the outpost breach layout */}
      <Tile left="46%" top="46%" color="#57a8b8" opacity={0.24} />
      <Tile left="54%" top="60%" color="#57a8b8" opacity={0.24} />

      {/* Player squad — spawn column, full health */}
      <Unit left="18%" top="42%" hull="#3b5b8c" trim="#a9c4ec" hp={16} maxHp={16} />
      <Unit left="20%" top="68%" hull="#2f8f7c" trim="#a9f0e0" hp={10} maxHp={10} />
      <Unit left="26%" top="56%" hull="#b98a2e" trim="#ffe4a3" hp={20} maxHp={20} />

      {/* Breach enemies — wave 1: two crawlers, one spitter */}
      <Unit left="80%" top="36%" hull="#8c2f3b" trim="#f2a3ac" hp={6} maxHp={6} />
      <Unit left="80%" top="70%" hull="#8c2f3b" trim="#f2a3ac" hp={6} maxHp={6} />
      <Unit left="72%" top="52%" hull="#5b3b8c" trim="#c8a9f0" hp={5} maxHp={5} />

      <div style={{ position: "absolute", top: "16%", left: "3%", ...panelStyle, display: "flex", flexDirection: "column", gap: "0.4cqw", width: "24cqw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={labelStyle}>Outpost Breach</span>
          <span style={{ fontSize: "1.3cqw", fontFamily: "Consolas, monospace", color: "#d8c169" }}>ROUND 1</span>
        </div>
        <span style={{ height: "1px", background: "#454a35" }} />
        <span style={{ fontSize: "1.3cqw", letterSpacing: "0.12em", color: "#95997f", textTransform: "uppercase" }}>Your Turn</span>
      </div>

      <div style={{ position: "absolute", bottom: "8%", right: "3%", display: "flex", gap: "0.8cqw" }}>
        {[
          { hp: 16, maxHp: 16 },
          { hp: 10, maxHp: 10 },
          { hp: 20, maxHp: 20 },
        ].map((u, i) => (
          <span
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5cqw",
              padding: "0.6cqw 0.9cqw",
              background: "#14160f",
              border: "1px solid #454a35",
              fontSize: "1.1cqw",
              fontFamily: "Consolas, monospace",
              color: "#e6e8d8",
            }}
          >
            {u.hp}/{u.maxHp}
          </span>
        ))}
      </div>

      <div style={{ position: "absolute", bottom: "8%", right: "3%", transform: "translateY(-4.5cqw)" }}>
        <span
          style={{
            padding: "1cqw 1.8cqw",
            background: "#6e6230",
            border: "1px solid #d8c169",
            color: "#e6e8d8",
            fontWeight: 700,
            fontSize: "1.3cqw",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          End Turn
        </span>
      </div>
    </div>
  );
}
