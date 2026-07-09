import { type ActivePiece } from "../../tetris/logic";
import { PIECE_COLORS, PIECE_ROTATIONS, type PieceType } from "../../tetris/pieces";
import type { TetrisSnapshot } from "../../tetris/store";

function ghostCellSet(active: ActivePiece | null, ghostY: number | null): Set<number> {
  const set = new Set<number>();
  if (active === null || ghostY === null) return set;
  for (const [ox, oy] of PIECE_ROTATIONS[active.type][active.rotation]) {
    set.add((ghostY + oy) * 100 + (active.x + ox));
  }
  return set;
}

export function Board({ snapshot, compact = false }: { snapshot: TetrisSnapshot; compact?: boolean }) {
  const { board, active, fallOffset, ghostY, danger } = snapshot;
  const ghostSet = ghostCellSet(active, ghostY);
  const activeColor = active === null ? null : PIECE_COLORS[active.type];

  const cellSize = compact
    ? `min(26px, calc((100vw - 24px) / ${board.width}), calc((100dvh - 320px) / ${board.height}))`
    : `min(26px, calc((100vw - 24px) / ${board.width}))`;

  const tiles: React.ReactNode[] = [];
  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) {
      const key = y * 100 + x;
      const locked = board.cells[y * board.width + x] ?? null;
      const isGhost = locked === null && ghostSet.has(key);
      const color = locked === null ? null : PIECE_COLORS[locked];
      tiles.push(
        <div
          key={key}
          className="rounded-[3px]"
          style={{
            width: "var(--cell)",
            height: "var(--cell)",
            background: color ?? "rgba(255,255,255,0.03)",
            boxShadow: color === null ? "inset 0 0 0 1px rgba(255,255,255,0.05)" : "inset 0 2px 3px rgba(255,255,255,0.35), inset 0 -3px 4px rgba(0,0,0,0.4)",
            border: isGhost && activeColor !== null ? `2px solid ${activeColor}` : undefined,
            opacity: isGhost ? 0.35 : 1,
          }}
        />,
      );
    }
  }

  const activeTiles: React.ReactNode[] =
    active === null
      ? []
      : PIECE_ROTATIONS[active.type][active.rotation].map(([ox, oy], i) => (
          <div
            key={i}
            className="absolute rounded-[3px]"
            style={{
              width: "var(--cell)",
              height: "var(--cell)",
              left: `calc((var(--cell) + 1px) * ${active.x + ox})`,
              top: `calc((var(--cell) + 1px) * ${active.y + fallOffset + oy})`,
              background: activeColor ?? undefined,
              boxShadow: "inset 0 2px 3px rgba(255,255,255,0.35), inset 0 -3px 4px rgba(0,0,0,0.4)",
            }}
          />
        ));

  return (
    <div
      className={`relative grid gap-px rounded-lg bg-black/70 p-2 shadow-2xl ring-1 transition-shadow ${
        danger ? "ring-2 ring-red-500 animate-pulse" : "ring-cyan-400/30"
      }`}
      style={{ "--cell": cellSize, gridTemplateColumns: `repeat(${board.width}, var(--cell))` } as React.CSSProperties}
    >
      {tiles}
      <div className="absolute inset-2">{activeTiles}</div>
    </div>
  );
}

export function PiecePreview({ type }: { type: PieceType | null }) {
  const cells = type === null ? [] : PIECE_ROTATIONS[type][0];
  const filled = new Set(cells.map(([x, y]) => y * 4 + x));
  const color = type === null ? null : PIECE_COLORS[type];
  const tiles: React.ReactNode[] = [];
  for (let i = 0; i < 16; i += 1) {
    const on = filled.has(i);
    tiles.push(
      <div
        key={i}
        className="rounded-[2px]"
        style={{
          width: 15,
          height: 15,
          background: on && color !== null ? color : "transparent",
          boxShadow: on ? "inset 0 1px 2px rgba(255,255,255,0.35), inset 0 -2px 3px rgba(0,0,0,0.4)" : undefined,
        }}
      />,
    );
  }
  return (
    <div className="grid grid-cols-4 gap-px" style={{ width: 15 * 4 + 3 }}>
      {tiles}
    </div>
  );
}
