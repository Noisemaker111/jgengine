import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const cellStyle: CSSProperties = {
  borderRadius: "0.7cqw",
  background: "rgba(255,247,230,0.32)",
  boxShadow: "inset 0 0.15cqw 0.3cqw rgba(90,55,20,0.12)",
};

const startTiles: { row: number; col: number }[] = [
  { row: 0, col: 1 },
  { row: 2, col: 3 },
];

export default function Slide2048Preview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(130% 90% at 50% -12%, #fdf6e6 0%, #f4e7cd 52%, #ead9b8 100%)",
        color: "#5b4128",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.6cqw",
          padding: "2cqw",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2cqw",
            width: "56cqw",
          }}
        >
          <div
            style={{
              fontSize: "2.4cqw",
              fontWeight: 900,
              lineHeight: 1,
              background: "linear-gradient(160deg, #e79c2a 0%, #d8552a 48%, #b31d47 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }}
          >
            2048
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: "1cqw" }}>
            <div
              style={{
                minWidth: "8cqw",
                padding: "0.6cqw 1.2cqw",
                borderRadius: "0.9cqw",
                textAlign: "center",
                color: "#fbf1dd",
                background: "linear-gradient(180deg, #bd9d73 0%, #a9885f 100%)",
              }}
            >
              <div style={{ fontSize: "1.1cqw", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#f0dcbd" }}>
                Score
              </div>
              <div style={{ fontSize: "2cqw", fontWeight: 900 }}>0</div>
            </div>
            <div
              style={{
                minWidth: "8cqw",
                padding: "0.6cqw 1.2cqw",
                borderRadius: "0.9cqw",
                textAlign: "center",
                color: "#fbf1dd",
                background: "linear-gradient(180deg, #bd9d73 0%, #a9885f 100%)",
              }}
            >
              <div style={{ fontSize: "1.1cqw", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#f0dcbd" }}>
                Best
              </div>
              <div style={{ fontSize: "2cqw", fontWeight: 900 }}>0</div>
            </div>
          </div>
        </div>

        <div
          style={{
            position: "relative",
            width: "56cqw",
            aspectRatio: "1",
            borderRadius: "1.4cqw",
            background: "linear-gradient(160deg, #bf9f75 0%, #a9895f 100%)",
            boxShadow: "0 1cqw 2.6cqw rgba(90,55,20,0.28), inset 0 0.2cqw 0.5cqw rgba(255,255,255,0.14)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "1.2cqw",
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gridTemplateRows: "repeat(4, 1fr)",
              gap: "1cqw",
            }}
          >
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} style={cellStyle} />
            ))}
          </div>
          <div style={{ position: "absolute", inset: "1.2cqw" }}>
            {startTiles.map((tile) => (
              <div
                key={`${tile.row}-${tile.col}`}
                style={{
                  position: "absolute",
                  top: `calc(${tile.row} * (25% + 0.75cqw))`,
                  left: `calc(${tile.col} * (25% + 0.75cqw))`,
                  width: "calc((100% - 3 * 1cqw) / 4)",
                  height: "calc((100% - 3 * 1cqw) / 4)",
                  borderRadius: "0.7cqw",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "3cqw",
                  fontWeight: 900,
                  background: "#f3e5c9",
                  color: "#6b4a2b",
                  boxShadow: "inset 0 0.3cqw 0.4cqw rgba(255,255,255,0.3), inset 0 -0.4cqw 0.6cqw rgba(90,45,15,0.22)",
                }}
              >
                2
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
