import { useLayoutEffect, useRef, useState } from "react";

import type { ActiveView } from "../../store";
import type { CellKind, Dir } from "../../sokoban";

function useCellSize(cols: number, rows: number): { ref: React.RefObject<HTMLDivElement | null>; cell: number } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [cell, setCell] = useState(34);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const next = Math.floor(Math.min((rect.width - 18) / cols, (rect.height - 18) / rows));
      setCell(Math.max(18, Math.min(64, next)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [cols, rows]);
  return { ref, cell };
}

function Tile({ kind, cell }: { kind: CellKind; cell: number }) {
  if (kind === "wall") {
    return (
      <div
        style={{
          width: cell,
          height: cell,
          background: "linear-gradient(180deg, #3a2f22 0%, #241b12 55%, #1c150d 100%)",
          borderTop: "2px solid #4d3f2d",
          borderLeft: "1px solid #4a3c2b",
          boxShadow: "inset 0 -3px 6px rgba(0,0,0,0.55)",
        }}
      />
    );
  }
  const base =
    kind === "goal"
      ? "radial-gradient(circle at 50% 45%, rgba(245,178,60,0.20), rgba(58,48,34,0) 62%)"
      : "none";
  return (
    <div
      style={{
        width: cell,
        height: cell,
        background: base,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)",
      }}
    >
      {kind === "goal" ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              width: cell * 0.42,
              height: cell * 0.42,
              borderRadius: "50%",
              border: `${Math.max(2, cell * 0.06)}px solid #d99a35`,
              boxShadow: "0 0 8px rgba(245,178,60,0.55), inset 0 0 5px rgba(255,214,132,0.6)",
              background: "radial-gradient(circle, rgba(255,205,120,0.35), rgba(255,205,120,0) 70%)",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function Crate({ cell, onGoal }: { cell: number; onGoal: boolean }) {
  const r = Math.max(3, cell * 0.13);
  const inset = cell * 0.12;
  return (
    <div
      style={{
        position: "absolute",
        inset: cell * 0.07,
        borderRadius: r,
        background: onGoal
          ? "linear-gradient(155deg, #e5a555 0%, #c07e3c 60%, #a86527 100%)"
          : "linear-gradient(155deg, #c88a4c 0%, #a5652f 60%, #8a5223 100%)",
        border: `${Math.max(2, cell * 0.05)}px solid ${onGoal ? "#7d4d1f" : "#6f4420"}`,
        boxShadow: onGoal
          ? `0 0 ${cell * 0.5}px rgba(245,178,60,0.6), inset 0 ${cell * 0.06}px ${cell * 0.12}px rgba(255,232,190,0.35), inset 0 -${cell * 0.08}px ${cell * 0.12}px rgba(0,0,0,0.35)`
          : `0 ${cell * 0.05}px ${cell * 0.12}px rgba(0,0,0,0.4), inset 0 ${cell * 0.06}px ${cell * 0.1}px rgba(255,224,180,0.28), inset 0 -${cell * 0.08}px ${cell * 0.12}px rgba(0,0,0,0.32)`,
        transition: "background 160ms ease, box-shadow 200ms ease, border-color 160ms ease",
      }}
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
        <g stroke={onGoal ? "#8a561f" : "#6f4420"} strokeWidth={5} fill="none" opacity={0.85}>
          <rect x={inset * 6} y={inset * 6} width={100 - inset * 12} height={100 - inset * 12} rx={4} />
          <line x1={inset * 6} y1={inset * 6} x2={100 - inset * 6} y2={100 - inset * 6} />
          <line x1={100 - inset * 6} y1={inset * 6} x2={inset * 6} y2={100 - inset * 6} />
        </g>
        <g stroke="rgba(255,230,190,0.30)" strokeWidth={2} fill="none">
          <line x1={inset * 6} y1={inset * 6} x2={100 - inset * 6} y2={100 - inset * 6} />
          <line x1={100 - inset * 6} y1={inset * 6} x2={inset * 6} y2={100 - inset * 6} />
        </g>
      </svg>
    </div>
  );
}

function Keeper({ cell, dir }: { cell: number; dir: Dir | null }) {
  const flip = dir === "L";
  return (
    <div
      style={{
        position: "absolute",
        inset: cell * 0.08,
        display: "grid",
        placeItems: "center",
        transform: flip ? "scaleX(-1)" : undefined,
        filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))",
      }}
    >
      <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
        <ellipse cx="12" cy="21.2" rx="6.2" ry="1.5" fill="rgba(0,0,0,0.32)" />
        <rect x="8.4" y="16.5" width="2.6" height="4" rx="1" fill="#2c231a" />
        <rect x="13" y="16.5" width="2.6" height="4" rx="1" fill="#2c231a" />
        <rect x="6.6" y="10.6" width="10.8" height="8.4" rx="3.4" fill="#dd8b32" />
        <rect x="6.6" y="10.6" width="10.8" height="8.4" rx="3.4" fill="none" stroke="#a5641f" strokeWidth="0.7" />
        <rect x="6.6" y="14.4" width="10.8" height="1.7" fill="#3b2c1c" opacity="0.55" />
        <circle cx="12" cy="7.6" r="3.5" fill="#f3d6a2" />
        <circle cx="12" cy="7.6" r="3.5" fill="none" stroke="#c9a877" strokeWidth="0.5" />
        <path d="M8.2 6.6c0.6-2.4 7-2.4 7.6 0 -1.2-0.9-6.4-0.9-7.6 0z" fill="#33291d" />
        <circle cx="10.7" cy="7.9" r="0.55" fill="#2a2018" />
        <circle cx="13.3" cy="7.9" r="0.55" fill="#2a2018" />
      </svg>
    </div>
  );
}

function toXY(pos: number, cols: number): { x: number; y: number } {
  return { x: pos % cols, y: Math.floor(pos / cols) };
}

export function Board({ active }: { active: ActiveView }) {
  const { width: cols, height: rows, cells, player, crates, lastDir, solved } = active;
  const { ref, cell } = useCellSize(cols, rows);
  const goalSet = new Set<number>();
  cells.forEach((kind, i) => {
    if (kind === "goal") goalSet.add(i);
  });
  const boardW = cols * cell;
  const boardH = rows * cell;
  const playerXY = toXY(player, cols);

  return (
    <div ref={ref} className="grid min-h-0 w-full flex-1 place-items-center overflow-hidden">
      <div
        key={active.index}
        style={{
          position: "relative",
          width: boardW,
          height: boardH,
          borderRadius: cell * 0.28,
          padding: 0,
          background: "linear-gradient(135deg, #2f2a20, #211c15)",
          boxShadow: solved
            ? "0 0 0 2px rgba(245,178,60,0.7), 0 18px 44px rgba(0,0,0,0.6), 0 0 46px rgba(245,178,60,0.35)"
            : "0 0 0 2px rgba(84,68,44,0.7), 0 18px 40px rgba(0,0,0,0.55)",
          transition: "box-shadow 300ms ease",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
            gridTemplateRows: `repeat(${rows}, ${cell}px)`,
          }}
        >
          {cells.map((kind, i) => (
            <Tile key={i} kind={kind} cell={cell} />
          ))}
        </div>

        {crates.map((pos, id) => {
          const { x, y } = toXY(pos, cols);
          return (
            <div
              key={id}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: cell,
                height: cell,
                transform: `translate(${x * cell}px, ${y * cell}px)`,
                transition: "transform 150ms cubic-bezier(0.34, 1.2, 0.64, 1)",
                willChange: "transform",
              }}
            >
              <Crate cell={cell} onGoal={goalSet.has(pos)} />
            </div>
          );
        })}

        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: cell,
            height: cell,
            transform: `translate(${playerXY.x * cell}px, ${playerXY.y * cell}px)`,
            transition: "transform 140ms cubic-bezier(0.34, 1.1, 0.64, 1)",
            willChange: "transform",
            zIndex: 2,
          }}
        >
          <Keeper cell={cell} dir={lastDir} />
        </div>
      </div>
    </div>
  );
}
