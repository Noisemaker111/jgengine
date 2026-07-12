import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const panelStyle: CSSProperties = {
  borderRadius: "0.8cqw",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(15,23,42,0.8)",
  padding: "1cqw",
  boxShadow: "0 0.4cqw 1.2cqw rgba(0,0,0,0.4)",
};

const panelTitleStyle: CSSProperties = {
  marginBottom: "0.8cqw",
  fontSize: "1.1cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.2em",
  color: "rgba(103,232,249,0.8)",
};

const statNameStyle: CSSProperties = {
  fontSize: "1cqw",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#94a3b8",
};

const statValueStyle: CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: "2.1cqw",
  fontWeight: 700,
  color: "#fff",
};

const MINI_CELL = "0.9cqw";

function MiniPiece({ cells, color }: { cells: readonly (readonly [number, number])[]; color: string | null }) {
  const filled = new Set(cells.map(([x, y]) => y * 4 + x));
  const tiles = [];
  for (let i = 0; i < 16; i += 1) {
    const on = filled.has(i);
    tiles.push(
      <span
        key={i}
        style={{
          width: MINI_CELL,
          height: MINI_CELL,
          borderRadius: "0.15cqw",
          background: on && color !== null ? color : "transparent",
        }}
      />,
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(4, ${MINI_CELL})`,
        gap: "0.1cqw",
      }}
    >
      {tiles}
    </div>
  );
}

function Stat({ name, value }: { name: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1cqw" }}>
      <span style={statNameStyle}>{name}</span>
      <span style={statValueStyle}>{value}</span>
    </div>
  );
}

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const CELL = "1.9cqw";

const SPAWN_COLUMN = 3;
const boardCells = Array.from({ length: BOARD_WIDTH * BOARD_HEIGHT }, () => null as string | null);
const activeT: readonly (readonly [number, number])[] = [
  [1 + SPAWN_COLUMN, 0],
  [0 + SPAWN_COLUMN, 1],
  [1 + SPAWN_COLUMN, 1],
  [2 + SPAWN_COLUMN, 1],
];
const activeColor = "#a855f7";
const activeSet = new Set(activeT.map(([x, y]) => y * BOARD_WIDTH + x));
const ghostY = 18;
const ghostSet = new Set(activeT.map(([x, y]) => (y + ghostY) * BOARD_WIDTH + x));

export default function BlockStackerPreview({ className }: GamePreviewProps) {
  const boardTiles = [];
  for (let i = 0; i < BOARD_WIDTH * BOARD_HEIGHT; i += 1) {
    const isActive = activeSet.has(i);
    const isGhost = !isActive && ghostSet.has(i);
    boardTiles.push(
      <span
        key={i}
        style={{
          width: CELL,
          height: CELL,
          borderRadius: "0.15cqw",
          background: isActive ? activeColor : "rgba(255,255,255,0.03)",
          boxShadow: isActive
            ? "inset 0 0.15cqw 0.2cqw rgba(255,255,255,0.35), inset 0 -0.2cqw 0.25cqw rgba(0,0,0,0.4)"
            : "inset 0 0 0 1px rgba(255,255,255,0.05)",
          border: isGhost ? `2px solid ${activeColor}` : undefined,
          opacity: isGhost ? 0.35 : 1,
        }}
      />,
    );
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
        background: "linear-gradient(#0b1120 0%, #0f172a 100%)",
        color: "#fff",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "2.4cqw",
        padding: "3cqw",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.6cqw", width: "13cqw" }}>
        <div style={panelStyle}>
          <div style={panelTitleStyle}>Hold</div>
          <div style={{ opacity: 0.4 }}>
            <MiniPiece cells={[]} color={null} />
          </div>
        </div>
        <div style={panelStyle}>
          <div style={panelTitleStyle}>Stats</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.7cqw" }}>
            <Stat name="Score" value="0" />
            <Stat name="Best" value="0" />
            <Stat name="Lines" value="0" />
            <Stat name="Level" value="1" />
          </div>
        </div>
      </div>

      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: `repeat(${BOARD_WIDTH}, ${CELL})`,
            gap: "1px",
            borderRadius: "0.6cqw",
            background: "rgba(0,0,0,0.7)",
            padding: "0.8cqw",
            boxShadow: "inset 0 0 0 1px rgba(103,232,249,0.3)",
          }}
        >
          {boardTiles}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.6cqw", width: "13cqw" }}>
        <div style={panelStyle}>
          <div style={panelTitleStyle}>Next</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8cqw" }}>
            <MiniPiece
              cells={[
                [0, 1],
                [1, 1],
                [2, 1],
                [3, 1],
              ]}
              color="#22d3ee"
            />
            <MiniPiece
              cells={[
                [1, 0],
                [2, 0],
                [1, 1],
                [2, 1],
              ]}
              color="#eab308"
            />
            <MiniPiece
              cells={[
                [1, 0],
                [2, 0],
                [0, 1],
                [1, 1],
              ]}
              color="#22c55e"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
