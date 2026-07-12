import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const PAPER = "#f6f1e3";
const BOX_LINE = "#2b2620";
const THIN_LINE = "#d3c7a4";
const INK = "#26221b";
const INDIGO = "#4338ca";

const ROWS: readonly number[][] = [
  [5, 3, 0, 0, 7, 0, 0, 0, 0],
  [6, 0, 0, 1, 9, 5, 0, 0, 0],
  [0, 9, 8, 0, 0, 0, 0, 6, 0],
  [8, 0, 0, 0, 6, 0, 0, 0, 3],
  [4, 0, 0, 8, 0, 3, 0, 0, 1],
  [7, 0, 0, 0, 2, 0, 0, 0, 6],
  [0, 6, 0, 0, 0, 0, 2, 8, 0],
  [0, 0, 0, 4, 1, 9, 0, 0, 5],
  [0, 0, 0, 0, 8, 0, 0, 7, 9],
];

const cardStyle: CSSProperties = {
  background: "#fbf8f0",
  border: `1px solid ${THIN_LINE}`,
  boxShadow: "0 12px 30px -14px rgba(40,34,22,0.5)",
  color: INK,
  borderRadius: "1cqw",
  padding: "1.4cqw",
};

export default function SudokuPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(125% 125% at 50% 0%, #fbf8ef 0%, #efe7d2 55%, #e2d9c0 100%)",
        color: INK,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.2cqw",
          ...cardStyle,
          width: "44cqw",
        }}
      >
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", fontSize: "1.4cqw", fontWeight: 700 }}>
          <span>Easy</span>
          <span style={{ fontFamily: "ui-monospace, monospace", color: INDIGO, fontSize: "1.8cqw" }}>00:00</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(9, 3cqw)",
            background: PAPER,
            border: `2px solid ${BOX_LINE}`,
          }}
        >
          {ROWS.flatMap((row, r) =>
            row.map((v, c) => (
              <span
                key={`${r}-${c}`}
                style={{
                  width: "3cqw",
                  height: "3cqw",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRight: c === 8 ? "none" : c % 3 === 2 ? `2px solid ${BOX_LINE}` : `1px solid ${THIN_LINE}`,
                  borderBottom: r === 8 ? "none" : r % 3 === 2 ? `2px solid ${BOX_LINE}` : `1px solid ${THIN_LINE}`,
                  fontSize: "1.7cqw",
                  fontWeight: 800,
                  color: INK,
                }}
              >
                {v === 0 ? "" : v}
              </span>
            )),
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: "0.4cqw", width: "100%" }}>
          {Array.from({ length: 9 }, (_, k) => (
            <div
              key={k}
              style={{
                borderRadius: "0.4cqw",
                border: `1px solid ${THIN_LINE}`,
                background: "#fbf8f0",
                color: INDIGO,
                textAlign: "center",
                padding: "0.5cqw 0",
                fontSize: "1.4cqw",
                fontWeight: 800,
              }}
            >
              {k + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
