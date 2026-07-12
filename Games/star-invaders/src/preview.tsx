import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const FIELD_W = 224;
const FIELD_H = 256;

const ROW_COLOR: readonly string[] = ["#5ff2ff", "#84ff6b", "#84ff6b", "#eaf3ff", "#eaf3ff"];
const CANNON_COLOR = "#54ff9f";
const BUNKER_COLOR = "#57d986";

const COLS = 11;
const ROWS = 5;
const CELL_W = 16;
const CELL_H = 14;
const FORMATION_X = 26;
const FORMATION_Y = 40;

const CANNON_W = 13;
const CANNON_H = 8;
const CANNON_Y = 234;
const CANNON_X = (FIELD_W - CANNON_W) / 2;

const BUNKER_W = 22;
const BUNKER_H = 16;
const BUNKER_Y = 188;
const BUNKER_EDGE = 18;
const BUNKER_GAP = (FIELD_W - 2 * BUNKER_EDGE - 4 * BUNKER_W) / 3;

function pct(value: number, of: number): string {
  return `${(value / of) * 100}%`;
}

function alienStyle(row: number, col: number): CSSProperties {
  const slotX = FORMATION_X + col * CELL_W;
  const x = slotX + 3;
  const y = FORMATION_Y + row * CELL_H;
  return {
    position: "absolute",
    left: pct(x, FIELD_W),
    top: pct(y, FIELD_H),
    width: pct(10, FIELD_W),
    height: pct(8, FIELD_H),
    borderRadius: "1px",
    background: ROW_COLOR[row],
    boxShadow: `0 0 0.6cqw ${ROW_COLOR[row]}88`,
  };
}

function bunkerStyle(index: number): CSSProperties {
  const x = BUNKER_EDGE + index * (BUNKER_W + BUNKER_GAP);
  return {
    position: "absolute",
    left: pct(x, FIELD_W),
    top: pct(BUNKER_Y, FIELD_H),
    width: pct(BUNKER_W, FIELD_W),
    height: pct(BUNKER_H, FIELD_H),
    borderRadius: "0.4cqw 0.4cqw 0 0",
    background: BUNKER_COLOR,
    clipPath: "polygon(0% 100%, 0% 30%, 15% 10%, 85% 10%, 100% 30%, 100% 100%, 65% 100%, 65% 65%, 35% 65%, 35% 100%)",
  };
}

export default function StarInvadersPreview({ className }: GamePreviewProps) {
  const aliens: { row: number; col: number }[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) aliens.push({ row: r, col: c });
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
        background: "radial-gradient(circle at 50% -20%, #071227 0%, #010208 60%)",
        color: "#fff",
        fontFamily: "ui-monospace, monospace",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.5,
          backgroundImage:
            "radial-gradient(1.5px 1.5px at 12% 22%, #fff, transparent), radial-gradient(1.5px 1.5px at 32% 68%, #fff, transparent), radial-gradient(1.5px 1.5px at 58% 34%, #fff, transparent), radial-gradient(1.5px 1.5px at 78% 78%, #fff, transparent), radial-gradient(1.5px 1.5px at 88% 18%, #fff, transparent), radial-gradient(1.5px 1.5px at 20% 88%, #fff, transparent)",
        }}
      />

      {aliens.map((a) => (
        <div key={`${a.row}-${a.col}`} style={alienStyle(a.row, a.col)} />
      ))}

      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={bunkerStyle(i)} />
      ))}

      <div
        style={{
          position: "absolute",
          left: pct(CANNON_X, FIELD_W),
          top: pct(CANNON_Y, FIELD_H),
          width: pct(CANNON_W, FIELD_W),
          height: pct(CANNON_H, FIELD_H),
          borderRadius: "1px 1px 0 0",
          background: CANNON_COLOR,
          boxShadow: `0 0 1cqw ${CANNON_COLOR}88`,
        }}
      />

      <span
        style={{
          position: "absolute",
          top: "2.4cqh",
          left: "3cqw",
          fontSize: "2cqw",
          fontWeight: 800,
          letterSpacing: "0.15em",
          color: "#54ff9f",
          textShadow: "0 0 1.4cqw rgba(84,255,159,0.5)",
        }}
      >
        Score 0
      </span>
      <span
        style={{
          position: "absolute",
          top: "2.4cqh",
          right: "3cqw",
          fontSize: "2cqw",
          fontWeight: 800,
          letterSpacing: "0.15em",
          color: "#f472b6",
          textShadow: "0 0 1.4cqw rgba(244,114,182,0.5)",
        }}
      >
        {"▲".repeat(3)}
      </span>
    </div>
  );
}
