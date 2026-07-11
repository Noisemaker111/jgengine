import { memo, useCallback, useRef, type MouseEvent as ReactMouseEvent } from "react";

import { useGame } from "@jgengine/react/hooks";

import type { Board, Cell, GameStatus } from "../../board";
import { FlagIcon, MineIcon } from "../icons";
import { coveredTile, NUMBER_COLORS, revealedTile } from "../theme";

export type CellAction = "reveal" | "mark" | "chord";
type Dispatch = (index: number, action: CellAction) => void;

const LONG_PRESS_MS = 420;
const MOVE_TOLERANCE = 12;

function CellButtonImpl({
  index,
  cell,
  status,
  struck,
  size,
  dispatch,
  onPressChange,
}: {
  index: number;
  cell: Cell;
  status: GameStatus;
  struck: boolean;
  size: number;
  dispatch: Dispatch;
  onPressChange: (pressing: boolean) => void;
}) {
  const suppressClick = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const touchMoved = useRef(false);

  const lost = status === "lost";
  const finished = status === "won" || status === "lost";
  const showMine = cell.mine && cell.revealed;
  const wrongFlag = lost && cell.mark === "flag" && !cell.mine;
  const openNumber = cell.revealed && !cell.mine && cell.adjacent > 0;

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const armSuppress = () => {
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 500);
  };

  const revealFromCell = () => {
    if (cell.revealed) {
      if (cell.adjacent > 0) dispatch(index, "chord");
    } else {
      dispatch(index, "reveal");
    }
  };

  const style = openNumber || showMine ? revealedTile : cell.revealed ? revealedTile : coveredTile;
  const dangerBg = struck ? { background: "#e5352b" } : null;

  return (
    <button
      type="button"
      aria-label={`cell ${index}`}
      className="relative flex items-center justify-center select-none transition-[filter] duration-75 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
      style={{ width: size, height: size, ...style, ...(dangerBg ?? {}) }}
      disabled={finished && cell.revealed && !showMine}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!cell.revealed) dispatch(index, "mark");
      }}
      onDoubleClick={() => {
        if (cell.revealed && cell.adjacent > 0) dispatch(index, "chord");
      }}
      onMouseDown={(event) => {
        if (event.button === 1) {
          event.preventDefault();
          dispatch(index, "chord");
          armSuppress();
          return;
        }
        if (event.buttons === 3) {
          dispatch(index, "chord");
          armSuppress();
          return;
        }
        if (event.button === 0 && !cell.revealed) onPressChange(true);
      }}
      onMouseUp={() => onPressChange(false)}
      onMouseLeave={() => onPressChange(false)}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onPressChange(false);
        revealFromCell();
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (touch === undefined) return;
        touchStart.current = { x: touch.clientX, y: touch.clientY };
        touchMoved.current = false;
        longPressed.current = false;
        if (!cell.revealed) onPressChange(true);
        clearLongPress();
        longPressTimer.current = setTimeout(() => {
          longPressed.current = true;
          onPressChange(false);
          if (!cell.revealed) dispatch(index, "mark");
        }, LONG_PRESS_MS);
      }}
      onTouchMove={(event) => {
        const touch = event.touches[0];
        const start = touchStart.current;
        if (touch === undefined || start === null) return;
        if (Math.abs(touch.clientX - start.x) > MOVE_TOLERANCE || Math.abs(touch.clientY - start.y) > MOVE_TOLERANCE) {
          touchMoved.current = true;
          clearLongPress();
        }
      }}
      onTouchEnd={(event) => {
        event.preventDefault();
        clearLongPress();
        onPressChange(false);
        if (!longPressed.current && !touchMoved.current) revealFromCell();
        armSuppress();
        touchStart.current = null;
      }}
    >
      {openNumber && (
        <span style={{ color: NUMBER_COLORS[cell.adjacent], fontSize: Math.round(size * 0.62) }} className="font-black leading-none">
          {cell.adjacent}
        </span>
      )}
      {showMine && <MineIcon size={Math.round(size * 0.72)} danger={struck} />}
      {!cell.revealed && cell.mark === "flag" && <FlagIcon size={Math.round(size * 0.7)} />}
      {!cell.revealed && cell.mark === "question" && (
        <span style={{ fontSize: Math.round(size * 0.6) }} className="font-black leading-none text-slate-100">
          ?
        </span>
      )}
      {wrongFlag && (
        <span className="absolute inset-0 flex items-center justify-center text-rose-600" style={{ fontSize: Math.round(size * 0.9) }}>
          ✕
        </span>
      )}
    </button>
  );
}

const CellButton = memo(CellButtonImpl);

export function BoardGrid({
  board,
  size,
  onPressChange,
}: {
  board: Board;
  size: number;
  onPressChange: (pressing: boolean) => void;
}) {
  const { commands } = useGame();
  const dispatch = useCallback<Dispatch>((index, action) => {
    commands.run(action, { index });
  }, [commands]);

  const blockContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  return (
    <div
      className="grid touch-none"
      onContextMenu={blockContextMenu}
      style={{
        gridTemplateColumns: `repeat(${board.cols}, ${size}px)`,
        gap: "1px",
        background: "#aeb8c6",
        padding: "1px",
      }}
    >
      {board.cells.map((cell, index) => (
        <CellButton
          key={index}
          index={index}
          cell={cell}
          status={board.status}
          struck={board.struckIndex === index}
          size={size}
          dispatch={dispatch}
          onPressChange={onPressChange}
        />
      ))}
    </div>
  );
}
