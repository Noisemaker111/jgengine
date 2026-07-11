import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { Clue, Puzzle } from "../../logic/types";
import { colClueDone, rowClueDone } from "../../state/engine";
import type { AppState } from "../../state/types";
import type { Commands } from "../hooks";
import {
  cellSizeCss,
  clueFontCss,
  CROSS,
  INK,
  INK_DIM,
  LINE,
  LINE_HEAVY,
  PAPER,
  TEAL,
} from "../theme";

interface BoardProps {
  app: AppState;
  puzzle: Puzzle;
  commands: Commands;
}

interface DragState {
  active: boolean;
  lastR: number;
  lastC: number;
}

function clueText(clue: Clue): number[] {
  return clue.length === 0 ? [0] : [...clue];
}

export function Board({ app, puzzle, commands }: BoardProps) {
  const dragRef = useRef<DragState>({ active: false, lastR: -1, lastC: -1 });
  const size = puzzle.size;
  const cell = cellSizeCss(size);
  const clueFont = clueFontCss(size);
  const reveal = app.status === "won";
  const locked = app.status !== "solving";

  const maxRowSlots = Math.max(1, ...puzzle.rowClues.map((c) => Math.max(1, c.length)));
  const maxColSlots = Math.max(1, ...puzzle.colClues.map((c) => Math.max(1, c.length)));
  const rowGutter = `calc(${maxRowSlots} * ${cell} * 0.72 + 8px)`;
  const colGutter = `calc(${maxColSlots} * ${cell} * 0.66 + 8px)`;

  const cellFromEvent = (e: ReactPointerEvent): { r: number; c: number } | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el instanceof HTMLElement ? el.closest("[data-cell]") : null;
    if (!(target instanceof HTMLElement)) return null;
    const r = Number(target.dataset.r);
    const c = Number(target.dataset.c);
    return Number.isInteger(r) && Number.isInteger(c) ? { r, c } : null;
  };

  const onPointerDown = (e: ReactPointerEvent): void => {
    if (locked) return;
    const hit = cellFromEvent(e);
    if (hit === null) return;
    let mode: "fill" | "cross";
    if (e.pointerType === "mouse") {
      if (e.button === 2) mode = "cross";
      else if (e.button === 0) mode = "fill";
      else return;
    } else {
      mode = app.paintMode;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { active: true, lastR: hit.r, lastC: hit.c };
    commands.run("paintStart", { r: hit.r, c: hit.c, mode });
  };

  const onPointerMove = (e: ReactPointerEvent): void => {
    if (!dragRef.current.active) return;
    const hit = cellFromEvent(e);
    if (hit === null) return;
    if (hit.r === dragRef.current.lastR && hit.c === dragRef.current.lastC) return;
    dragRef.current.lastR = hit.r;
    dragRef.current.lastC = hit.c;
    commands.run("paintAdd", { r: hit.r, c: hit.c });
  };

  const endDrag = (e: ReactPointerEvent): void => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* capture already released */
    }
    commands.run("paintEnd", {});
  };

  const rowDone = puzzle.rowClues.map((_, r) => rowClueDone(app.board, r, puzzle));
  const colDone = puzzle.colClues.map((_, c) => colClueDone(app.board, c, puzzle));

  const outer: CSSProperties = {
    display: "grid",
    gridTemplateColumns: `${rowGutter} auto`,
    gridTemplateRows: `${colGutter} auto`,
    padding: 14,
    borderRadius: 18,
    background: "#fbf7ec",
    boxShadow: "0 18px 45px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(179,163,124,0.35)",
  };

  return (
    <div style={outer}>
      <div />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${size}, ${cell})` }}>
        {puzzle.colClues.map((clue, c) => (
          <div
            key={`col-${c}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 1,
              paddingBottom: 5,
              fontSize: clueFont,
              fontWeight: 700,
              lineHeight: 1.05,
              color: colDone[c] ? INK_DIM : INK,
              opacity: colDone[c] ? 0.55 : 1,
            }}
          >
            {clueText(clue).map((n, i) => (
              <span key={i}>{n}</span>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateRows: `repeat(${size}, ${cell})` }}>
        {puzzle.rowClues.map((clue, r) => (
          <div
            key={`row-${r}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 6,
              paddingRight: 7,
              fontSize: clueFont,
              fontWeight: 700,
              lineHeight: 1,
              color: rowDone[r] ? INK_DIM : INK,
              opacity: rowDone[r] ? 0.55 : 1,
            }}
          >
            {clueText(clue).map((n, i) => (
              <span key={i}>{n}</span>
            ))}
          </div>
        ))}
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${size}, ${cell})`,
          gridTemplateRows: `repeat(${size}, ${cell})`,
          background: PAPER,
          borderTop: `2px solid ${LINE_HEAVY}`,
          borderLeft: `2px solid ${LINE_HEAVY}`,
          touchAction: "none",
          cursor: locked ? "default" : "crosshair",
        }}
      >
        {puzzle.solution.map((solRow, r) =>
          solRow.map((_, c) => {
            const mark = app.board[r][c];
            const heavyRight = (c + 1) % 5 === 0;
            const heavyBottom = (r + 1) % 5 === 0;
            const fillColor = reveal ? (puzzle.colors[r][c] ?? TEAL) : TEAL;
            return (
              <div
                key={`${r}-${c}`}
                data-cell=""
                data-r={r}
                data-c={c}
                style={{
                  position: "relative",
                  borderRight: `${heavyRight ? 2 : 1}px solid ${heavyRight ? LINE_HEAVY : LINE}`,
                  borderBottom: `${heavyBottom ? 2 : 1}px solid ${heavyBottom ? LINE_HEAVY : LINE}`,
                  background: mark === "fill" ? fillColor : "transparent",
                  boxShadow: mark === "fill" ? "inset 0 0 0 1px rgba(255,255,255,0.14)" : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {mark === "cross" && !reveal && (
                  <span
                    style={{
                      pointerEvents: "none",
                      color: CROSS,
                      fontSize: `calc(${cell} * 0.62)`,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </span>
                )}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
