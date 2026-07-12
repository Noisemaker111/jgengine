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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 1.6cqw" }}>
      <span style={labelStyle}>{label}</span>
      <span style={{ fontFamily: NUMERAL_FONT, fontSize: "1.8cqw", fontWeight: 900, color: "#ece0c8" }}>{value}</span>
    </div>
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
      <div
        style={{
          ...panelStyle,
          position: "absolute",
          top: "5%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "stretch",
          padding: "0.8cqw 0.6cqw",
        }}
      >
        <StatTile label="Moves" value="0" />
        <span style={{ width: "1px", background: "#3a3024" }} />
        <StatTile label="Time" value="0:00" />
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "54%",
          transform: "translate(-50%, -50%)",
          width: "42cqw",
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
                    fontSize: "4.2cqw",
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
    </div>
  );
}
