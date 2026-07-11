import { memo } from "react";

import { conflictCells, errorCells, isGiven, type Board } from "../../sudoku/board";
import { boxOf, colOf, hasNote, rowOf } from "../../sudoku/grid";
import type { Settings } from "../../state";
import * as T from "../theme";

function NotesGrid({ mask, size, highlight }: { mask: number; size: number; highlight: number }) {
  return (
    <div className="grid grid-cols-3 grid-rows-3" style={{ width: size, height: size }}>
      {Array.from({ length: 9 }, (_, k) => {
        const d = k + 1;
        const on = hasNote(mask, d);
        const hot = on && d === highlight;
        return (
          <span
            key={d}
            className="flex items-center justify-center leading-none"
            style={{ fontSize: Math.round(size * 0.24), color: hot ? T.INDIGO : T.NOTE, fontWeight: hot ? 800 : 500 }}
          >
            {on ? d : ""}
          </span>
        );
      })}
    </div>
  );
}

function CellButtonImpl({
  index,
  board,
  size,
  isSel,
  inPeer,
  sameNum,
  conflict,
  error,
  highlightDigit,
  onSelect,
}: {
  index: number;
  board: Board;
  size: number;
  isSel: boolean;
  inPeer: boolean;
  sameNum: boolean;
  conflict: boolean;
  error: boolean;
  highlightDigit: number;
  onSelect: (index: number) => void;
}) {
  const r = rowOf(index);
  const c = colOf(index);
  const v = board.values[index];
  const given = isGiven(board, index);

  let bg = T.PAPER;
  if (isSel) bg = T.SEL;
  else if (sameNum) bg = T.SAME;
  else if (inPeer) bg = T.PEER;

  let color = given ? T.INK : T.INDIGO;
  if (conflict || error) color = T.CONFLICT;

  const borderRight = c === 8 ? undefined : c % 3 === 2 ? `2.5px solid ${T.BOX_LINE}` : `1px solid ${T.THIN_LINE}`;
  const borderBottom = r === 8 ? undefined : r % 3 === 2 ? `2.5px solid ${T.BOX_LINE}` : `1px solid ${T.THIN_LINE}`;

  return (
    <button
      type="button"
      aria-label={`cell r${r + 1} c${c + 1}`}
      onClick={() => onSelect(index)}
      className="relative flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: bg,
        borderRight,
        borderBottom,
        boxShadow: isSel ? `inset 0 0 0 2px ${T.INDIGO}` : undefined,
        touchAction: "manipulation",
      }}
    >
      {v !== 0 ? (
        <span
          className="leading-none tabular-nums"
          style={{ color, fontSize: Math.round(size * 0.56), fontWeight: given ? 800 : 600 }}
        >
          {v}
        </span>
      ) : board.notes[index] !== 0 ? (
        <NotesGrid mask={board.notes[index]} size={size} highlight={highlightDigit} />
      ) : null}
    </button>
  );
}

const CellButton = memo(CellButtonImpl);

export function BoardGrid({
  board,
  settings,
  size,
  onSelect,
}: {
  board: Board;
  settings: Settings;
  size: number;
  onSelect: (index: number) => void;
}) {
  const conflicts = conflictCells(board);
  const errors = settings.showErrors ? errorCells(board) : null;
  const sel = board.selected;
  const selRow = sel !== null ? rowOf(sel) : -1;
  const selCol = sel !== null ? colOf(sel) : -1;
  const selBox = sel !== null ? boxOf(sel) : -1;
  const selValue = sel !== null ? board.values[sel] : 0;

  return (
    <div className="grid select-none" style={{ gridTemplateColumns: `repeat(9, ${size}px)`, ...T.boardFrame }}>
      {board.values.map((v, i) => {
        const isSel = i === sel;
        const inPeer = sel !== null && !isSel && (rowOf(i) === selRow || colOf(i) === selCol || boxOf(i) === selBox);
        const sameNum = selValue !== 0 && v === selValue && !isSel;
        return (
          <CellButton
            key={i}
            index={i}
            board={board}
            size={size}
            isSel={isSel}
            inPeer={inPeer}
            sameNum={sameNum}
            conflict={conflicts.has(i)}
            error={errors !== null && errors.has(i)}
            highlightDigit={selValue}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}
