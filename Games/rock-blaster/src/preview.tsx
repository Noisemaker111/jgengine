import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const FIELD_W = 800;
const FIELD_H = 600;

const STROKE = "#f4f8ff";
const GLOW = "rgba(150, 210, 255, 0.85)";
const ACCENT = "#ffcf6a";
const WAVE_BLUE = "#bfe0ff";
const LABEL = "#6f93c8";
const PANEL_BG = "rgba(2, 8, 20, 0.6)";
const PANEL_BORDER = "rgba(150, 190, 255, 0.28)";

const ROCK_MULTS = [1, 0.82, 1.08, 0.78, 1.12, 0.85, 1.05, 0.8, 0.96, 1.1, 0.84, 1.02];

interface RockSpec {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly rot: number;
}

const ROCKS: readonly RockSpec[] = [
  { x: 150, y: 140, radius: 42, rot: 0.3 },
  { x: 650, y: 120, radius: 42, rot: 1.8 },
  { x: 175, y: 470, radius: 42, rot: 3.4 },
  { x: 635, y: 460, radius: 42, rot: 5.1 },
];

function rockPoints(rock: RockSpec): string {
  const n = ROCK_MULTS.length;
  const pts: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + rock.rot;
    const r = rock.radius * ROCK_MULTS[i]!;
    pts.push(`${rock.x + Math.cos(a) * r},${rock.y + Math.sin(a) * r}`);
  }
  return pts.join(" ");
}

const SHIP_X = FIELD_W / 2;
const SHIP_Y = FIELD_H / 2;
const SHIP_POINTS = "0,-16 11,12 5,7 -5,7 -11,12";

interface Star {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly a: number;
}

const STAR_COUNT = 46;

function starAt(i: number): Star {
  const gx = Math.sin(i * 12.9898) * 43758.5453;
  const gy = Math.sin(i * 78.233) * 12543.987;
  const fx = gx - Math.floor(gx);
  const fy = gy - Math.floor(gy);
  return {
    x: fx * FIELD_W,
    y: fy * FIELD_H,
    r: 0.5 + Math.abs(Math.sin(i * 3.7)) * 1.1,
    a: 0.2 + Math.abs(Math.sin(i * 5.3)) * 0.5,
  };
}

const STARS: readonly Star[] = Array.from({ length: STAR_COUNT }, (_, i) => starAt(i));

const panelStyle: CSSProperties = {
  background: PANEL_BG,
  border: `1px solid ${PANEL_BORDER}`,
  boxShadow: "0 0 1.4cqw rgba(0, 0, 0, 0.5)",
  borderRadius: "0.8cqw",
};

function ShipGlyph({ dim }: { dim: boolean }) {
  return (
    <svg width="1.4cqw" height="1.75cqw" viewBox="-12 -17 24 32" style={{ opacity: dim ? 0.28 : 1 }}>
      <polygon points={SHIP_POINTS} fill="none" stroke={STROKE} strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  );
}

export default function RockBlasterPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#000000",
        color: STROKE,
        fontFamily: "ui-monospace, monospace",
        userSelect: "none",
      }}
    >
      <svg
        viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#cfe4ff" opacity={s.a} />
        ))}
        <g fill="none" stroke={STROKE} strokeWidth={1.7} strokeLinejoin="round">
          {ROCKS.map((r) => (
            <polygon key={`${r.x}-${r.y}`} points={rockPoints(r)} style={{ filter: `drop-shadow(0 0 0.35cqw ${GLOW})` }} />
          ))}
          <polygon
            points={SHIP_POINTS}
            transform={`translate(${SHIP_X}, ${SHIP_Y})`}
            style={{ filter: `drop-shadow(0 0 0.35cqw ${GLOW})` }}
          />
        </g>
        <rect
          x={1}
          y={1}
          width={FIELD_W - 2}
          height={FIELD_H - 2}
          fill="none"
          stroke="rgba(120, 170, 255, 0.22)"
          strokeWidth={2}
        />
      </svg>

      <div style={{ position: "absolute", top: "3cqh", left: "3cqw", ...panelStyle, padding: "0.7cqw 1cqw" }}>
        <div style={{ fontSize: "0.85cqw", textTransform: "uppercase", letterSpacing: "0.3em", color: LABEL }}>
          Score
        </div>
        <div style={{ fontSize: "2.4cqw", fontWeight: 900, lineHeight: 1, color: STROKE, textShadow: `0 0 1cqw ${GLOW}` }}>
          0
        </div>
        <div style={{ marginTop: "0.3cqw", fontSize: "0.9cqw", textTransform: "uppercase", letterSpacing: "0.18em", color: ACCENT }}>
          Hi 0
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: "10.5cqh",
          left: "3cqw",
          ...panelStyle,
          display: "flex",
          alignItems: "center",
          gap: "0.5cqw",
          padding: "0.6cqw 0.9cqw",
        }}
      >
        <ShipGlyph dim={false} />
        <ShipGlyph dim={false} />
        <ShipGlyph dim={false} />
      </div>

      <div
        style={{
          position: "absolute",
          top: "3cqh",
          right: "3cqw",
          ...panelStyle,
          textAlign: "right",
          padding: "0.7cqw 1cqw",
        }}
      >
        <div style={{ fontSize: "0.85cqw", textTransform: "uppercase", letterSpacing: "0.3em", color: LABEL }}>
          Wave
        </div>
        <div style={{ fontSize: "2.1cqw", fontWeight: 900, lineHeight: 1, color: WAVE_BLUE, textShadow: `0 0 1cqw ${GLOW}` }}>
          1
        </div>
      </div>
    </div>
  );
}
