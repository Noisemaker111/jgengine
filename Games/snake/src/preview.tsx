import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const PHOSPHOR = "#7dffb0";
const CELL = 6;

type Seg = { x: number; y: number };

const SNAKE: Seg[] = [
  { x: 6, y: 5 },
  { x: 5, y: 5 },
  { x: 4, y: 5 },
];
const FOOD: Seg = { x: 11, y: 5 };

function cell(x: number, y: number): CSSProperties {
  return {
    position: "absolute",
    left: `${x * CELL}cqw`,
    top: `${y * CELL}cqh`,
    width: `${CELL}cqw`,
    height: `${CELL}cqh`,
  };
}

export default function SnakePreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#05100b",
        fontFamily: "ui-monospace, monospace",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(125,255,176,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(125,255,176,0.06) 1px, transparent 1px)",
          backgroundSize: "6cqw 6cqh",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% 45%, rgba(5,25,16,0.35), rgba(3,12,8,0.9))",
        }}
      />

      {SNAKE.map((s, i) => (
        <div
          key={`${s.x}-${s.y}`}
          style={{
            ...cell(s.x, s.y),
            padding: "0.5cqw",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "100%",
              borderRadius: "1cqw",
              background: i === 0 ? PHOSPHOR : "rgba(125,255,176,0.7)",
              boxShadow: i === 0 ? "0 0 2.5cqw rgba(90,255,150,0.6)" : "0 0 1.2cqw rgba(90,255,150,0.35)",
            }}
          />
        </div>
      ))}

      <div style={{ ...cell(FOOD.x, FOOD.y), padding: "1.2cqw" }}>
        <div
          style={{
            height: "100%",
            width: "100%",
            borderRadius: "50%",
            background: "#ff6b8a",
            boxShadow: "0 0 2.5cqw rgba(255,107,138,0.7)",
          }}
        />
      </div>

      <span
        style={{
          position: "absolute",
          top: "3cqh",
          left: "3cqw",
          fontSize: "2.2cqw",
          fontWeight: 800,
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: PHOSPHOR,
          textShadow: "0 0 2cqw rgba(90,255,150,0.5)",
        }}
      >
        Score 0
      </span>
    </div>
  );
}
