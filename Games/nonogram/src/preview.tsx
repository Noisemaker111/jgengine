import { Fragment } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const ROW_CLUES: readonly number[][] = [[1, 1], [5], [5], [3], [1]];
const COL_CLUES: readonly number[][] = [[2], [4], [4], [4], [2]];

function ClueText({ clue }: { clue: readonly number[] }) {
  return (
    <span style={{ fontSize: "1.5cqw", fontWeight: 700, color: "#94a3b8", lineHeight: 1.2 }}>{clue.join(" ")}</span>
  );
}

export default function NonogramPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#12161d",
        backgroundImage:
          "radial-gradient(circle at 30% 20%, #1b2430 0, #12161d 60%), repeating-linear-gradient(0deg, rgba(255,255,255,0.028) 0 1px, transparent 1px 30px), repeating-linear-gradient(90deg, rgba(255,255,255,0.028) 0 1px, transparent 1px 30px)",
        color: "#f1f5f9",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "5%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: "1.6cqw",
        }}
      >
        <span style={{ fontSize: "1.8cqw", fontWeight: 800, color: "#f1f5f9" }}>Heart</span>
        <span style={{ fontSize: "1.4cqw", color: "#64748b" }}>0:00</span>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "52%",
          transform: "translate(-50%, -50%)",
          display: "grid",
          gridTemplateColumns: "6cqw repeat(5, 8cqw)",
          gridTemplateRows: "6cqw repeat(5, 8cqw)",
          gap: "0.3cqw",
        }}
      >
        <div />
        {COL_CLUES.map((clue, c) => (
          <div key={`c${c}`} style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: "0.4cqw" }}>
            <ClueText clue={clue} />
          </div>
        ))}
        {ROW_CLUES.map((clue, r) => (
          <Fragment key={r}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "0.6cqw" }}>
              <ClueText clue={clue} />
            </div>
            {Array.from({ length: 5 }, (_, c) => (
              <div
                key={c}
                style={{
                  background: "#f6f1e3",
                  border: "1px solid #d8ccb0",
                  borderRadius: "0.3cqw",
                }}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
