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

const chipLabel: CSSProperties = {
  fontSize: "1cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: INDIGO,
};

function DifficultyChip({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      style={{
        borderRadius: "0.5cqw",
        border: `1px solid ${active ? INDIGO : THIN_LINE}`,
        background: active ? INDIGO : "#fff",
        color: active ? "#fff" : INK,
        fontSize: "1.2cqw",
        fontWeight: 700,
        padding: "0.5cqw 1cqw",
      }}
    >
      {label}
    </span>
  );
}

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
      <div style={{ position: "absolute", top: "3cqw", left: "3cqw", width: "18cqw", ...cardStyle }}>
        <div style={{ fontSize: "2.2cqw", fontWeight: 900 }}>Sudoku</div>
        <div style={{ marginTop: "0.2cqw", ...chipLabel }}>Number Place</div>
        <div style={{ marginTop: "1.2cqw", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6cqw" }}>
          <DifficultyChip label="Easy" active />
          <DifficultyChip label="Medium" active={false} />
          <DifficultyChip label="Hard" active={false} />
          <DifficultyChip label="Expert" active={false} />
        </div>
        <div
          style={{
            marginTop: "1.2cqw",
            borderRadius: "0.5cqw",
            background: INK,
            color: "#fff",
            fontSize: "1.2cqw",
            fontWeight: 800,
            textAlign: "center",
            padding: "0.7cqw",
          }}
        >
          New puzzle
        </div>
      </div>

      <div style={{ position: "absolute", top: "3cqw", right: "3cqw", width: "15cqw", ...cardStyle }}>
        <div style={chipLabel}>Best times</div>
        <div style={{ marginTop: "0.6cqw", display: "flex", flexDirection: "column", gap: "0.4cqw", fontSize: "1.2cqw" }}>
          {["Easy", "Medium", "Hard", "Expert"].map((d) => (
            <div key={d} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{d}</span>
              <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: "#94897a" }}>—</span>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -46%)",
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
          <span style={{ fontSize: "1cqw", textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748b" }}>Enter</span>
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

      <div
        style={{
          position: "absolute",
          bottom: "2.4cqw",
          left: "50%",
          transform: "translateX(-50%)",
          borderRadius: "999px",
          background: "rgba(251,248,240,0.8)",
          boxShadow: `0 0 0 1px ${THIN_LINE}`,
          padding: "0.5cqw 1.4cqw",
          fontSize: "1.1cqw",
          fontWeight: 500,
          color: "#64748b",
        }}
      >
        Number Place — Howard Garns (1979); popularized as Sudoku by Nikoli
      </div>
    </div>
  );
}
