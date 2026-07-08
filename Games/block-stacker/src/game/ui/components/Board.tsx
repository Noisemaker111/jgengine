import { pieceCells, type ActivePiece } from "../../tetris/logic";
import { PIECE_COLORS, PIECE_ROTATIONS, type PieceType } from "../../tetris/pieces";
import type { TetrisSnapshot } from "../../tetris/store";

const CELL = 26;

function activeCellSet(active: ActivePiece | null): Set<number> {
  const set = new Set<number>();
  if (active === null) return set;
  for (const [x, y] of pieceCells(active)) set.add(y * 100 + x);
  return set;
}

function ghostCellSet(active: ActivePiece | null, ghostY: number | null): Set<number> {
  const set = new Set<number>();
  if (active === null || ghostY === null) return set;
  for (const [x, y] of pieceCells({ ...active, y: ghostY })) set.add(y * 100 + x);
  return set;
}

export function Board({ snapshot }: { snapshot: TetrisSnapshot }) {
  const { board, active, ghostY, danger } = snapshot;
  const activeSet = activeCellSet(active);
  const ghostSet = ghostCellSet(active, ghostY);
  const activeColor = active === null ? null : PIECE_COLORS[active.type];

  const tiles: React.ReactNode[] = [];
  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) {
      const key = y * 100 + x;
      const locked = board.cells[y * board.width + x] ?? null;
      const isActive = activeSet.has(key);
      const isGhost = !isActive && locked === null && ghostSet.has(key);
      const color = isActive ? activeColor : locked === null ? null : PIECE_COLORS[locked];
      tiles.push(
        <div
          key={key}
          className="rounded-[3px]"
          style={{
            width: CELL,
            height: CELL,
            background: color ?? "rgba(255,255,255,0.03)",
            boxShadow: color === null ? "inset 0 0 0 1px rgba(255,255,255,0.05)" : "inset 0 2px 3px rgba(255,255,255,0.35), inset 0 -3px 4px rgba(0,0,0,0.4)",
            border: isGhost && activeColor !== null ? `2px solid ${activeColor}` : undefined,
            opacity: isGhost ? 0.35 : 1,
          }}
        />,
      );
    }
  }

  return (
    <div
      className={`grid gap-px rounded-lg bg-black/70 p-2 shadow-2xl ring-1 transition-shadow ${
        danger ? "ring-2 ring-red-500 animate-pulse" : "ring-cyan-400/30"
      }`}
      style={{ gridTemplateColumns: `repeat(${board.width}, ${CELL}px)` }}
    >
      {tiles}
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
