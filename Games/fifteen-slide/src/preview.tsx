import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const NUMERAL_FONT = "'Georgia', 'Iowan Old Style', 'Times New Roman', serif";

const panelStyle: CSSProperties = {
  borderRadius: "1.2cqw",
  border: "1px solid #3a3024",
  background: "rgba(30,25,18,0.9)",
  boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
};

const labelStyle: CSSProperties = {
  fontSize: "1.1cqw",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  color: "#a5906f",
};

const TILES: readonly (number | null)[] = [5, 1, 2, 4, 9, 6, 3, 8, 13, 10, 7, 12, null, 14, 11, 15];

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 2.2cqw" }}>
      <span style={labelStyle}>{label}</span>
      <span style={{ fontFamily: NUMERAL_FONT, fontSize: "2.6cqw", fontWeight: 900, color: "#ece0c8" }}>{value}</span>
    </div>
  );
}

function SizeButton({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.5cqw",
        borderRadius: "0.8cqw",
        padding: "0.8cqw 1.4cqw",
        fontFamily: NUMERAL_FONT,
        fontSize: "1.5cqw",
        fontWeight: 700,
        background: active ? "#d8b24a" : "#0f0c08",
        color: active ? "#221a0e" : "#ece0c8",
        border: `1px solid ${active ? "#f2d886" : "#3a3024"}`,
        boxShadow: active ? "0 0 12px rgba(216,178,74,0.4)" : "none",
      }}
    >
      {label}
      <span
        style={{
          borderRadius: "0.4cqw",
          padding: "0.1cqw 0.5cqw",
          fontSize: "1cqw",
          fontWeight: 700,
          background: active ? "#0f0c08" : "transparent",
          border: active ? "none" : "1px solid #5a4a2e",
          color: "#d8b24a",
        }}
      >
        {label[0]}
      </span>
    </span>
  );
}

function PillButton({ label, badge, primary }: { label: string; badge?: string; primary?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.8cqw",
        borderRadius: "0.8cqw",
        padding: "0.9cqw 1.8cqw",
        fontSize: "1.3cqw",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        background: primary ? "#d8b24a" : "rgba(38,32,23,0.56)",
        color: primary ? "#221a0e" : "#ece0c8",
        border: `1px solid ${primary ? "#f2d886" : "#3a3024"}`,
      }}
    >
      {label}
      {badge === undefined ? null : (
        <span
          style={{
            borderRadius: "0.4cqw",
            padding: "0.1cqw 0.5cqw",
            fontSize: "1cqw",
            fontWeight: 700,
            background: primary ? "#0f0c08" : "transparent",
            border: primary ? "none" : "1px solid #5a4a2e",
            color: "#d8b24a",
          }}
        >
          {badge}
        </span>
      )}
    </span>
  );
}

export default function FifteenSlidePreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#14110c",
        color: "#ece0c8",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div style={{ ...panelStyle, position: "absolute", top: "14%", left: "2.5%", padding: "1.2cqw 1.8cqw" }}>
        <div style={{ fontFamily: NUMERAL_FONT, fontSize: "1.6cqw", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.24em", color: "#e9c86a" }}>
          The 15 Puzzle
        </div>
        <div style={{ fontSize: "1.1cqw", textTransform: "uppercase", letterSpacing: "0.2em", color: "#a5906f" }}>
          Sliding Tiles · 4×4
        </div>
      </div>

      <div
        style={{
          ...panelStyle,
          position: "absolute",
          top: "14%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "stretch",
          padding: "1cqw 0.8cqw",
        }}
      >
        <StatTile label="Moves" value="0" />
        <span style={{ width: "1px", background: "#3a3024" }} />
        <StatTile label="Time" value="0:00" />
        <span style={{ width: "1px", background: "#3a3024" }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 2.2cqw" }}>
          <span style={labelStyle}>State</span>
          <span style={{ fontSize: "1.4cqw", fontWeight: 700, color: "#ece0c8" }}>Ready</span>
        </div>
      </div>

      <div style={{ ...panelStyle, position: "absolute", top: "14%", right: "2.5%", padding: "1.2cqw 1.8cqw", minWidth: "13cqw" }}>
        <div style={{ marginBottom: "0.7cqw", fontSize: "1.2cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "#e9c86a" }}>
          Best · 4×4
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "2.5cqw" }}>
          <span style={labelStyle}>Time</span>
          <span style={{ fontFamily: NUMERAL_FONT, fontSize: "1.5cqw", fontWeight: 700, color: "#ece0c8" }}>—:—</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "2.5cqw" }}>
          <span style={labelStyle}>Moves</span>
          <span style={{ fontFamily: NUMERAL_FONT, fontSize: "1.5cqw", fontWeight: 700, color: "#ece0c8" }}>—</span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "51%",
          transform: "translate(-50%, -50%)",
          width: "30cqw",
          aspectRatio: "1 / 1",
          borderRadius: "1.6cqw",
          padding: "1.1cqw",
          background: "linear-gradient(160deg, #241d14 0%, #14100a 100%)",
          border: "1px solid #1c1811",
          boxShadow: "inset 0 2px 7px rgba(0,0,0,0.6), 0 20px 46px rgba(0,0,0,0.55)",
          outline: "1px solid rgba(216,178,74,0.16)",
          outlineOffset: "-6px",
        }}
      >
        <div style={{ display: "grid", height: "100%", width: "100%", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5cqw" }}>
          {TILES.map((value, index) =>
            value === null ? (
              <span
                key={index}
                style={{ borderRadius: "0.6cqw", background: "#0e0c08", boxShadow: "inset 0 2px 5px rgba(0,0,0,0.7)" }}
              />
            ) : (
              <span
                key={index}
                style={{
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "0.6cqw",
                  backgroundImage:
                    "repeating-linear-gradient(94deg, rgba(0,0,0,0.05) 0 2px, rgba(255,235,200,0.03) 2px 6px), linear-gradient(152deg, #90623a 0%, #6f4525 46%, #4c2f16 100%)",
                  border: "1px solid #38240f",
                  boxShadow:
                    "inset 0 2px 3px rgba(255,225,170,0.38), inset 0 -3px 6px rgba(0,0,0,0.5), 0 4px 9px rgba(0,0,0,0.5)",
                }}
              >
                <span
                  style={{
                    fontFamily: NUMERAL_FONT,
                    fontWeight: 800,
                    color: "#e9c86a",
                    fontSize: "3cqw",
                    lineHeight: 1,
                    textShadow: "0 1px 1px rgba(0,0,0,0.7), 0 0 8px rgba(216,178,74,0.28)",
                  }}
                >
                  {value}
                </span>
              </span>
            ),
          )}
        </div>
      </div>

      <div style={{ ...panelStyle, position: "absolute", bottom: "5%", left: "2.5%", padding: "1cqw 1.4cqw" }}>
        <div style={{ ...labelStyle, marginBottom: "0.7cqw" }}>Board</div>
        <div style={{ display: "flex", gap: "0.7cqw" }}>
          <SizeButton label="3×3" active={false} />
          <SizeButton label="4×4" active />
          <SizeButton label="5×5" active={false} />
        </div>
      </div>

      <div
        style={{
          ...panelStyle,
          position: "absolute",
          bottom: "5%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.9cqw",
          padding: "1.2cqw 1.8cqw",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.9cqw" }}>
          <PillButton label="New Shuffle" badge="N" primary />
          <PillButton label="Restart" badge="R" />
          <PillButton label="Copy Link" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.9cqw", fontSize: "1.1cqw", color: "#a5906f" }}>
          <span style={{ borderRadius: "0.4cqw", background: "#0f0c08", padding: "0.2cqw 0.9cqw", fontFamily: "ui-monospace, monospace", letterSpacing: "0.04em", color: "#c9b280" }}>
            seed · m4k2v7q
          </span>
          <span>Arrow keys or tap a tile to slide</span>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "5%", right: "2.5%", maxWidth: "18cqw", textAlign: "right", fontSize: "1.1cqw", lineHeight: 1.4, color: "#a5906f" }}>
        The 15 Puzzle — 1870s America, popularized by Noyes Chapman
      </div>
    </div>
  );
}
