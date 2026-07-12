import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const JADE =
  "radial-gradient(130% 100% at 50% 0%,#1e6f52 0%,#155a41 44%,#0e4631 76%,#0a3324 100%)";
const BONE = "linear-gradient(152deg,#fffdf5 0%,#f4e9d0 55%,#e8dabb 100%)";

const FACES: ReadonlyArray<readonly [string, string]> = [
  ...Array.from({ length: 9 }, (_, i) => [`${i + 1}筒`, "#1f7a8c"] as const),
  ...Array.from({ length: 9 }, (_, i) => [`${i + 1}條`, "#2f8f4e"] as const),
  ...Array.from({ length: 9 }, (_, i) => [`${i + 1}萬`, "#b3322c"] as const),
  ["東", "#33506b"],
  ["南", "#33506b"],
  ["西", "#33506b"],
  ["北", "#33506b"],
  ["中", "#c0392b"],
  ["發", "#2e8b57"],
  ["白", "#2f5d8a"],
  ["梅", "#c65a86"],
  ["蘭", "#c65a86"],
  ["菊", "#c65a86"],
  ["竹", "#c65a86"],
] as const;

interface Slot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function buildTurtle(): Slot[] {
  const slots: Slot[] = [];
  const rows: Record<number, readonly number[]> = {
    0: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
    2: [6, 8, 10, 12, 14, 16, 18, 20],
    4: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
    6: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
    8: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
    10: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
    12: [6, 8, 10, 12, 14, 16, 18, 20],
    14: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
  };
  for (const key of Object.keys(rows)) {
    const y = Number(key);
    for (const x of rows[y]) slots.push({ x, y, z: 0 });
  }
  slots.push({ x: 0, y: 7, z: 0 }, { x: 26, y: 7, z: 0 }, { x: 28, y: 7, z: 0 });
  for (const x of [8, 10, 12, 14, 16, 18]) for (const y of [2, 4, 6, 8, 10, 12]) slots.push({ x, y, z: 1 });
  for (const x of [10, 12, 14, 16]) for (const y of [4, 6, 8, 10]) slots.push({ x, y, z: 2 });
  for (const x of [12, 14]) for (const y of [6, 8]) slots.push({ x, y, z: 3 });
  slots.push({ x: 13, y: 7, z: 4 });
  return slots;
}

const TURTLE: readonly Slot[] = buildTurtle();
const MAX_Z = 4;

const HALF_X = 2.9;
const DEPTH_X = (HALF_X * 5) / 18;
const TILE_W = HALF_X * 2;
const HALF_Y = 4.6;
const DEPTH_Y = (HALF_Y * 5) / 24;
const TILE_H = HALF_Y * 2;
const MARGIN_L = 2;
const MARGIN_T = 13;

function tileStyle(slot: Slot, id: number): CSSProperties {
  const [glyph, color] = FACES[id % FACES.length];
  const left = `${MARGIN_L + slot.x * HALF_X + (MAX_Z - slot.z) * DEPTH_X}cqw`;
  const top = `${MARGIN_T + slot.y * HALF_Y + (MAX_Z - slot.z) * DEPTH_Y}cqh`;
  return {
    position: "absolute",
    left,
    top,
    width: `${TILE_W}cqw`,
    height: `${TILE_H}cqh`,
    zIndex: slot.z * 1000 + slot.y * 30 + slot.x,
    borderRadius: "0.5cqw",
    border: "1px solid rgba(120,92,40,0.35)",
    boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.7), 2px 3px 4px rgba(0,0,0,0.35)",
    background: BONE,
    display: "grid",
    placeItems: "center",
    fontSize: "2cqw",
    fontWeight: 700,
    color,
    fontFamily: "'Noto Sans CJK SC','Noto Sans SC','Microsoft YaHei',serif",
  } satisfies CSSProperties;
}

function faceOf(id: number): string {
  return FACES[id % FACES.length][0];
}

export default function MahjongSolitairePreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: JADE,
        color: "#f3efdc",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      {TURTLE.map((slot, id) => (
        <div key={id} style={tileStyle(slot, id)}>
          {faceOf(id)}
        </div>
      ))}

      <div
        style={{
          position: "absolute",
          top: "2.5cqh",
          left: "2cqw",
          display: "flex",
          gap: "1cqw",
          alignItems: "baseline",
          fontSize: "1.6cqw",
          fontWeight: 800,
          color: "#f3efdc",
          textShadow: "0 1px 2px rgba(0,0,0,0.5)",
        }}
      >
        <span>72 pairs</span>
        <span style={{ opacity: 0.55, fontWeight: 600, fontSize: "1.3cqw" }}>0:00</span>
      </div>
    </div>
  );
}
