import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const COLS = 5;
const ROWS = 6;

type Kind = "wall" | "floor" | "goal";

const GRID: Kind[][] = [
  ["wall", "wall", "wall", "wall", "wall"],
  ["wall", "floor", "floor", "floor", "wall"],
  ["wall", "floor", "floor", "floor", "wall"],
  ["wall", "floor", "floor", "floor", "wall"],
  ["wall", "goal", "floor", "floor", "wall"],
  ["wall", "wall", "wall", "wall", "wall"],
];

const PLAYER = { x: 1, y: 1 };
const CRATE = { x: 1, y: 2 };

const tokenStyle: CSSProperties = {
  gridColumn: "1 / 2",
  gridRow: "1 / 2",
  width: "100%",
  height: "100%",
};

function Tile({ kind }: { kind: Kind }) {
  if (kind === "wall") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(180deg, #3a2f22 0%, #241b12 55%, #1c150d 100%)",
          borderTop: "1px solid #4d3f2d",
          boxShadow: "inset 0 -0.3cqw 0.5cqw rgba(0,0,0,0.55)",
        }}
      />
    );
  }
  return (
    <div style={{ width: "100%", height: "100%", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)" }}>
      {kind === "goal" ? (
        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
          <div
            style={{
              width: "42%",
              height: "42%",
              borderRadius: "50%",
              border: "0.5cqw solid #d99a35",
              boxShadow: "0 0 0.8cqw rgba(245,178,60,0.55), inset 0 0 0.5cqw rgba(255,214,132,0.6)",
              background: "radial-gradient(circle, rgba(255,205,120,0.35), rgba(255,205,120,0) 70%)",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function CrateKeeperPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#1a140c",
        color: "#fffbeb",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "62cqw",
          aspectRatio: `${COLS} / ${ROWS}`,
          borderRadius: "1.4cqw",
          background: "linear-gradient(135deg, #2f2a20, #211c15)",
          boxShadow: "0 0 0 0.15cqw rgba(84,68,44,0.7), 0 1.8cqw 4cqw rgba(0,0,0,0.55)",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        }}
      >
        {GRID.map((row, y) =>
          row.map((kind, x) => (
            <div key={`${x}-${y}`} style={{ gridColumn: x + 1, gridRow: y + 1 }}>
              <Tile kind={kind} />
            </div>
          )),
        )}

        <div style={{ ...tokenStyle, gridColumn: CRATE.x + 1, gridRow: CRATE.y + 1, padding: "7%" }}>
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "0.6cqw",
              background: "linear-gradient(155deg, #c88a4c 0%, #a5652f 60%, #8a5223 100%)",
              border: "0.15cqw solid #6f4420",
              boxShadow: "0 0.3cqw 0.6cqw rgba(0,0,0,0.4), inset 0 0.3cqw 0.5cqw rgba(255,224,180,0.28)",
            }}
          />
        </div>

        <div style={{ ...tokenStyle, gridColumn: PLAYER.x + 1, gridRow: PLAYER.y + 1, padding: "8%" }}>
          <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden style={{ filter: "drop-shadow(0 0.15cqw 0.2cqw rgba(0,0,0,0.5))" }}>
            <ellipse cx="12" cy="21.2" rx="6.2" ry="1.5" fill="rgba(0,0,0,0.32)" />
            <rect x="8.4" y="16.5" width="2.6" height="4" rx="1" fill="#2c231a" />
            <rect x="13" y="16.5" width="2.6" height="4" rx="1" fill="#2c231a" />
            <rect x="6.6" y="10.6" width="10.8" height="8.4" rx="3.4" fill="#dd8b32" />
            <rect x="6.6" y="14.4" width="10.8" height="1.7" fill="#3b2c1c" opacity="0.55" />
            <circle cx="12" cy="7.6" r="3.5" fill="#f3d6a2" />
            <path d="M8.2 6.6c0.6-2.4 7-2.4 7.6 0 -1.2-0.9-6.4-0.9-7.6 0z" fill="#33291d" />
            <circle cx="10.7" cy="7.9" r="0.55" fill="#2a2018" />
            <circle cx="13.3" cy="7.9" r="0.55" fill="#2a2018" />
          </svg>
        </div>
      </div>

      <span
        style={{
          position: "absolute",
          top: "4cqh",
          left: "5cqw",
          fontSize: "1.6cqw",
          fontWeight: 900,
          color: "#fef3c7",
        }}
      >
        Down the Aisle
      </span>
      <span
        style={{
          position: "absolute",
          top: "4cqh",
          right: "5cqw",
          borderRadius: "0.6cqw",
          background: "rgba(0,0,0,0.35)",
          padding: "0.5cqw 1cqw",
          fontSize: "1.4cqw",
          fontWeight: 700,
          color: "#fbbf24",
        }}
      >
        0 moves
      </span>
    </div>
  );
}
