import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import { COLS, ROWS, index, isColumnPlayable, landingRow, type Board, type Player } from "../../logic/board";
import { boardFrame, discStyle, emptyHole } from "../theme";

interface BoardGridProps {
  board: Board;
  cellSize: number;
  hoveredCol: number | null;
  interactive: boolean;
  ghostPlayer: Player;
  columnLabels: string[];
  onHoverCol: (col: number | null) => void;
  onDrop: (col: number) => void;
}

export function BoardGrid({
  board,
  cellSize,
  hoveredCol,
  interactive,
  ghostPlayer,
  columnLabels,
  onHoverCol,
  onDrop,
}: BoardGridProps) {
  const gap = Math.max(6, Math.round(cellSize * 0.16));
  const pitch = cellSize + gap;
  const pad = Math.round(cellSize * 0.34);
  const winning = board.winningLine === null ? null : new Set(board.winningLine);
  const lastMove = board.moves.length > 0 ? board.moves[board.moves.length - 1]! : null;
  const ghostRow = hoveredCol !== null ? landingRow(board, hoveredCol) : null;
  const ghostActive = interactive && hoveredCol !== null && ghostRow !== null;

  const columnCursor = (col: number) => (interactive && isColumnPlayable(board, col) ? "pointer" : "default");
  const handleColumnLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) onHoverCol(null);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${COLS}, ${cellSize}px)`, columnGap: gap, paddingInline: pad }}>
        {columnLabels.map((label, col) => {
          const active = hoveredCol === col && interactive;
          return (
            <div
              key={`hint-${col}`}
              className="flex items-center justify-center rounded-md font-black transition-colors"
              style={{
                height: Math.round(cellSize * 0.46),
                fontSize: Math.round(cellSize * 0.3),
                color: active ? "#0f172a" : "#475569",
                background: active ? "rgba(148,163,184,0.6)" : "rgba(148,163,184,0.2)",
              }}
            >
              {label}
            </div>
          );
        })}
      </div>

      <div className="relative rounded-2xl" style={{ ...boardFrame, padding: pad }}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${COLS}, ${cellSize}px)`, gap }}>
          {Array.from({ length: ROWS }, (_, topRow) => {
            const row = ROWS - 1 - topRow;
            return Array.from({ length: COLS }, (_, col) => {
              const i = index(col, row);
              const cell = board.cells[i]!;
              const isGhost = ghostActive && col === hoveredCol && row === ghostRow;
              const isLast = lastMove !== null && lastMove.col === col && lastMove.row === row;
              const isWin = winning !== null && winning.has(i);

              const base = discStyle(cell === 0 ? ghostPlayer : cell);
              const discCss: CSSProperties = isLast
                ? ({ ...base, ["--fir-fall"]: `${-(ROWS - row) * pitch}px` } as CSSProperties)
                : base;

              return (
                <div key={`cell-${i}`} className="relative rounded-full" style={{ width: cellSize, height: cellSize, ...emptyHole }}>
                  {cell !== 0 ? (
                    <div
                      key={isLast ? `drop-${board.moves.length}` : `disc-${i}`}
                      className={`absolute inset-0 rounded-full ${isLast ? "fir-drop" : ""} ${isWin ? "fir-win" : ""}`}
                      style={discCss}
                    />
                  ) : isGhost ? (
                    <div className="fir-ghost absolute inset-0 rounded-full" style={discCss} />
                  ) : null}
                </div>
              );
            });
          })}
        </div>

        <div className="absolute inset-0 flex" style={{ padding: pad }}>
          {Array.from({ length: COLS }, (_, col) => (
            <div
              key={`col-${col}`}
              className="h-full"
              style={{ width: cellSize, marginRight: col < COLS - 1 ? gap : 0, cursor: columnCursor(col) }}
              onPointerEnter={() => onHoverCol(col)}
              onPointerLeave={handleColumnLeave}
              onClick={() => {
                if (interactive) onDrop(col);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
