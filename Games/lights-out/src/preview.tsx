import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const GRID = 5;
const LIT_CELLS = new Set([0, 1, 5, 8, 12, 13, 14, 16, 18, 20, 21, 22]);

function cellStyle(lit: boolean): CSSProperties {
  const glow = lit
    ? "0 0 3cqw 0.6cqw rgba(255,150,25,0.72), 0 0 7cqw 1.8cqw rgba(255,128,18,0.3), inset 0 0 2.6cqw rgba(255,226,160,0.78), inset 0 -0.6cqw 1.4cqw rgba(120,50,0,0.5)"
    : "inset 0 0.6cqw 1.6cqw rgba(0,0,0,0.85), inset 0 -0.2cqw 0.4cqw rgba(255,255,255,0.03)";
  return {
    aspectRatio: "1 / 1",
    borderRadius: "16%",
    border: "1px solid rgba(0,0,0,0.5)",
    background: lit
      ? "radial-gradient(circle at 50% 37%, #ffe6ab 0%, #ffb232 38%, #e0730c 78%, #7c3d06 100%)"
      : "radial-gradient(circle at 50% 40%, #241f17 0%, #17130d 70%, #100d08 100%)",
    boxShadow: glow,
  };
}

export default function LightsOutPreview({ className }: GamePreviewProps) {
  const cells = [];
  for (let cell = 0; cell < GRID * GRID; cell += 1) {
    cells.push(<div key={cell} style={cellStyle(LIT_CELLS.has(cell))} />);
  }

  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(125% 95% at 50% -5%, #241d14 0%, #17130d 46%, #0b0906 100%)",
        color: "#ece0c8",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "78%",
          borderRadius: "10%",
          padding: "5.2%",
          background:
            "repeating-linear-gradient(122deg, rgba(255,255,255,0.05) 0 2px, rgba(0,0,0,0.07) 2px 5px)," +
            "linear-gradient(150deg, #545b62 0%, #2c3137 42%, #191c20 100%)",
          border: "1px solid #05070a",
          boxShadow:
            "inset 0 1px 1px rgba(255,255,255,0.28), inset 0 -1cqw 2.4cqw rgba(0,0,0,0.6), 0 3cqw 6.4cqw rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${GRID}, 1fr)`, gap: "5.2%" }}>{cells}</div>
      </div>

      <span
        style={{
          position: "absolute",
          top: "3cqh",
          left: "3cqw",
          fontSize: "1.6cqw",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#a5906f",
        }}
      >
        Moves 0
      </span>
    </div>
  );
}
