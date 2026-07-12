import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const PALETTE = {
  mahogany: "#4a2c22",
  brass: "#c9a227",
  midnightBlue: "#1d2b4a",
  velvetRed: "#7a1f2b",
  candlelight: "#f2e3c2",
} as const;

const MIN_X = -4.5;
const MAX_X = 34.5;
const MIN_Z = -4.5;
const MAX_Z = 24.5;

function toPct(x: number, z: number): { left: string; top: string } {
  return {
    left: `${(((x - MIN_X) / (MAX_X - MIN_X)) * 100).toFixed(1)}%`,
    top: `${(((z - MIN_Z) / (MAX_Z - MIN_Z)) * 100).toFixed(1)}%`,
  };
}

type Room = { i: number; j: number };
const ROOMS: Room[] = [
  { i: 0, j: 0 }, { i: 0, j: 1 }, { i: 0, j: 2 },
  { i: 1, j: 0 }, { i: 1, j: 1 }, { i: 1, j: 2 },
  { i: 2, j: 0 }, { i: 2, j: 1 }, { i: 2, j: 2 },
  { i: 3, j: 0 }, { i: 3, j: 1 }, { i: 3, j: 2 },
];

function roomStyle(room: Room): CSSProperties {
  const cx = room.i * 10;
  const cz = room.j * 10;
  const topLeft = toPct(cx - 4.5, cz - 4.5);
  const bottomRight = toPct(cx + 4.5, cz + 4.5);
  return {
    position: "absolute",
    left: topLeft.left,
    top: topLeft.top,
    right: `${100 - Number.parseFloat(bottomRight.left)}%`,
    bottom: `${100 - Number.parseFloat(bottomRight.top)}%`,
    background: "linear-gradient(155deg, rgba(74,44,34,0.5), rgba(29,43,74,0.35))",
    border: "1px solid rgba(201,162,39,0.18)",
  };
}

const GUARDS = [
  { id: "higgins", x: 0, z: 0 },
  { id: "reeve", x: 10, z: 0 },
  { id: "voss", x: 20, z: 0 },
  { id: "blythe", x: 30, z: 0 },
  { id: "marchetti", x: 0, z: 10 },
  { id: "corwin", x: 26, z: 10 },
];

const TREASURES = [
  { id: "clock", x: 12.2, z: -1.2 },
  { id: "folio", x: 18, z: 1.6 },
  { id: "necklace", x: 30, z: 7.8 },
  { id: "saber", x: 32.2, z: 21.6 },
  { id: "epergne", x: -1.8, z: 18.6 },
];

const PLAYER = { x: 0, z: -3.6 };

export default function ClockworkHeistPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: `linear-gradient(160deg, ${PALETTE.midnightBlue} 0%, #07101d 65%, #03070d 100%)`,
        color: PALETTE.candlelight,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      {ROOMS.map((room) => (
        <div key={`${room.i}-${room.j}`} style={roomStyle(room)} />
      ))}

      {TREASURES.map((t) => {
        const p = toPct(t.x, t.z);
        return (
          <span
            key={t.id}
            style={{
              position: "absolute",
              left: p.left,
              top: p.top,
              transform: "translate(-50%, -50%)",
              fontSize: "1.6cqw",
              color: PALETTE.brass,
              textShadow: "0 0 0.6cqw rgba(201,162,39,0.7)",
            }}
          >
            ★
          </span>
        );
      })}

      {GUARDS.map((g) => {
        const p = toPct(g.x, g.z);
        return (
          <span
            key={g.id}
            style={{
              position: "absolute",
              left: p.left,
              top: p.top,
              transform: "translate(-50%, -50%)",
              width: "1.4cqw",
              height: "1.4cqw",
              borderRadius: "50%",
              background: PALETTE.velvetRed,
              boxShadow: "0 0 0.6cqw rgba(122,31,43,0.8)",
            }}
          />
        );
      })}

      <span
        style={{
          position: "absolute",
          ...toPct(PLAYER.x, PLAYER.z),
          transform: "translate(-50%, -50%)",
          width: "1.6cqw",
          height: "1.6cqw",
          borderRadius: "50%",
          background: PALETTE.brass,
          border: "1px solid #000",
          boxShadow: "0 0 0.8cqw rgba(201,162,39,0.85)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "3cqh",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.5cqw",
          borderRadius: "0 0 0.8cqw 0.8cqw",
          border: `1px solid rgba(201,162,39,0.6)`,
          borderTop: "none",
          background: "rgba(11,15,28,0.85)",
          padding: "1cqw 2cqw",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.6cqw" }}>
          <span style={{ fontFamily: "Georgia, serif", fontSize: "2.2cqw", fontWeight: 700, color: PALETTE.candlelight }}>
            00:00
          </span>
          <span style={{ fontSize: "0.9cqw", textTransform: "uppercase", letterSpacing: "0.24em", color: PALETTE.brass }}>
            until dawn
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.5cqw" }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: "0.8cqw",
                height: "0.8cqw",
                borderRadius: "50%",
                border: `1px solid ${PALETTE.velvetRed}`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
